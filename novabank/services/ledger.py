"""
Double-entry transfer service.

Every money movement:
1. Locks involved accounts (SELECT … FOR UPDATE on Postgres, ordered by id)
2. Inserts an immutable Transaction header
3. Inserts balanced LedgerEntry rows (sum debits == sum credits)
4. Updates balance_cache to match the ledger
5. Rolls back the whole unit on any failure

Customer balances use liability convention: CREDIT raises balance, DEBIT lowers it.
"""

from __future__ import annotations

import secrets
import string
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from sqlalchemy import select
from sqlalchemy.orm import Session

from novabank.config import IS_POSTGRES
from novabank.models import Account, AuditLog, LedgerEntry, Notification, Transaction
from novabank.services.fraud import evaluate_transfer_rules

TWOPLACES = Decimal("0.01")
SYSTEM_ACCOUNT_NUMBER = "00000000"


class LedgerError(Exception):
    pass


def money(value) -> Decimal:
    try:
        amount = Decimal(str(value)).quantize(TWOPLACES, rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError) as exc:
        raise LedgerError("Invalid amount") from exc
    if amount <= 0:
        raise LedgerError("Amount must be greater than zero")
    return amount


def fmt(amount: Decimal) -> Decimal:
    return amount.quantize(TWOPLACES)


def new_reference() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "TXN-" + "".join(secrets.choice(alphabet) for _ in range(8))


def new_account_number(db: Session) -> str:
    while True:
        number = "".join(secrets.choice(string.digits) for _ in range(8))
        if number[0] == "0":
            continue
        exists = db.scalar(select(Account.id).where(Account.account_number == number))
        if not exists:
            return number


def new_customer_id(db: Session) -> str:
    from novabank.models import User

    while True:
        cid = "NB-" + "".join(secrets.choice(string.digits) for _ in range(5))
        if not db.scalar(select(User.id).where(User.customer_id == cid)):
            return cid


def new_card_number(db: Session) -> str:
    from novabank.models import Card

    while True:
        number = "4" + "".join(secrets.choice(string.digits) for _ in range(15))
        if not db.scalar(select(Card.id).where(Card.card_number == number)):
            return number


def mask_card(number: str) -> str:
    return "**** **** **** " + number[-4:]


def ensure_system_account(db: Session) -> Account:
    acct = db.scalar(select(Account).where(Account.account_number == SYSTEM_ACCOUNT_NUMBER))
    if acct:
        return acct
    acct = Account(
        account_number=SYSTEM_ACCOUNT_NUMBER,
        type="SYSTEM",
        balance_cache=Decimal("0.00"),
        status="ACTIVE",
        user_id=None,
    )
    db.add(acct)
    db.flush()
    return acct


def _lock_accounts(db: Session, *account_ids: int) -> dict[int, Account]:
    """Lock accounts in ascending id order to avoid deadlocks."""
    ids = sorted(set(account_ids))
    q = select(Account).where(Account.id.in_(ids)).order_by(Account.id)
    if IS_POSTGRES:
        q = q.with_for_update()
    rows = list(db.scalars(q))
    if len(rows) != len(ids):
        raise LedgerError("Account not found")
    return {a.id: a for a in rows}


def _apply_balance(account: Account, side: str, amount: Decimal) -> None:
    bal = Decimal(str(account.balance_cache))
    if side == "CREDIT":
        account.balance_cache = fmt(bal + amount)
    else:
        account.balance_cache = fmt(bal - amount)


def _post_balanced(
    db: Session,
    *,
    kind: str,
    created_by: int | None,
    note: str | None,
    legs: list[tuple[Account, str, Decimal]],
    idempotency_key: str | None = None,
) -> Transaction:
    """
    legs: list of (account, side, amount). Must have equal debit and credit totals.
    """
    debit_total = sum((amt for _, side, amt in legs if side == "DEBIT"), Decimal("0"))
    credit_total = sum((amt for _, side, amt in legs if side == "CREDIT"), Decimal("0"))
    if fmt(debit_total) != fmt(credit_total):
        raise LedgerError("Unbalanced ledger entry")

    if idempotency_key:
        existing = db.scalar(
            select(Transaction).where(Transaction.idempotency_key == idempotency_key)
        )
        if existing:
            return existing

    txn = Transaction(
        reference=new_reference(),
        idempotency_key=idempotency_key,
        kind=kind,
        status="POSTED",
        note=note,
        created_by=created_by,
    )
    db.add(txn)
    db.flush()

    for account, side, amount in legs:
        if account.status != "ACTIVE" and account.type != "SYSTEM":
            raise LedgerError(f"Account {account.account_number} is frozen")
        db.add(
            LedgerEntry(
                transaction_id=txn.id,
                account_id=account.id,
                side=side,
                amount=fmt(amount),
            )
        )
        if account.type != "SYSTEM":
            # Check overdraft before applying debit
            if side == "DEBIT":
                if Decimal(str(account.balance_cache)) < amount:
                    raise LedgerError("Insufficient funds")
            _apply_balance(account, side, amount)

    return txn


def deposit(
    db: Session,
    user_id: int,
    account_id: int,
    amount_raw,
    note: str | None = None,
    idempotency_key: str | None = None,
) -> Transaction:
    amount = money(amount_raw)
    system = ensure_system_account(db)
    locked = _lock_accounts(db, account_id, system.id)
    account = locked[account_id]
    if account.user_id != user_id:
        raise LedgerError("Account not found")

    txn = _post_balanced(
        db,
        kind="DEPOSIT",
        created_by=user_id,
        note=note,
        legs=[
            (system, "DEBIT", amount),
            (account, "CREDIT", amount),
        ],
        idempotency_key=idempotency_key,
    )
    db.add(
        Notification(
            user_id=user_id,
            title="Deposit received",
            message=f"{fmt(amount)} GBP credited.",
        )
    )
    db.add(AuditLog(user_id=user_id, action="DEPOSIT", details=txn.reference))
    db.commit()
    db.refresh(txn)
    return txn


def withdraw(
    db: Session,
    user_id: int,
    account_id: int,
    amount_raw,
    note: str | None = None,
    idempotency_key: str | None = None,
) -> Transaction:
    amount = money(amount_raw)
    system = ensure_system_account(db)
    locked = _lock_accounts(db, account_id, system.id)
    account = locked[account_id]
    if account.user_id != user_id:
        raise LedgerError("Account not found")

    txn = _post_balanced(
        db,
        kind="WITHDRAWAL",
        created_by=user_id,
        note=note,
        legs=[
            (account, "DEBIT", amount),
            (system, "CREDIT", amount),
        ],
        idempotency_key=idempotency_key,
    )
    db.add(AuditLog(user_id=user_id, action="WITHDRAWAL", details=txn.reference))
    db.commit()
    db.refresh(txn)
    return txn


def transfer(
    db: Session,
    user_id: int,
    from_account_id: int,
    to_account_number: str,
    amount_raw,
    note: str | None = None,
    idempotency_key: str | None = None,
) -> Transaction:
    amount = money(amount_raw)
    to_account_number = (to_account_number or "").strip()

    dest = db.scalar(select(Account).where(Account.account_number == to_account_number))
    if not dest:
        raise LedgerError("Destination account not found")
    if dest.id == from_account_id:
        raise LedgerError("Cannot transfer to the same account")

    locked = _lock_accounts(db, from_account_id, dest.id)
    source = locked[from_account_id]
    dest = locked[dest.id]
    if source.user_id != user_id:
        raise LedgerError("Account not found")

    flag_reason = evaluate_transfer_rules(db, user_id, source, dest, amount)

    txn = _post_balanced(
        db,
        kind="TRANSFER",
        created_by=user_id,
        note=note,
        legs=[
            (source, "DEBIT", amount),
            (dest, "CREDIT", amount),
        ],
        idempotency_key=idempotency_key,
    )
    if flag_reason:
        txn.flagged = True
        txn.flag_reason = flag_reason

    db.add(AuditLog(user_id=user_id, action="TRANSFER_SENT", details=txn.reference))
    if dest.user_id and dest.user_id != user_id:
        db.add(
            Notification(
                user_id=dest.user_id,
                title="Transfer received",
                message=f"You received {fmt(amount)} GBP (ref {txn.reference}).",
            )
        )
    db.commit()
    db.refresh(txn)
    return txn


def ledger_balance(db: Session, account_id: int) -> Decimal:
    """Recompute balance from immutable ledger (reconciliation check)."""
    entries = db.scalars(
        select(LedgerEntry).where(LedgerEntry.account_id == account_id)
    ).all()
    bal = Decimal("0.00")
    for e in entries:
        amt = Decimal(str(e.amount))
        bal = bal + amt if e.side == "CREDIT" else bal - amt
    return fmt(bal)
