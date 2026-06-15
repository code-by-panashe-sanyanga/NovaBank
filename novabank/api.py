from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from novabank.auth import (
    check_password,
    create_session,
    get_current_user,
    get_token_jti,
    hash_password,
    make_token,
    rate_limit_auth,
    require_admin,
)
from novabank.database import get_db
from novabank.hub import hub
from novabank.models import (
    Account,
    AuditLog,
    AuthSession,
    Card,
    LedgerEntry,
    LoginHistory,
    Notification,
    Transaction,
    User,
)
from novabank.services.categories import categorise
from novabank.services.ledger import (
    LedgerError,
    deposit,
    fmt,
    ledger_balance,
    mask_card,
    money,
    new_account_number,
    new_card_number,
    new_customer_id,
    transfer,
    withdraw,
)

router = APIRouter()


class RegisterIn(BaseModel):
    fullName: str = Field(min_length=2, max_length=120)
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=128)
    phone: Optional[str] = None


class LoginIn(BaseModel):
    email: str
    password: str


class MoneyIn(BaseModel):
    accountId: int
    amount: str
    note: Optional[str] = None
    idempotencyKey: Optional[str] = None


class TransferIn(BaseModel):
    fromAccountId: int
    toAccountNumber: str
    amount: str
    note: Optional[str] = None
    idempotencyKey: Optional[str] = None


def user_out(u: User) -> dict:
    return {
        "id": u.id,
        "customerId": u.customer_id,
        "fullName": u.full_name,
        "email": u.email,
        "phone": u.phone,
        "role": u.role,
        "dateJoined": u.date_joined.isoformat() if u.date_joined else None,
        "isLocked": u.is_locked,
    }


def account_out(a: Account) -> dict:
    return {
        "id": a.id,
        "accountNumber": a.account_number,
        "sortCode": a.sort_code,
        "type": a.type,
        "balance": str(fmt(Decimal(str(a.balance_cache)))),
        "currency": a.currency,
        "status": a.status,
        "createdAt": a.created_at.isoformat() if a.created_at else None,
    }


def txn_out(t: Transaction) -> dict:
    return {
        "id": t.id,
        "reference": t.reference,
        "type": t.kind,
        "status": t.status,
        "note": t.note,
        "category": t.category,
        "createdAt": t.created_at.isoformat() if t.created_at else None,
        "flagged": t.flagged,
        "flagReason": t.flag_reason,
        "amount": str(
            fmt(
                sum(
                    (Decimal(str(e.amount)) for e in t.entries if e.side == "DEBIT"),
                    Decimal("0"),
                )
            )
        ),
    }


@router.get("/health")
def health():
    return {"ok": True}


@router.get("/ready")
def ready(db: Annotated[Session, Depends(get_db)]):
    db.execute(select(1))
    return {"ok": True}


@router.post("/auth/register")
def register(body: RegisterIn, request: Request, db: Annotated[Session, Depends(get_db)]):
    rate_limit_auth(request)
    email = body.email.lower()
    if db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(400, "Email already registered")

    user = User(
        customer_id=new_customer_id(db),
        full_name=body.fullName.strip(),
        email=email,
        password_hash=hash_password(body.password),
        phone=body.phone,
        role="CUSTOMER",
    )
    db.add(user)
    db.flush()

    current = Account(
        account_number=new_account_number(db),
        type="CURRENT",
        balance_cache=Decimal("0.00"),
        user_id=user.id,
    )
    savings = Account(
        account_number=new_account_number(db),
        type="SAVINGS",
        balance_cache=Decimal("0.00"),
        user_id=user.id,
    )
    db.add_all([current, savings])
    db.flush()
    now = datetime.utcnow()
    db.add(
        Card(
            card_number=new_card_number(db),
            expiry_month=now.month,
            expiry_year=now.year + 3,
            user_id=user.id,
            account_id=current.id,
        )
    )
    db.add(
        Notification(
            user_id=user.id,
            title="Welcome to NovaBank",
            message="Your accounts are ready.",
        )
    )
    db.add(AuditLog(user_id=user.id, action="REGISTER", details=email))
    token, jti = make_token(user.id, user.role)
    create_session(db, user.id, jti, request)
    db.commit()
    db.refresh(user)
    return {"token": token, "user": user_out(user)}


@router.post("/auth/login")
def login(body: LoginIn, request: Request, db: Annotated[Session, Depends(get_db)]):
    rate_limit_auth(request)
    email = body.email.lower()
    user = db.scalar(select(User).where(User.email == email))
    ok = bool(user and check_password(body.password, user.password_hash))
    if user:
        db.add(
            LoginHistory(
                ip_address=request.client.host if request.client else "",
                user_agent=(request.headers.get("user-agent") or "")[:300],
                success=ok,
                user_id=user.id,
            )
        )
        db.commit()
    if not ok:
        raise HTTPException(401, "Invalid email or password")
    if user.is_locked:
        raise HTTPException(403, "Account locked")
    token, jti = make_token(user.id, user.role)
    create_session(db, user.id, jti, request)
    db.commit()
    return {"token": token, "user": user_out(user)}


@router.get("/auth/me")
def me(user: Annotated[User, Depends(get_current_user)]):
    return {"user": user_out(user)}


@router.post("/auth/logout")
def logout(
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    jti: Annotated[Optional[str], Depends(get_token_jti)],
):
    if jti:
        session = db.scalar(select(AuthSession).where(AuthSession.jti == jti))
        if session and session.user_id == user.id:
            session.revoked = True
            db.commit()
    return {"ok": True}


@router.get("/dashboard")
def dashboard(user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]):
    accounts = db.scalars(
        select(Account).where(Account.user_id == user.id).order_by(Account.type)
    ).all()
    account_ids = [a.id for a in accounts]
    recent: List[Transaction] = []
    if account_ids:
        entry_txn_ids = db.scalars(
            select(LedgerEntry.transaction_id)
            .where(LedgerEntry.account_id.in_(account_ids))
            .order_by(LedgerEntry.id.desc())
            .limit(20)
        ).all()
        if entry_txn_ids:
            recent = list(
                db.scalars(
                    select(Transaction)
                    .where(Transaction.id.in_(list(dict.fromkeys(entry_txn_ids))))
                    .order_by(Transaction.created_at.desc())
                    .limit(5)
                )
            )
            for t in recent:
                _ = t.entries  # load
    unread = db.scalars(
        select(Notification).where(Notification.user_id == user.id, Notification.is_read.is_(False))
    ).all()
    total = sum((Decimal(str(a.balance_cache)) for a in accounts), Decimal("0"))
    return {
        "accounts": [account_out(a) for a in accounts],
        "totalBalance": str(fmt(total)),
        "recentTransactions": [txn_out(t) for t in recent],
        "unreadNotifications": len(unread),
    }


@router.get("/accounts")
def accounts(user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]):
    rows = db.scalars(
        select(Account).where(Account.user_id == user.id).order_by(Account.type)
    ).all()
    return {"accounts": [account_out(a) for a in rows]}


@router.get("/accounts/{account_id}")
def account_detail(
    account_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    account = db.get(Account, account_id)
    if not account or account.user_id != user.id:
        raise HTTPException(404, "Not found")
    computed = ledger_balance(db, account.id)
    return {
        "account": account_out(account),
        "ledgerBalance": str(computed),
        "cacheMatchesLedger": computed == Decimal(str(account.balance_cache)),
    }


@router.get("/accounts/{account_id}/transactions")
def account_transactions(
    account_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    account = db.get(Account, account_id)
    if not account or account.user_id != user.id:
        raise HTTPException(404, "Not found")
    txn_ids = db.scalars(
        select(LedgerEntry.transaction_id)
        .where(LedgerEntry.account_id == account_id)
        .order_by(LedgerEntry.id.desc())
        .limit(100)
    ).all()
    txns = []
    if txn_ids:
        txns = list(
            db.scalars(
                select(Transaction)
                .where(Transaction.id.in_(list(dict.fromkeys(txn_ids))))
                .order_by(Transaction.created_at.desc())
            )
        )
        for t in txns:
            _ = t.entries
    return {"transactions": [txn_out(t) for t in txns]}


@router.get("/accounts/{account_id}/spending")
def spending_chart(
    account_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Monthly debit totals for Chart.js (last 6 months)."""
    account = db.get(Account, account_id)
    if not account or account.user_id != user.id:
        raise HTTPException(404, "Not found")
    entries = db.scalars(
        select(LedgerEntry).where(
            LedgerEntry.account_id == account_id, LedgerEntry.side == "DEBIT"
        )
    ).all()
    buckets: dict[str, Decimal] = {}
    for e in entries:
        key = e.created_at.strftime("%Y-%m")
        buckets[key] = buckets.get(key, Decimal("0")) + Decimal(str(e.amount))
    labels = sorted(buckets.keys())[-6:]
    return {
        "labels": labels,
        "values": [str(fmt(buckets[k])) for k in labels],
    }


async def _notify_ws(user_id: int, event: str, data: dict):
    await hub.send_user(user_id, event, data)


@router.post("/transactions/deposit")
async def api_deposit(
    body: MoneyIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        txn = deposit(db, user.id, body.accountId, body.amount, body.note, body.idempotencyKey)
    except LedgerError as exc:
        raise HTTPException(400, str(exc))
    txn.category = categorise(body.note, "DEPOSIT")
    db.commit()
    await hub.send_user(user.id, "balance", {"reference": txn.reference})
    await hub.send_user(
        user.id,
        "notification",
        {"title": "Deposit received", "message": f"£{body.amount}"},
    )
    return {"reference": txn.reference, "type": txn.kind, "category": txn.category}


def _assert_spend_allowed(
    db: Session, user: User, account_id: int, note: Optional[str], amount: Decimal
) -> str:
    """Block spend if card is frozen, category locked, or limits exceeded."""
    cat = categorise(note, "WITHDRAWAL")
    text = (note or "").lower()
    cards = db.scalars(select(Card).where(Card.user_id == user.id, Card.account_id == account_id)).all()
    for card in cards:
        if card.is_frozen:
            raise HTTPException(400, "Card is frozen")
        if "atm" in text and not card.atm_enabled:
            raise HTTPException(400, "ATM withdrawals are disabled on this card")
        if any(w in text for w in ("online", "amazon", "ebay")) and not card.online_enabled:
            raise HTTPException(400, "Online payments are disabled on this card")
        if any(w in text for w in ("abroad", "international", "foreign")) and not card.international_enabled:
            raise HTTPException(400, "International payments are disabled on this card")
        blocked = [c.strip() for c in (card.blocked_categories or "").split(",") if c.strip()]
        if cat in blocked:
            raise HTTPException(400, f"Spending on {cat} is blocked on this card")
        if card.per_txn_limit is not None and amount > Decimal(str(card.per_txn_limit)):
            raise HTTPException(400, "Over per-transaction card limit")
        if card.daily_limit is not None:
            from datetime import datetime

            start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
            today_debit = Decimal("0")
            entries = db.scalars(
                select(LedgerEntry).where(
                    LedgerEntry.account_id == account_id,
                    LedgerEntry.side == "DEBIT",
                    LedgerEntry.created_at >= start,
                )
            ).all()
            for e in entries:
                today_debit += Decimal(str(e.amount))
            if today_debit + amount > Decimal(str(card.daily_limit)):
                raise HTTPException(400, "Over daily card limit")
    return cat


@router.post("/transactions/withdraw")
async def api_withdraw(
    body: MoneyIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    amount = money(body.amount)
    cat = _assert_spend_allowed(db, user, body.accountId, body.note, amount)
    try:
        txn = withdraw(db, user.id, body.accountId, body.amount, body.note, body.idempotencyKey)
    except LedgerError as exc:
        raise HTTPException(400, str(exc))
    txn.category = cat
    db.commit()

    from novabank.features import apply_round_up

    round_ref = apply_round_up(db, user, body.accountId, amount)
    await hub.send_user(user.id, "balance", {"reference": txn.reference})
    await hub.send_user(
        user.id,
        "notification",
        {"title": "Card payment", "message": f"£{body.amount}" + (f" · {body.note}" if body.note else "")},
    )
    return {
        "reference": txn.reference,
        "type": txn.kind,
        "category": txn.category,
        "roundUpReference": round_ref,
    }


@router.post("/transactions/transfer")
async def api_transfer(
    body: TransferIn,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    try:
        txn = transfer(
            db,
            user.id,
            body.fromAccountId,
            body.toAccountNumber,
            body.amount,
            body.note,
            body.idempotencyKey,
        )
    except LedgerError as exc:
        raise HTTPException(400, str(exc))
    txn.category = categorise(body.note, "TRANSFER")
    db.commit()
    await hub.send_user(user.id, "balance", {"reference": txn.reference})
    dest = db.scalar(select(Account).where(Account.account_number == body.toAccountNumber.strip()))
    if dest and dest.user_id and dest.user_id != user.id:
        await hub.send_user(
            dest.user_id,
            "notification",
            {"title": "Money received", "message": f"£{body.amount} from {user.full_name}"},
        )
    return {
        "reference": txn.reference,
        "type": txn.kind,
        "flagged": txn.flagged,
        "flagReason": txn.flag_reason,
        "category": txn.category,
    }


@router.get("/cards")
def cards(user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]):
    rows = db.scalars(select(Card).where(Card.user_id == user.id)).all()
    return {
        "cards": [
            {
                "id": c.id,
                "maskedNumber": mask_card(c.card_number),
                "expiryMonth": c.expiry_month,
                "expiryYear": c.expiry_year,
                "isFrozen": c.is_frozen,
                "accountId": c.account_id,
                "blockedCategories": [
                    x for x in (c.blocked_categories or "").split(",") if x
                ],
                "dailyLimit": str(c.daily_limit) if c.daily_limit is not None else None,
                "perTxnLimit": str(c.per_txn_limit) if c.per_txn_limit is not None else None,
                "contactlessEnabled": c.contactless_enabled,
                "onlineEnabled": c.online_enabled,
                "atmEnabled": c.atm_enabled,
                "internationalEnabled": c.international_enabled,
            }
            for c in rows
        ]
    }


@router.post("/cards/{card_id}/freeze")
def freeze_card(
    card_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    card = db.get(Card, card_id)
    if not card or card.user_id != user.id:
        raise HTTPException(404, "Not found")
    card.is_frozen = True
    db.add(AuditLog(user_id=user.id, action="CARD_FROZEN", details=mask_card(card.card_number)))
    db.commit()
    return {"ok": True, "isFrozen": True}


@router.post("/cards/{card_id}/unfreeze")
def unfreeze_card(
    card_id: int,
    user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    card = db.get(Card, card_id)
    if not card or card.user_id != user.id:
        raise HTTPException(404, "Not found")
    card.is_frozen = False
    db.add(AuditLog(user_id=user.id, action="CARD_UNFROZEN", details=mask_card(card.card_number)))
    db.commit()
    return {"ok": True, "isFrozen": False}


@router.get("/notifications")
def notifications(user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]):
    rows = db.scalars(
        select(Notification)
        .where(Notification.user_id == user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    ).all()
    return {
        "notifications": [
            {
                "id": n.id,
                "title": n.title,
                "message": n.message,
                "isRead": n.is_read,
                "createdAt": n.created_at.isoformat() if n.created_at else None,
            }
            for n in rows
        ]
    }


@router.patch("/notifications/read-all")
def read_all(user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]):
    rows = db.scalars(
        select(Notification).where(Notification.user_id == user.id, Notification.is_read.is_(False))
    ).all()
    for n in rows:
        n.is_read = True
    db.commit()
    return {"ok": True}


@router.get("/admin/customers")
def admin_customers(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
    search: str = "",
):
    q = select(User).where(User.role == "CUSTOMER")
    if search.strip():
        like = f"%{search.strip()}%"
        q = q.where(
            or_(
                User.email.like(like),
                User.full_name.like(like),
                User.customer_id.like(like),
            )
        )
    rows = db.scalars(q.order_by(User.date_joined.desc()).limit(50)).all()
    return {"customers": [user_out(u) for u in rows]}


@router.get("/admin/transactions")
def admin_transactions(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    rows = db.scalars(select(Transaction).order_by(Transaction.created_at.desc()).limit(100)).all()
    for t in rows:
        _ = t.entries
    return {"transactions": [txn_out(t) for t in rows]}


@router.get("/admin/audit-logs")
def admin_audit(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    rows = db.scalars(select(AuditLog).order_by(AuditLog.created_at.desc()).limit(100)).all()
    return {
        "logs": [
            {
                "id": r.id,
                "action": r.action,
                "details": r.details,
                "createdAt": r.created_at.isoformat() if r.created_at else None,
                "userId": r.user_id,
            }
            for r in rows
        ]
    }


@router.get("/admin/flags")
def admin_flags(
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    rows = db.scalars(
        select(Transaction)
        .where(Transaction.flagged.is_(True))
        .order_by(Transaction.created_at.desc())
        .limit(50)
    ).all()
    for t in rows:
        _ = t.entries
    return {"transactions": [txn_out(t) for t in rows]}


@router.post("/admin/accounts/{account_id}/freeze")
def admin_freeze(
    account_id: int,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    account = db.get(Account, account_id)
    if not account:
        raise HTTPException(404, "Not found")
    account.status = "FROZEN"
    db.add(AuditLog(user_id=admin.id, action="ACCOUNT_FROZEN", details=account.account_number))
    db.commit()
    return {"ok": True}


@router.post("/admin/accounts/{account_id}/unfreeze")
def admin_unfreeze(
    account_id: int,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    account = db.get(Account, account_id)
    if not account:
        raise HTTPException(404, "Not found")
    account.status = "ACTIVE"
    db.add(AuditLog(user_id=admin.id, action="ACCOUNT_UNFROZEN", details=account.account_number))
    db.commit()
    return {"ok": True}
