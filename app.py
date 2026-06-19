"""
NovaBank Flask app.

Serves HTML pages from templates/ and JSON under /api/*.
Stack: HTML, CSS, JS, Python, SQLite. No Next.js / Prisma / Tailwind.
"""

from __future__ import annotations

import os
import sys
from datetime import datetime, timedelta
from functools import wraps

import bcrypt
import jwt
from dotenv import load_dotenv
from flask import (
    Flask,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    send_from_directory,
)

import db
from money import (
    audit,
    deposit,
    fmt,
    mask_card,
    money,
    new_account_number,
    new_card_number,
    new_customer_id,
    notify,
    transfer,
    withdraw,
)

load_dotenv()

app = Flask(__name__, static_folder="static", template_folder="templates")
SECRET = os.getenv("SECRET_KEY", "novabank-dev")
app.config["SECRET_KEY"] = SECRET
JWT_HOURS = 24

if SECRET == "novabank-dev":
    print(
        "WARNING: SECRET_KEY is still the default. Set a long random value before deploy.",
        file=sys.stderr,
    )


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def check_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def make_token(user_id: int, role: str) -> str:
    payload = {
        "id": user_id,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=JWT_HOURS),
    }
    return jwt.encode(payload, SECRET, algorithm="HS256")


def current_user_from_token():
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    token = header[7:].strip()
    try:
        payload = jwt.decode(token, SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None
    with db.get_db() as conn:
        user = conn.execute(
            "SELECT * FROM users WHERE id = ?", (payload["id"],)
        ).fetchone()
    return user


def login_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user_from_token()
        if not user:
            return jsonify({"error": "Unauthorised"}), 401
        if user["is_locked"]:
            return jsonify({"error": "Account locked"}), 403
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user_from_token()
        if not user:
            return jsonify({"error": "Unauthorised"}), 401
        if user["role"] != "ADMIN":
            return jsonify({"error": "Forbidden"}), 403
        g.user = user
        return fn(*args, **kwargs)

    return wrapper


def user_public(row) -> dict:
    return {
        "id": row["id"],
        "customerId": row["customer_id"],
        "fullName": row["full_name"],
        "email": row["email"],
        "phone": row["phone"],
        "role": row["role"],
        "dateJoined": row["date_joined"],
        "isLocked": bool(row["is_locked"]),
    }


def account_public(row) -> dict:
    return {
        "id": row["id"],
        "accountNumber": row["account_number"],
        "sortCode": row["sort_code"],
        "type": row["type"],
        "balance": row["balance"],
        "currency": row["currency"],
        "status": row["status"],
        "createdAt": row["created_at"],
    }


# ---------- Pages ----------

@app.route("/")
def page_home():
    return render_template("index.html")


@app.route("/login")
def page_login():
    return render_template("login.html")


@app.route("/register")
def page_register():
    return render_template("register.html")


@app.route("/dashboard")
def page_dashboard():
    return render_template("dashboard.html")


@app.route("/accounts")
def page_accounts():
    return render_template("accounts.html")


@app.route("/payments")
def page_payments():
    return render_template("payments.html")


@app.route("/cards")
def page_cards():
    return render_template("cards.html")


@app.route("/settings")
def page_settings():
    return render_template("settings.html")


@app.route("/admin")
def page_admin():
    return render_template("admin.html")


# ---------- Health ----------

@app.get("/api/health")
def health():
    return jsonify({"ok": True})


@app.get("/api/ready")
def ready():
    try:
        with db.get_db() as conn:
            conn.execute("SELECT 1").fetchone()
        return jsonify({"ok": True})
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc)}), 503


# ---------- Auth ----------

@app.post("/api/auth/register")
def register():
    data = request.get_json(silent=True) or {}
    full_name = (data.get("fullName") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    phone = (data.get("phone") or "").strip() or None

    if not full_name or not email or len(password) < 8:
        return jsonify({"error": "Name, email, and password (8+ chars) required"}), 400

    try:
        with db.get_db() as conn:
            if conn.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone():
                return jsonify({"error": "Email already registered"}), 400

            customer_id = new_customer_id(conn)
            cur = conn.execute(
                """INSERT INTO users (customer_id, full_name, email, password_hash, phone, role)
                   VALUES (?, ?, ?, ?, ?, 'CUSTOMER')""",
                (customer_id, full_name, email, hash_password(password), phone),
            )
            user_id = cur.lastrowid

            current_no = new_account_number(conn)
            savings_no = new_account_number(conn)
            cur_acc = conn.execute(
                """INSERT INTO accounts (account_number, type, balance, user_id)
                   VALUES (?, 'CURRENT', '0.00', ?)""",
                (current_no, user_id),
            )
            current_id = cur_acc.lastrowid
            conn.execute(
                """INSERT INTO accounts (account_number, type, balance, user_id)
                   VALUES (?, 'SAVINGS', '0.00', ?)""",
                (savings_no, user_id),
            )

            card_no = new_card_number(conn)
            now = datetime.utcnow()
            conn.execute(
                """INSERT INTO cards (card_number, expiry_month, expiry_year, user_id, account_id)
                   VALUES (?, ?, ?, ?, ?)""",
                (card_no, now.month, now.year + 3, user_id, current_id),
            )
            notify(
                conn,
                user_id,
                "Welcome to NovaBank",
                "Your current and savings accounts are ready.",
            )
            audit(conn, user_id, "REGISTER", f"Registered {email}")
            user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500

    token = make_token(user["id"], user["role"])
    return jsonify({"token": token, "user": user_public(user)}), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    with db.get_db() as conn:
        user = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        ok = bool(user and check_password(password, user["password_hash"]))
        if user:
            conn.execute(
                """INSERT INTO login_history (ip_address, user_agent, success, user_id)
                   VALUES (?, ?, ?, ?)""",
                (
                    request.headers.get("X-Forwarded-For", request.remote_addr or ""),
                    request.headers.get("User-Agent", "")[:300],
                    1 if ok else 0,
                    user["id"],
                ),
            )
        if not ok:
            return jsonify({"error": "Invalid email or password"}), 401
        if user["is_locked"]:
            return jsonify({"error": "Account locked"}), 403

    token = make_token(user["id"], user["role"])
    return jsonify({"token": token, "user": user_public(user)})


@app.get("/api/auth/me")
@login_required
def me():
    return jsonify({"user": user_public(g.user)})


@app.post("/api/auth/logout")
@login_required
def logout():
    # JWT is client-held; logout is just for API symmetry
    return jsonify({"ok": True})


# ---------- Dashboard / accounts ----------

@app.get("/api/dashboard")
@login_required
def dashboard():
    uid = g.user["id"]
    with db.get_db() as conn:
        accounts = conn.execute(
            "SELECT * FROM accounts WHERE user_id = ? ORDER BY type", (uid,)
        ).fetchall()
        account_ids = [a["id"] for a in accounts]
        recent = []
        if account_ids:
            placeholders = ",".join("?" * len(account_ids))
            recent = conn.execute(
                f"""SELECT * FROM transactions
                    WHERE sender_id IN ({placeholders}) OR receiver_id IN ({placeholders})
                    ORDER BY created_at DESC LIMIT 5""",
                account_ids + account_ids,
            ).fetchall()
        unread = conn.execute(
            "SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0",
            (uid,),
        ).fetchone()["c"]

    total = sum(money(a["balance"]) for a in accounts)
    return jsonify(
        {
            "accounts": [account_public(a) for a in accounts],
            "totalBalance": fmt(total),
            "recentTransactions": [txn_public(t) for t in recent],
            "unreadNotifications": unread,
        }
    )


def txn_public(row) -> dict:
    return {
        "id": row["id"],
        "reference": row["reference"],
        "type": row["type"],
        "amount": row["amount"],
        "status": row["status"],
        "note": row["note"],
        "createdAt": row["created_at"],
        "senderId": row["sender_id"],
        "receiverId": row["receiver_id"],
    }


@app.get("/api/accounts")
@login_required
def accounts_list():
    with db.get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM accounts WHERE user_id = ? ORDER BY type", (g.user["id"],)
        ).fetchall()
    return jsonify({"accounts": [account_public(a) for a in rows]})


@app.get("/api/accounts/<int:account_id>")
@login_required
def account_detail(account_id: int):
    with db.get_db() as conn:
        account = conn.execute(
            "SELECT * FROM accounts WHERE id = ?", (account_id,)
        ).fetchone()
        if not account or account["user_id"] != g.user["id"]:
            return jsonify({"error": "Not found"}), 404
    return jsonify({"account": account_public(account)})


@app.get("/api/accounts/<int:account_id>/transactions")
@login_required
def account_transactions(account_id: int):
    with db.get_db() as conn:
        account = conn.execute(
            "SELECT * FROM accounts WHERE id = ?", (account_id,)
        ).fetchone()
        if not account or account["user_id"] != g.user["id"]:
            return jsonify({"error": "Not found"}), 404
        rows = conn.execute(
            """SELECT * FROM transactions
               WHERE sender_id = ? OR receiver_id = ?
               ORDER BY created_at DESC LIMIT 100""",
            (account_id, account_id),
        ).fetchall()
    return jsonify({"transactions": [txn_public(t) for t in rows]})


# ---------- Payments ----------

@app.post("/api/transactions/deposit")
@login_required
def api_deposit():
    data = request.get_json(silent=True) or {}
    try:
        result = deposit(
            g.user["id"], int(data["accountId"]), data.get("amount"), data.get("note")
        )
        return jsonify(result)
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 404
    except (ValueError, KeyError, TypeError) as exc:
        return jsonify({"error": str(exc)}), 400


@app.post("/api/transactions/withdraw")
@login_required
def api_withdraw():
    data = request.get_json(silent=True) or {}
    try:
        result = withdraw(
            g.user["id"], int(data["accountId"]), data.get("amount"), data.get("note")
        )
        return jsonify(result)
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 404
    except (ValueError, KeyError, TypeError) as exc:
        return jsonify({"error": str(exc)}), 400


@app.post("/api/transactions/transfer")
@login_required
def api_transfer():
    data = request.get_json(silent=True) or {}
    try:
        result = transfer(
            g.user["id"],
            int(data["fromAccountId"]),
            data.get("toAccountNumber"),
            data.get("amount"),
            data.get("note"),
        )
        return jsonify(result)
    except PermissionError as exc:
        return jsonify({"error": str(exc)}), 404
    except (ValueError, KeyError, TypeError) as exc:
        return jsonify({"error": str(exc)}), 400


# ---------- Cards ----------

@app.get("/api/cards")
@login_required
def cards_list():
    with db.get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM cards WHERE user_id = ?", (g.user["id"],)
        ).fetchall()
    return jsonify(
        {
            "cards": [
                {
                    "id": c["id"],
                    "maskedNumber": mask_card(c["card_number"]),
                    "expiryMonth": c["expiry_month"],
                    "expiryYear": c["expiry_year"],
                    "isFrozen": bool(c["is_frozen"]),
                    "accountId": c["account_id"],
                }
                for c in rows
            ]
        }
    )


@app.post("/api/cards/<int:card_id>/freeze")
@login_required
def freeze_card(card_id: int):
    with db.get_db() as conn:
        card = conn.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
        if not card or card["user_id"] != g.user["id"]:
            return jsonify({"error": "Not found"}), 404
        conn.execute("UPDATE cards SET is_frozen = 1 WHERE id = ?", (card_id,))
        audit(conn, g.user["id"], "CARD_FROZEN", f"Card {mask_card(card['card_number'])}")
    return jsonify({"ok": True, "isFrozen": True})


@app.post("/api/cards/<int:card_id>/unfreeze")
@login_required
def unfreeze_card(card_id: int):
    with db.get_db() as conn:
        card = conn.execute("SELECT * FROM cards WHERE id = ?", (card_id,)).fetchone()
        if not card or card["user_id"] != g.user["id"]:
            return jsonify({"error": "Not found"}), 404
        conn.execute("UPDATE cards SET is_frozen = 0 WHERE id = ?", (card_id,))
        audit(conn, g.user["id"], "CARD_UNFROZEN", f"Card {mask_card(card['card_number'])}")
    return jsonify({"ok": True, "isFrozen": False})


# ---------- Notifications ----------

@app.get("/api/notifications")
@login_required
def notifications_list():
    with db.get_db() as conn:
        rows = conn.execute(
            """SELECT * FROM notifications WHERE user_id = ?
               ORDER BY created_at DESC LIMIT 50""",
            (g.user["id"],),
        ).fetchall()
    return jsonify(
        {
            "notifications": [
                {
                    "id": n["id"],
                    "title": n["title"],
                    "message": n["message"],
                    "isRead": bool(n["is_read"]),
                    "createdAt": n["created_at"],
                }
                for n in rows
            ]
        }
    )


@app.patch("/api/notifications/read-all")
@login_required
def notifications_read_all():
    with db.get_db() as conn:
        conn.execute(
            "UPDATE notifications SET is_read = 1 WHERE user_id = ?", (g.user["id"],)
        )
    return jsonify({"ok": True})


# ---------- Admin ----------

@app.get("/api/admin/customers")
@admin_required
def admin_customers():
    q = (request.args.get("search") or "").strip()
    with db.get_db() as conn:
        if q:
            like = f"%{q}%"
            rows = conn.execute(
                """SELECT * FROM users
                   WHERE role = 'CUSTOMER' AND (
                     email LIKE ? OR full_name LIKE ? OR customer_id LIKE ?
                   )
                   ORDER BY date_joined DESC LIMIT 50""",
                (like, like, like),
            ).fetchall()
        else:
            rows = conn.execute(
                """SELECT * FROM users WHERE role = 'CUSTOMER'
                   ORDER BY date_joined DESC LIMIT 50"""
            ).fetchall()
    return jsonify({"customers": [user_public(u) for u in rows]})


@app.get("/api/admin/transactions")
@admin_required
def admin_transactions():
    with db.get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM transactions ORDER BY created_at DESC LIMIT 100"
        ).fetchall()
    return jsonify({"transactions": [txn_public(t) for t in rows]})


@app.get("/api/admin/audit-logs")
@admin_required
def admin_audit():
    with db.get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 100"
        ).fetchall()
    return jsonify(
        {
            "logs": [
                {
                    "id": r["id"],
                    "action": r["action"],
                    "details": r["details"],
                    "createdAt": r["created_at"],
                    "userId": r["user_id"],
                }
                for r in rows
            ]
        }
    )


@app.post("/api/admin/accounts/<int:account_id>/freeze")
@admin_required
def admin_freeze_account(account_id: int):
    with db.get_db() as conn:
        account = conn.execute(
            "SELECT * FROM accounts WHERE id = ?", (account_id,)
        ).fetchone()
        if not account:
            return jsonify({"error": "Not found"}), 404
        conn.execute(
            "UPDATE accounts SET status = 'FROZEN' WHERE id = ?", (account_id,)
        )
        audit(
            conn,
            g.user["id"],
            "ACCOUNT_FROZEN",
            f"Froze account {account['account_number']}",
        )
    return jsonify({"ok": True})


@app.post("/api/admin/accounts/<int:account_id>/unfreeze")
@admin_required
def admin_unfreeze_account(account_id: int):
    with db.get_db() as conn:
        account = conn.execute(
            "SELECT * FROM accounts WHERE id = ?", (account_id,)
        ).fetchone()
        if not account:
            return jsonify({"error": "Not found"}), 404
        conn.execute(
            "UPDATE accounts SET status = 'ACTIVE' WHERE id = ?", (account_id,)
        )
        audit(
            conn,
            g.user["id"],
            "ACCOUNT_UNFROZEN",
            f"Unfroze account {account['account_number']}",
        )
    return jsonify({"ok": True})


@app.post("/api/admin/users/<int:user_id>/unlock")
@admin_required
def admin_unlock_user(user_id: int):
    with db.get_db() as conn:
        user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not user:
            return jsonify({"error": "Not found"}), 404
        conn.execute("UPDATE users SET is_locked = 0 WHERE id = ?", (user_id,))
        audit(conn, g.user["id"], "USER_UNLOCKED", f"Unlocked {user['email']}")
    return jsonify({"ok": True})


@app.before_request
def ensure_db():
    if not db.DB_PATH.exists():
        db.init_db()


if __name__ == "__main__":
    db.init_db()
    port = int(os.getenv("PORT", "5002"))
    app.run(host="0.0.0.0", port=port, debug=True)
