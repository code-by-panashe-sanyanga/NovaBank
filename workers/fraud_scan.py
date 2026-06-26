"""
Offline fraud scan — run on a schedule (cron):

  python -m workers.fraud_scan

Re-evaluates recent transfers and prints flagged references.
"""

from __future__ import annotations

from decimal import Decimal

from sqlalchemy import select

from novabank.database import SessionLocal, init_db
from novabank.models import Account, Transaction
from novabank.services.fraud import evaluate_transfer_rules


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        txns = db.scalars(
            select(Transaction)
            .where(Transaction.kind == "TRANSFER")
            .order_by(Transaction.created_at.desc())
            .limit(100)
        ).all()
        flagged = 0
        for txn in txns:
            if not txn.created_by:
                continue
            debit = next((e for e in txn.entries if e.side == "DEBIT"), None)
            credit = next((e for e in txn.entries if e.side == "CREDIT"), None)
            if not debit or not credit:
                continue
            source = db.get(Account, debit.account_id)
            dest = db.get(Account, credit.account_id)
            if not source or not dest:
                continue
            reason = evaluate_transfer_rules(
                db, txn.created_by, source, dest, Decimal(str(debit.amount))
            )
            if reason and not txn.flagged:
                txn.flagged = True
                txn.flag_reason = reason
                flagged += 1
                print(txn.reference, reason)
        db.commit()
        print(f"flagged {flagged} transfers")
    finally:
        db.close()


if __name__ == "__main__":
    main()
