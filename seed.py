"""Seed demo users for local NovaBank."""

from datetime import datetime

import db
from app import hash_password
from money import audit, fmt, money, new_account_number, new_card_number, new_reference, notify


def upsert_user(conn, *, customer_id, full_name, email, password, role, opening="2500.00"):
    existing = conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone()
    if existing:
        return existing["id"]

    cur = conn.execute(
        """INSERT INTO users (customer_id, full_name, email, password_hash, role)
           VALUES (?, ?, ?, ?, ?)""",
        (customer_id, full_name, email, hash_password(password), role),
    )
    user_id = cur.lastrowid

    if role == "CUSTOMER":
        current_no = new_account_number(conn)
        savings_no = new_account_number(conn)
        cur_acc = conn.execute(
            """INSERT INTO accounts (account_number, type, balance, user_id)
               VALUES (?, 'CURRENT', ?, ?)""",
            (current_no, opening, user_id),
        )
        current_id = cur_acc.lastrowid
        conn.execute(
            """INSERT INTO accounts (account_number, type, balance, user_id)
               VALUES (?, 'SAVINGS', '500.00', ?)""",
            (savings_no, user_id),
        )
        now = datetime.utcnow()
        conn.execute(
            """INSERT INTO cards (card_number, expiry_month, expiry_year, user_id, account_id)
               VALUES (?, ?, ?, ?, ?)""",
            (new_card_number(conn), now.month, now.year + 3, user_id, current_id),
        )
        notify(conn, user_id, "Welcome to NovaBank", "Demo account ready.")
        # Sample deposit history
        conn.execute(
            """INSERT INTO transactions (reference, type, amount, receiver_id)
               VALUES (?, 'DEPOSIT', ?, ?)""",
            (new_reference(), opening, current_id),
        )
        audit(conn, user_id, "SEED", f"Seeded customer {email}")
    else:
        audit(conn, user_id, "SEED", f"Seeded admin {email}")

    return user_id


def main():
    db.init_db()
    with db.get_db() as conn:
        upsert_user(
            conn,
            customer_id="NB-10001",
            full_name="Alex Customer",
            email="alex@example.com",
            password="Password123",
            role="CUSTOMER",
            opening="2500.00",
        )
        upsert_user(
            conn,
            customer_id="NB-10002",
            full_name="Jamie Peer",
            email="jamie@example.com",
            password="Password123",
            role="CUSTOMER",
            opening="800.00",
        )
        upsert_user(
            conn,
            customer_id="NB-00001",
            full_name="Nova Admin",
            email="admin@novabank.co.uk",
            password="Password123",
            role="ADMIN",
        )
    print("Seeded:")
    print("  alex@example.com / Password123")
    print("  jamie@example.com / Password123")
    print("  admin@novabank.co.uk / Password123")


if __name__ == "__main__":
    main()
