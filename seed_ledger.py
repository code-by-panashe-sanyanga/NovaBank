"""Seed demo users against the ledger schema."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import select

from novabank.auth import hash_password
from novabank.database import SessionLocal, init_db
from novabank.models import Account, Card, Notification, Pot, User
from novabank.services.ledger import deposit, ensure_system_account, new_account_number, new_card_number


def upsert_customer(email: str, name: str, customer_id: str, opening: str, with_pot: bool = False) -> None:
    db = SessionLocal()
    try:
        ensure_system_account(db)
        db.commit()

        user = db.scalar(select(User).where(User.email == email))
        if user:
            print(f"exists {email}")
            return

        user = User(
            customer_id=customer_id,
            full_name=name,
            email=email,
            password_hash=hash_password("Password123"),
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
        if with_pot:
            pot_acct = Account(
                account_number=new_account_number(db),
                type="POT",
                balance_cache=Decimal("0.00"),
                user_id=user.id,
            )
            db.add(pot_acct)
            db.flush()
            pot = Pot(
                name="Holiday",
                target_amount=Decimal("500.00"),
                user_id=user.id,
                account_id=pot_acct.id,
            )
            db.add(pot)
            db.flush()
            user.round_ups_enabled = True
            user.round_up_pot_id = pot.id
        db.add(Notification(user_id=user.id, title="Welcome", message="Demo account ready."))
        db.commit()
        deposit(db, user.id, current.id, opening, note="Opening balance")
        print(f"seeded {email} opening {opening}")
    finally:
        db.close()


def upsert_admin() -> None:
    db = SessionLocal()
    try:
        email = "admin@novabank.co.uk"
        if db.scalar(select(User).where(User.email == email)):
            print(f"exists {email}")
            return
        db.add(
            User(
                customer_id="NB-00001",
                full_name="Nova Admin",
                email=email,
                password_hash=hash_password("Password123"),
                role="ADMIN",
            )
        )
        db.commit()
        print(f"seeded {email}")
    finally:
        db.close()


def main():
    init_db()
    upsert_customer("alex@example.com", "Alex Customer", "NB-10001", "2500.00", with_pot=True)
    upsert_customer("jamie@example.com", "Jamie Peer", "NB-10002", "800.00")
    upsert_admin()
    print("Done. Password for all: Password123")


if __name__ == "__main__":
    main()
