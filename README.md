# NovaBank

Small online banking demo. Money moves through a double-entry ledger rather than a single mutable balance field.

Stack: FastAPI, PostgreSQL, HTML/CSS and plain JavaScript, JWT + bcrypt, WebSockets. Chart.js is used for spending charts. SQLite can boot the UI for a quick local look; use Postgres (Docker Compose) when you care about real locking and concurrency.

This is a portfolio / learning project, not a real bank.

## Run (SQLite, quick smoke)

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python seed_ledger.py
uvicorn novabank.main:app --reload --port 5002
```

Open http://localhost:5002 — OpenAPI lives at http://localhost:5002/docs.

### Demo logins

Password for all of these is `Password123`.

| Email | Role |
|-------|------|
| alex@example.com | Customer |
| jamie@example.com | Customer |
| admin@novabank.co.uk | Admin |

## Run (PostgreSQL)

Postgres is what you want for ACID and `SELECT … FOR UPDATE` on transfers.

```bash
docker compose up --build
```

Then seed against the compose database:

```bash
DATABASE_URL=postgresql+psycopg://novabank:novabank@localhost:5432/novabank python seed_ledger.py
```

## How the money path works

1. Lock the accounts involved, ordered by id (`FOR UPDATE` on Postgres) so two crossing transfers don’t deadlock.
2. Insert a `transactions` row (immutable header; optional idempotency key).
3. Insert balanced `ledger_entries` — debits must equal credits for that transaction.
4. Update `balance_cache` in the same DB transaction.
5. Commit, or roll the whole unit back.

Customer deposit accounts are treated as liabilities (the bank owes the customer):

| Event | Legs |
|-------|------|
| Deposit £X | DEBIT system · CREDIT customer |
| Withdraw £X | DEBIT customer · CREDIT system |
| Transfer A→B £X | DEBIT A · CREDIT B |

`ledger_balance()` can recompute from entries; account responses include whether the cache matches the ledger.

If a client sends the same `idempotencyKey` twice on deposit / withdraw / transfer, the second call returns the original transaction instead of posting again.

## What’s in the box

- Pots (sub-accounts)
- Round-ups on card payments
- Payment requests
- Category insights (FX via Frankfurter / ECB rates where used)
- A lightweight health-style score from ledger activity — toy analytics, not a credit bureau score
- Fraud rules that flag (not block) large amounts, burst outbound transfers, and outliers vs recent history — see admin flags and `workers/fraud_scan.py`

## Auth and access

- Passwords hashed with bcrypt
- JWT bearer tokens with a role claim
- Customer vs admin routes
- Basic per-IP rate limit on auth
- Ownership checks on account / card routes
- Card numbers masked in API responses
- Audit log on money movement and admin actions

## Layout

| Path | Role |
|------|------|
| `novabank/services/ledger.py` | Double-entry transfer service |
| `novabank/services/fraud.py` | Anomaly rules (flag, don’t block) |
| `novabank/api.py` | REST routes |
| `novabank/main.py` | App, pages, WebSocket, `/docs` |
| `workers/fraud_scan.py` | Offline / cron-style re-scan |
| `templates/` + `static/` | UI |
| `seed_ledger.py` | Demo data |

Browser talks REST (+ JWT in `localStorage`) and opens a WebSocket for live balance updates after posts. Only the transfer service is meant to post ledger rows for money movement.

## Tests

```bash
pytest -q
```
