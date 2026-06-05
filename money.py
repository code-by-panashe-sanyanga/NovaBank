"""
Money helpers and transactional deposit / withdraw / transfer.

All balance updates happen inside one SQLite transaction so a crash
mid-transfer cannot leave only one side updated.
"""

from __future__ import annotations

import secrets
import string
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from db import get_db

TWOPLACES = Decimal("0.01")


def money(value) -> Decimal:
    """Parse and quantise to 2 decimal places. Raises ValueError if invalid."""
    try:
        amount = Decimal(str(value)).quantize(TWOPLACES, rounding=ROUND_HALF_UP)
    except (InvalidOperation, TypeError) as exc:
        raise ValueError("Invalid amount") from exc
    if amount <= 0:
        raise ValueError("Amount must be greater than zero")
    return amount


def fmt(amount: Decimal) -> str:
    return f"{amount.quantize(TWOPLACES):.2f}"


def new_reference() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "TXN-" + "".join(secrets.choice(alphabet) for _ in range(6))


def new_account_number(conn) -> str:
    while True:
        number = "".join(secrets.choice(string.digits) for _ in range(8))
        if number[0] == "0":
            continue
        exists = conn.execute(
            "SELECT 1 FROM accounts WHERE account_number = ?", (number,)
        ).fetchone()
        if not exists:
            return number


def new_customer_id(conn) -> str:
    while True:
        cid = "NB-" + "".join(secrets.choice(string.digits) for _ in range(5))
        exists = conn.execute(
            "SELECT 1 FROM users WHERE customer_id = ?", (cid,)
        ).fetchone()
        if not exists:
            return cid


def new_card_number(conn) -> str:
    # Demo Visa-like number starting with 4
    while True:
        number = "4" + "".join(secrets.choice(string.digits) for _ in range(15))
        exists = conn.execute(
            "SELECT 1 FROM cards WHERE card_number = ?", (number,)
        ).fetchone()
        if not exists:
            return number


def mask_card(number: str) -> str:
    return "**** **** **** " + number[-4:]


def audit(conn, user_id: int, action: str, details: str) -> None:
    conn.execute(
        "INSERT INTO audit_logs (action, details, user_id) VALUES (?, ?, ?)",
        (action, details, user_id),
    )


def notify(conn, user_id: int, title: str, message: str) -> None:
    conn.execute(
        "INSERT INTO notifications (title, message, user_id) VALUES (?, ?, ?)",
        (title, message, user_id),
    )


def _get_account(conn, account_id: int, for_update: bool = True):
    # SQLite has no SELECT FOR UPDATE; a single connection transaction is enough here.
    row = conn.execute("SELECT * FROM accounts WHERE id = ?", (account_id,)).fetchone()
    return row


def deposit(user_id: int, account_id: int, amount_raw, note: str | None = None) -> dict:
    amount = money(amount_raw)
    with get_db() as conn:
        account = _get_account(conn, account_id)
        if not account or account["user_id"] != user_id:
            raise PermissionError("Account not found")
        if account["status"] != "ACTIVE":
            raise ValueError("Account is frozen")

        new_balance = money(account["balance"]) + amount
        conn.execute(
            "UPDATE accounts SET balance = ? WHERE id = ?",
            (fmt(new_balance), account_id),
        )
        ref = new_reference()
        conn.execute(
            """INSERT INTO transactions
               (reference, type, amount, note, receiver_id)
               VALUES (?, 'DEPOSIT', ?, ?, ?)""",
            (ref, fmt(amount), note, account_id),
        )
        audit(conn, user_id, "DEPOSIT", f"{fmt(amount)} into account {account['account_number']}")
        notify(conn, user_id, "Deposit received", f"{fmt(amount)} GBP credited to your account.")
        return {"reference": ref, "balance": fmt(new_balance)}


def withdraw(user_id: int, account_id: int, amount_raw, note: str | None = None) -> dict:
    amount = money(amount_raw)
    with get_db() as conn:
        account = _get_account(conn, account_id)
        if not account or account["user_id"] != user_id:
            raise PermissionError("Account not found")
        if account["status"] != "ACTIVE":
            raise ValueError("Account is frozen")

        balance = money(account["balance"])
        if balance < amount:
            raise ValueError("Insufficient funds")

        new_balance = balance - amount
        conn.execute(
            "UPDATE accounts SET balance = ? WHERE id = ?",
            (fmt(new_balance), account_id),
        )
        ref = new_reference()
        conn.execute(
            """INSERT INTO transactions
               (reference, type, amount, note, sender_id)
               VALUES (?, 'WITHDRAWAL', ?, ?, ?)""",
            (ref, fmt(amount), note, account_id),
        )
        audit(conn, user_id, "WITHDRAWAL", f"{fmt(amount)} from account {account['account_number']}")
        return {"reference": ref, "balance": fmt(new_balance)}


def transfer(
    user_id: int,
    from_account_id: int,
    to_account_number: str,
    amount_raw,
    note: str | None = None,
) -> dict:
    amount = money(amount_raw)
    to_account_number = (to_account_number or "").strip()

    with get_db() as conn:
        sender = _get_account(conn, from_account_id)
        if not sender or sender["user_id"] != user_id:
            raise PermissionError("Account not found")
        if sender["status"] != "ACTIVE":
            raise ValueError("Your account is frozen")

        receiver = conn.execute(
            "SELECT * FROM accounts WHERE account_number = ?", (to_account_number,)
        ).fetchone()
        if not receiver:
            raise ValueError("Destination account not found")
        if receiver["id"] == sender["id"]:
            raise ValueError("Cannot transfer to the same account")
        if receiver["status"] != "ACTIVE":
            raise ValueError("Destination account is frozen")

        sender_balance = money(sender["balance"])
        if sender_balance < amount:
            raise ValueError("Insufficient funds")

        # Debit + credit + ledger in one commit
        conn.execute(
            "UPDATE accounts SET balance = ? WHERE id = ?",
            (fmt(sender_balance - amount), sender["id"]),
        )
        receiver_balance = money(receiver["balance"])
        conn.execute(
            "UPDATE accounts SET balance = ? WHERE id = ?",
            (fmt(receiver_balance + amount), receiver["id"]),
        )
        ref = new_reference()
        conn.execute(
            """INSERT INTO transactions
               (reference, type, amount, note, sender_id, receiver_id)
               VALUES (?, 'TRANSFER', ?, ?, ?, ?)""",
            (ref, fmt(amount), note, sender["id"], receiver["id"]),
        )
        audit(
            conn,
            user_id,
            "TRANSFER_SENT",
            f"{fmt(amount)} from {sender['account_number']} to {receiver['account_number']}",
        )
        if receiver["user_id"] != user_id:
            notify(
                conn,
                receiver["user_id"],
                "Transfer received",
                f"You received {fmt(amount)} GBP from account {sender['account_number']}.",
            )
        return {
            "reference": ref,
            "balance": fmt(sender_balance - amount),
            "toAccountNumber": receiver["account_number"],
        }
