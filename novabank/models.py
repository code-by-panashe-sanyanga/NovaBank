"""SQLAlchemy models — double-entry ledger at the core."""

from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from novabank.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    customer_id: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    phone: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    address_line: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    city: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    postcode: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="CUSTOMER")
    is_locked: Mapped[bool] = mapped_column(Boolean, default=False)
    date_joined: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    round_ups_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    round_up_pot_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    default_account_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    preferred_currency: Mapped[str] = mapped_column(String(8), default="GBP")
    language: Mapped[str] = mapped_column(String(8), default="en-GB")
    font_scale: Mapped[str] = mapped_column(String(8), default="md")  # sm|md|lg
    high_contrast: Mapped[bool] = mapped_column(Boolean, default=False)
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    biometric_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    marketing_email: Mapped[bool] = mapped_column(Boolean, default=False)
    marketing_sms: Mapped[bool] = mapped_column(Boolean, default=False)
    open_banking_share: Mapped[bool] = mapped_column(Boolean, default=False)
    daily_spend_alert: Mapped[Optional[str]] = mapped_column(Numeric(14, 2), nullable=True)
    transfer_limit: Mapped[Optional[str]] = mapped_column(Numeric(14, 2), nullable=True)
    # JSON blob for channel × event notification toggles
    notification_prefs: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    accounts: Mapped[List["Account"]] = relationship(back_populates="user")
    cards: Mapped[List["Card"]] = relationship(back_populates="user")
    notifications: Mapped[List["Notification"]] = relationship(back_populates="user")
    pots: Mapped[List["Pot"]] = relationship(back_populates="user")


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    account_number: Mapped[str] = mapped_column(String(16), unique=True, index=True)
    sort_code: Mapped[str] = mapped_column(String(16), default="04-29-09")
    type: Mapped[str] = mapped_column(String(20))  # CURRENT | SAVINGS | SYSTEM
    # Cached balance reconciled from ledger; source of truth is ledger_entries
    balance_cache: Mapped[str] = mapped_column(Numeric(14, 2), default=0)
    currency: Mapped[str] = mapped_column(String(8), default="GBP")
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    user_id: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)

    user: Mapped[Optional["User"]] = relationship(back_populates="accounts")
    ledger_entries: Mapped[List["LedgerEntry"]] = relationship(back_populates="account")


class Transaction(Base):
    """Immutable money-movement header. Never update amounts after insert."""

    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    reference: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(64), unique=True, nullable=True)
    kind: Mapped[str] = mapped_column(String(20))  # DEPOSIT | WITHDRAWAL | TRANSFER
    status: Mapped[str] = mapped_column(String(20), default="POSTED")
    note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    created_by: Mapped[Optional[int]] = mapped_column(ForeignKey("users.id"), nullable=True)
    flagged: Mapped[bool] = mapped_column(Boolean, default=False)
    flag_reason: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    category: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)

    entries: Mapped[List["LedgerEntry"]] = relationship(back_populates="transaction")


class LedgerEntry(Base):
    """
    Append-only debit/credit rows.

    Customer deposit accounts use liability convention:
    CREDIT increases customer balance, DEBIT decreases it.
    For every transaction, sum(debits) == sum(credits).
    """

    __tablename__ = "ledger_entries"
    __table_args__ = (UniqueConstraint("transaction_id", "account_id", "side", name="uq_txn_acct_side"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id"), index=True)
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"), index=True)
    side: Mapped[str] = mapped_column(String(10))  # DEBIT | CREDIT
    amount: Mapped[str] = mapped_column(Numeric(14, 2))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    transaction: Mapped[Transaction] = relationship(back_populates="entries")
    account: Mapped[Account] = relationship(back_populates="ledger_entries")


class Card(Base):
    __tablename__ = "cards"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    card_number: Mapped[str] = mapped_column(String(20), unique=True)
    expiry_month: Mapped[int] = mapped_column(Integer)
    expiry_year: Mapped[int] = mapped_column(Integer)
    is_frozen: Mapped[bool] = mapped_column(Boolean, default=False)
    # Comma-separated blocked spend categories (e.g. gambling)
    blocked_categories: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    daily_limit: Mapped[Optional[str]] = mapped_column(Numeric(14, 2), nullable=True)
    per_txn_limit: Mapped[Optional[str]] = mapped_column(Numeric(14, 2), nullable=True)
    contactless_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    online_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    atm_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    international_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))

    user: Mapped[User] = relationship(back_populates="cards")


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    title: Mapped[str] = mapped_column(String(120))
    message: Mapped[str] = mapped_column(Text)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    user: Mapped[User] = relationship(back_populates="notifications")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    action: Mapped[str] = mapped_column(String(64))
    details: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))


class LoginHistory(Base):
    __tablename__ = "login_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    ip_address: Mapped[str] = mapped_column(String(64))
    user_agent: Mapped[str] = mapped_column(String(300))
    success: Mapped[bool] = mapped_column(Boolean)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))


class Pot(Base):
    """Monzo-style savings pot backed by a POT ledger account."""

    __tablename__ = "pots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    target_amount: Mapped[Optional[str]] = mapped_column(Numeric(14, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))

    user: Mapped[User] = relationship(back_populates="pots")


class PaymentRequest(Base):
    """Bill-split / money request — counterparty must approve."""

    __tablename__ = "payment_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    amount: Mapped[str] = mapped_column(Numeric(14, 2))
    note: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="PENDING")  # PENDING|PAID|DECLINED
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    from_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))  # requester
    to_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))  # payer
    from_account_id: Mapped[Optional[int]] = mapped_column(ForeignKey("accounts.id"), nullable=True)
    to_account_id: Mapped[Optional[int]] = mapped_column(ForeignKey("accounts.id"), nullable=True)


class AuthSession(Base):
    """Active login session — revoke by jti to log out devices."""

    __tablename__ = "auth_sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    jti: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    ip_address: Mapped[str] = mapped_column(String(64), default="")
    user_agent: Mapped[str] = mapped_column(String(300), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    last_seen: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    revoked: Mapped[bool] = mapped_column(Boolean, default=False)
    trusted: Mapped[bool] = mapped_column(Boolean, default=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)


class SavedPayee(Base):
    __tablename__ = "saved_payees"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    account_number: Mapped[str] = mapped_column(String(16))
    sort_code: Mapped[str] = mapped_column(String(16), default="04-29-09")
    nickname: Mapped[Optional[str]] = mapped_column(String(80), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)


class RecurringTransfer(Base):
    __tablename__ = "recurring_transfers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    amount: Mapped[str] = mapped_column(Numeric(14, 2))
    note: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    frequency: Mapped[str] = mapped_column(String(20), default="MONTHLY")  # WEEKLY|MONTHLY
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")  # ACTIVE|PAUSED|CANCELLED
    next_run: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    from_account_id: Mapped[int] = mapped_column(ForeignKey("accounts.id"))
    to_account_number: Mapped[str] = mapped_column(String(16))
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)


class SupportTicket(Base):
    __tablename__ = "support_tickets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    subject: Mapped[str] = mapped_column(String(160))
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="OPEN")  # OPEN|IN_REVIEW|CLOSED
    related_reference: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
