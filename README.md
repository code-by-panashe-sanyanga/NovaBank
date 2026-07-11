# NovaBank

Double-entry online banking demo.

**Stack:** FastAPI · PostgreSQL · HTML/CSS/vanilla JS · JWT/bcrypt · WebSockets  
**UI colours:** Cursor cream / ink / orange `#f54e00`

## Why this design

| Choice | Reason |
|--------|--------|
| PostgreSQL | Real ACID, `SELECT … FOR UPDATE`, fit for a ledger |
| Double-entry `ledger_entries` | Every movement posts balanced debit + credit; immutable log |
| `balance_cache` | Fast reads; reconciled against ledger sum |
| FastAPI | Typed API, `/docs` OpenAPI, WebSocket support |
| Vanilla JS | Matches portfolio stack; Chart.js for spending |

SQLite can boot the UI when Postgres is not installed. **Production / concurrency demos use Postgres** via Docker Compose.

## Run (local SQLite smoke)

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python seed_ledger.py
uvicorn novabank.main:app --reload --port 5002
```

Open http://localhost:5002 · API docs http://localhost:5002/docs

### Demo logins

| Email | Password | Role |
|-------|----------|------|
| alex@example.com | Password123 | Customer |
| jamie@example.com | Password123 | Customer |
| admin@novabank.co.uk | Password123 | Admin |

## Run (PostgreSQL)

```bash
docker compose up --build
# then: DATABASE_URL=postgresql+psycopg://novabank:novabank@localhost:5432/novabank python seed_ledger.py
```

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

```mermaid
flowchart TB
  UI[Browser HTML/CSS/JS] -->|REST JWT| API[FastAPI]
  UI -->|WebSocket| API
  API --> TS[Transfer service]
  TS -->|FOR UPDATE| PG[(PostgreSQL)]
  TS --> LE[ledger_entries]
  TS --> TX[transactions immutable]
  API --> Fraud[Rules engine]
  Worker[workers/fraud_scan.py] --> PG
```

## Money movement

1. Lock accounts in id order (`FOR UPDATE` on Postgres)
2. Insert `transactions` row (immutable header, optional idempotency key)
3. Insert balanced `ledger_entries` (debits == credits)
4. Update `balance_cache`
5. Commit — or roll back the whole unit

Customer accounts use liability convention: **CREDIT** raises balance, **DEBIT** lowers it. External cash uses a `SYSTEM` account.

**Extras:** pots (sub-accounts), round-ups on card payments, payment requests, category insights, FX via Frankfurter (real ECB rates). Health score is toy ledger analytics — not a bureau credit score.

## Tests

```bash
pytest -q
```

CI runs the same suite on GitHub Actions.

## Layout

| Path | Role |
|------|------|
| `novabank/services/ledger.py` | Double-entry transfer service |
| `novabank/services/fraud.py` | Anomaly rules (flag, don’t block) |
| `novabank/api.py` | REST routes |
| `novabank/main.py` | App, pages, WebSocket, `/docs` |
| `workers/fraud_scan.py` | Offline scan / cron entrypoint |
| `templates/` + `static/` | UI |
| `client/` + `server/` | Old Next/Express stack (legacy) |
