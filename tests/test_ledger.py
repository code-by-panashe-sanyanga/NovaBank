from __future__ import annotations

from decimal import Decimal

import pytest
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from novabank.database import Base
from novabank.models import Account, User
from novabank.services.ledger import (
    LedgerError,
    deposit,
    ensure_system_account,
    ledger_balance,
    transfer,
    withdraw,
)


@pytest.fixture()
def db():
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine, future=True)
    session = Session()
    ensure_system_account(session)
    session.commit()
    yield session
    session.close()


def _user_with_account(db, email="a@test.com", opening="100.00"):
    user = User(
        customer_id="NB-1",
        full_name="Test",
        email=email,
        password_hash="x",
        role="CUSTOMER",
    )
    db.add(user)
    db.flush()
    acct = Account(
        account_number="12345678",
        type="CURRENT",
        balance_cache=Decimal("0.00"),
        user_id=user.id,
    )
    db.add(acct)
    db.commit()
    if Decimal(opening) > 0:
        deposit(db, user.id, acct.id, opening)
    db.refresh(acct)
    return user, acct


def test_deposit_credits_ledger(db):
    user, acct = _user_with_account(db, opening="0.00")
    deposit(db, user.id, acct.id, "50.00")
    db.refresh(acct)
    assert Decimal(str(acct.balance_cache)) == Decimal("50.00")
    assert ledger_balance(db, acct.id) == Decimal("50.00")


def test_transfer_is_balanced_and_locked_path(db):
    user_a, acct_a = _user_with_account(db, email="a@t.com", opening="100.00")
    user_b = User(
        customer_id="NB-2",
        full_name="B",
        email="b@t.com",
        password_hash="x",
        role="CUSTOMER",
    )
    db.add(user_b)
    db.flush()
    acct_b = Account(
        account_number="87654321",
        type="CURRENT",
        balance_cache=Decimal("0.00"),
        user_id=user_b.id,
    )
    db.add(acct_b)
    db.commit()

    transfer(db, user_a.id, acct_a.id, "87654321", "40.00")
    db.refresh(acct_a)
    db.refresh(acct_b)
    assert Decimal(str(acct_a.balance_cache)) == Decimal("60.00")
    assert Decimal(str(acct_b.balance_cache)) == Decimal("40.00")
    assert ledger_balance(db, acct_a.id) == Decimal("60.00")
    assert ledger_balance(db, acct_b.id) == Decimal("40.00")


def test_withdraw_insufficient_funds(db):
    user, acct = _user_with_account(db, opening="10.00")
    with pytest.raises(LedgerError, match="Insufficient"):
        withdraw(db, user.id, acct.id, "50.00")


def test_idempotent_deposit(db):
    user, acct = _user_with_account(db, opening="0.00")
    t1 = deposit(db, user.id, acct.id, "25.00", idempotency_key="dep-1")
    t2 = deposit(db, user.id, acct.id, "25.00", idempotency_key="dep-1")
    assert t1.id == t2.id
    db.refresh(acct)
    assert Decimal(str(acct.balance_cache)) == Decimal("25.00")
