"""
Simple fraud / anomaly rules for transfers.

Flags (does not block) unusual activity for admin review.
"""

from __future__ import annotations

from decimal import Decimal
from statistics import mean, pstdev

from sqlalchemy import select
from sqlalchemy.orm import Session

from novabank.models import Account, LedgerEntry, Transaction


def evaluate_transfer_rules(
    db: Session,
    user_id: int,
    source: Account,
    dest: Account,
    amount: Decimal,
) -> str | None:
    reasons: list[str] = []

    if amount >= Decimal("2000.00"):
        reasons.append("amount >= 2000")

    recent_txns = list(
        db.scalars(
            select(Transaction)
            .where(Transaction.created_by == user_id, Transaction.kind == "TRANSFER")
            .order_by(Transaction.created_at.desc())
            .limit(10)
        )
    )
    if len(recent_txns) >= 3:
        reasons.append("rapid repeated transfers")

    amounts = list(
        db.scalars(
            select(LedgerEntry.amount)
            .join(Transaction, Transaction.id == LedgerEntry.transaction_id)
            .where(
                LedgerEntry.account_id == source.id,
                LedgerEntry.side == "DEBIT",
                Transaction.kind == "TRANSFER",
            )
            .order_by(LedgerEntry.id.desc())
            .limit(20)
        )
    )
    if len(amounts) >= 5:
        vals = [float(a) for a in amounts]
        avg = mean(vals)
        sd = pstdev(vals) or 1.0
        if float(amount) > avg + 3 * sd:
            reasons.append("amount > 3 stddevs above user average")

    return "; ".join(reasons) if reasons else None
