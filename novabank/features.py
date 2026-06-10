"""
Monzo / Revolut-style product features on top of the ledger:

- Savings pots
- Round-ups into a pot
- Payment requests (approve to pay)
- Spending insights + financial health score
- FX convert via Frankfurter (real ECB rates)
"""

from __future__ import annotations

from decimal import Decimal, ROUND_CEILING
from typing import Annotated, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from novabank.auth import get_current_user
from novabank.database import get_db
from novabank.hub import hub
from novabank.models import Account, Notification, PaymentRequest, Pot, Transaction, User
from novabank.services.categories import categorise
from novabank.services.fx import convert, get_rate
from novabank.services.ledger import (
    LedgerError,
    fmt,
    money,
    new_account_number,
    transfer,
    _lock_accounts,
    _post_balanced,
    ensure_system_account,
)

router = APIRouter(tags=["features"])


class PotIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    targetAmount: Optional[str] = None


class PotFundIn(BaseModel):
    fromAccountId: int
    amount: str


class RoundUpSettingsIn(BaseModel):
    enabled: bool
    potId: Optional[int] = None


class PaymentRequestIn(BaseModel):
    toEmail: str
    amount: str
    note: Optional[str] = None


class FxConvertIn(BaseModel):
    fromAccountId: int
    toCurrency: str = Field(min_length=3, max_length=3)
    amount: str


class CardControlsIn(BaseModel):
    blockedCategories: List[str] = []


def _pot_out(db: Session, pot: Pot) -> dict:
    acct = db.get(Account, pot.account_id)
    bal = Decimal(str(acct.balance_cache)) if acct else Decimal("0")
    target = Decimal(str(pot.target_amount)) if pot.target_amount is not None else None
    return {
        "id": pot.id,
        "name": pot.name,
        "balance": str(fmt(bal)),
        "targetAmount": str(fmt(target)) if target is not None else None,
        "progress": float(bal / target) if target and target > 0 else None,
        "accountId": pot.account_id,
        "accountNumber": acct.account_number if acct else None,
    }


@router.get("/pots")
def list_pots(user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]):
    pots = db.scalars(select(Pot).where(Pot.user_id == user.id).order_by(Pot.id)).all()
    return {"pots": [_pot_out(db, p) for p in pots]}


@router.post("/pots")
def create_pot(
    body: PotIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    acct = Account(
        account_number=new_account_number(db),
        type="POT",
        balance_cache=Decimal("0.00"),
        currency="GBP",
        user_id=user.id,
    )
    db.add(acct)
    db.flush()
    pot = Pot(
        name=body.name.strip(),
        target_amount=money(body.targetAmount) if body.targetAmount else None,
        user_id=user.id,
        account_id=acct.id,
    )
    db.add(pot)
    db.commit()
    db.refresh(pot)
    return {"pot": _pot_out(db, pot)}


@router.post("/pots/{pot_id}/add")
async def fund_pot(
    pot_id: int,
    body: PotFundIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    pot = db.get(Pot, pot_id)
    if not pot or pot.user_id != user.id:
        raise HTTPException(404, "Pot not found")
    pot_acct = db.get(Account, pot.account_id)
    try:
        txn = transfer(
            db,
            user.id,
            body.fromAccountId,
            pot_acct.account_number,
            body.amount,
            note=f"Pot: {pot.name}",
        )
    except LedgerError as exc:
        raise HTTPException(400, str(exc))
    txn.category = "savings"
    db.commit()
    await hub.send_user(user.id, "notification", {"title": "Pot topped up", "message": pot.name})
    await hub.send_user(user.id, "balance", {"reference": txn.reference})
    return {"reference": txn.reference, "pot": _pot_out(db, pot)}


@router.get("/settings/round-ups")
def get_round_ups(user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]):
    db.refresh(user)
    return {
        "enabled": bool(getattr(user, "round_ups_enabled", False)),
        "potId": getattr(user, "round_up_pot_id", None),
    }


@router.put("/settings/round-ups")
def set_round_ups(
    body: RoundUpSettingsIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    if body.enabled and body.potId:
        pot = db.get(Pot, body.potId)
        if not pot or pot.user_id != user.id:
            raise HTTPException(400, "Invalid pot")
        user.round_up_pot_id = body.potId
    user.round_ups_enabled = body.enabled
    if not body.enabled:
        user.round_up_pot_id = None
    db.commit()
    return {"ok": True, "enabled": user.round_ups_enabled, "potId": user.round_up_pot_id}


def apply_round_up(db: Session, user: User, from_account_id: int, spent: Decimal) -> Optional[str]:
    """Sweep ceil(spent) − spent into the round-up pot. Returns txn ref or None."""
    if not getattr(user, "round_ups_enabled", False) or not user.round_up_pot_id:
        return None
    pot = db.get(Pot, user.round_up_pot_id)
    if not pot or pot.user_id != user.id:
        return None
    # £3.20 → £0.80; whole pounds skip
    if spent == spent.to_integral_value():
        return None
    whole = spent.to_integral_value(rounding=ROUND_CEILING)
    diff = fmt(whole - spent)
    if diff <= 0:
        return None
    pot_acct = db.get(Account, pot.account_id)
    try:
        txn = transfer(
            db,
            user.id,
            from_account_id,
            pot_acct.account_number,
            str(diff),
            note=f"Round-up → {pot.name}",
        )
        txn.category = "savings"
        db.commit()
        return txn.reference
    except LedgerError:
        return None


@router.post("/payment-requests")
async def create_payment_request(
    body: PaymentRequestIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    amount = money(body.amount)
    payee = db.scalar(select(User).where(User.email == body.toEmail.strip().lower()))
    if not payee or payee.id == user.id:
        raise HTTPException(400, "User not found")
    req = PaymentRequest(
        amount=fmt(amount),
        note=body.note,
        status="PENDING",
        from_user_id=user.id,
        to_user_id=payee.id,
    )
    db.add(req)
    db.add(
        Notification(
            user_id=payee.id,
            title="Payment request",
            message=f"{user.full_name} requested £{fmt(amount)}"
            + (f" — {body.note}" if body.note else ""),
        )
    )
    db.commit()
    db.refresh(req)
    await hub.send_user(
        payee.id,
        "notification",
        {"title": "Payment request", "message": f"£{fmt(amount)} from {user.full_name}"},
    )
    return {"id": req.id, "status": req.status}


@router.get("/payment-requests")
def list_payment_requests(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    incoming = db.scalars(
        select(PaymentRequest)
        .where(PaymentRequest.to_user_id == user.id)
        .order_by(PaymentRequest.created_at.desc())
        .limit(50)
    ).all()
    outgoing = db.scalars(
        select(PaymentRequest)
        .where(PaymentRequest.from_user_id == user.id)
        .order_by(PaymentRequest.created_at.desc())
        .limit(50)
    ).all()

    def row(r: PaymentRequest) -> dict:
        other_id = r.from_user_id if r.to_user_id == user.id else r.to_user_id
        other = db.get(User, other_id)
        return {
            "id": r.id,
            "amount": str(r.amount),
            "note": r.note,
            "status": r.status,
            "direction": "incoming" if r.to_user_id == user.id else "outgoing",
            "counterparty": other.full_name if other else "",
            "createdAt": r.created_at.isoformat() if r.created_at else None,
        }

    return {
        "incoming": [row(r) for r in incoming],
        "outgoing": [row(r) for r in outgoing],
    }


class PayRequestIn(BaseModel):
    fromAccountId: int


@router.post("/payment-requests/{req_id}/pay")
async def pay_request(
    req_id: int,
    body: PayRequestIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    req = db.get(PaymentRequest, req_id)
    if not req or req.to_user_id != user.id:
        raise HTTPException(404, "Not found")
    if req.status != "PENDING":
        raise HTTPException(400, "Request is not pending")
    requester = db.get(User, req.from_user_id)
    dest = db.scalars(
        select(Account).where(
            Account.user_id == requester.id,
            Account.type == "CURRENT",
            Account.currency == "GBP",
        )
    ).first()
    if not dest:
        raise HTTPException(400, "Requester has no current account")
    try:
        txn = transfer(
            db,
            user.id,
            body.fromAccountId,
            dest.account_number,
            str(req.amount),
            note=req.note or "Payment request",
        )
    except LedgerError as exc:
        raise HTTPException(400, str(exc))
    req.status = "PAID"
    req.to_account_id = body.fromAccountId
    req.from_account_id = dest.id
    txn.category = "transfers"
    db.add(
        Notification(
            user_id=requester.id,
            title="Request paid",
            message=f"{user.full_name} paid £{req.amount}",
        )
    )
    db.commit()
    await hub.send_user(requester.id, "notification", {"title": "Request paid", "message": str(req.amount)})
    await hub.send_user(user.id, "balance", {"reference": txn.reference})
    return {"ok": True, "reference": txn.reference}


@router.post("/payment-requests/{req_id}/decline")
async def decline_request(
    req_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    req = db.get(PaymentRequest, req_id)
    if not req or req.to_user_id != user.id:
        raise HTTPException(404, "Not found")
    req.status = "DECLINED"
    db.commit()
    return {"ok": True}


@router.get("/insights")
def insights(user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]):
    accounts = db.scalars(select(Account).where(Account.user_id == user.id)).all()
    ids = [a.id for a in accounts if a.type != "POT"]
    txns = db.scalars(
        select(Transaction)
        .where(Transaction.created_by == user.id)
        .order_by(Transaction.created_at.desc())
        .limit(200)
    ).all()

    by_cat: Dict[str, Decimal] = {}
    for t in txns:
        if t.kind not in ("WITHDRAWAL", "TRANSFER"):
            continue
        cat = t.category or categorise(t.note, t.kind)
        amt = sum((Decimal(str(e.amount)) for e in t.entries if e.side == "DEBIT"), Decimal("0"))
        # only count debits from user's non-pot accounts
        user_debit = False
        for e in t.entries:
            if e.side == "DEBIT" and e.account_id in ids:
                user_debit = True
                amt = Decimal(str(e.amount))
                break
        if not user_debit:
            continue
        by_cat[cat] = by_cat.get(cat, Decimal("0")) + amt

    labels = sorted(by_cat.keys())
    health = financial_health_score(db, user, by_cat, accounts)
    return {
        "categories": {
            "labels": labels,
            "values": [str(fmt(by_cat[k])) for k in labels],
        },
        "healthScore": health,
    }


def financial_health_score(
    db: Session, user: User, by_cat: Dict[str, Decimal], accounts: List[Account]
) -> dict:
    """
    Toy score from your own ledger — not a real credit file.
    Real bureau APIs need commercial contracts; we do not scrape banks.
    """
    score = 70
    reasons = []
    total_bal = sum(
        (Decimal(str(a.balance_cache)) for a in accounts if a.type in ("CURRENT", "SAVINGS", "POT")),
        Decimal("0"),
    )
    if total_bal >= 1000:
        score += 10
        reasons.append("Healthy cash buffer")
    elif total_bal < 50:
        score -= 15
        reasons.append("Low balance")

    gambling = by_cat.get("gambling", Decimal("0"))
    if gambling > 0:
        score -= 20
        reasons.append("Gambling spend detected")

    pots = db.scalars(select(Pot).where(Pot.user_id == user.id)).all()
    if pots:
        score += 5
        reasons.append("Using savings pots")

    score = max(0, min(100, score))
    return {"score": score, "reasons": reasons, "disclaimer": "Not a credit score. Based on NovaBank activity only."}


@router.get("/fx/rate")
def fx_rate(from_currency: str = "GBP", to_currency: str = "EUR"):
    try:
        rate = get_rate(from_currency, to_currency)
    except Exception as exc:
        raise HTTPException(502, f"FX provider error: {exc}")
    return {"from": from_currency.upper(), "to": to_currency.upper(), "rate": str(rate), "source": "Frankfurter/ECB"}


@router.post("/fx/convert")
async def fx_convert(
    body: FxConvertIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """
    Convert account currency using a live Frankfurter (ECB) rate.

    Two balanced postings keep the ledger invariant per currency:
    1) Debit source / credit SYSTEM in the base currency
    2) Debit SYSTEM / credit dest in the quote currency
    """
    amount = money(body.amount)
    source = db.get(Account, body.fromAccountId)
    if not source or source.user_id != user.id:
        raise HTTPException(404, "Account not found")
    if source.type == "POT":
        raise HTTPException(400, "Convert from a current or savings account")
    quote = body.toCurrency.upper()
    if quote == source.currency.upper():
        raise HTTPException(400, "Already in that currency")
    try:
        rate = get_rate(source.currency, quote)
        converted = convert(amount, source.currency, quote)
    except Exception as exc:
        raise HTTPException(502, f"FX provider error: {exc}")

    dest = db.scalars(
        select(Account).where(
            Account.user_id == user.id,
            Account.currency == quote,
            Account.type == "CURRENT",
        )
    ).first()
    if not dest:
        dest = Account(
            account_number=new_account_number(db),
            type="CURRENT",
            balance_cache=Decimal("0.00"),
            currency=quote,
            user_id=user.id,
        )
        db.add(dest)
        db.flush()

    system = ensure_system_account(db)
    base_ccy = source.currency
    try:
        locked = _lock_accounts(db, source.id, dest.id, system.id)
        source = locked[source.id]
        dest = locked[dest.id]
        system = locked[system.id]
        if Decimal(str(source.balance_cache)) < amount:
            raise LedgerError("Insufficient funds")
        txn = _post_balanced(
            db,
            kind="WITHDRAWAL",
            created_by=user.id,
            note=f"FX sell {base_ccy}->{quote} @ {rate}",
            legs=[
                (source, "DEBIT", amount),
                (system, "CREDIT", amount),
            ],
        )
        txn2 = _post_balanced(
            db,
            kind="DEPOSIT",
            created_by=user.id,
            note=f"FX buy {quote}",
            legs=[
                (system, "DEBIT", converted),
                (dest, "CREDIT", converted),
            ],
        )
        txn.category = "transfers"
        txn2.category = "transfers"
        db.add(
            Notification(
                user_id=user.id,
                title="FX conversion",
                message=f"{fmt(amount)} {base_ccy} → {fmt(converted)} {quote}",
            )
        )
        db.commit()
    except LedgerError as exc:
        db.rollback()
        raise HTTPException(400, str(exc))

    await hub.send_user(user.id, "balance", {"reference": txn.reference})
    await hub.send_user(
        user.id,
        "notification",
        {
            "title": "FX conversion",
            "message": f"{fmt(amount)} {base_ccy} → {fmt(converted)} {quote}",
        },
    )
    return {
        "sold": str(fmt(amount)),
        "bought": str(fmt(converted)),
        "rate": str(rate),
        "toAccountNumber": dest.account_number,
        "currency": quote,
    }


@router.patch("/cards/{card_id}/controls")
def card_controls(
    card_id: int,
    body: CardControlsIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    from novabank.models import Card

    card = db.get(Card, card_id)
    if not card or card.user_id != user.id:
        raise HTTPException(404, "Not found")
    blocked = sorted({c.strip().lower() for c in body.blockedCategories if c.strip()})
    card.blocked_categories = ",".join(blocked) if blocked else None
    db.commit()
    return {"ok": True, "blockedCategories": blocked}
