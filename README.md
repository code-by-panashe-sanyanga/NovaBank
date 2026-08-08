# NovaBank

Online banking demo with a proper double-entry ledger.

Built with FastAPI and PostgreSQL. The UI is server-rendered HTML/CSS with a bit of plain JS (Chart.js for spending charts). Auth is JWT + bcrypt; live updates go over WebSockets.

## Run locally

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python seed_ledger.py
uvicorn novabank.main:app --reload --port 5002
```

Then open http://localhost:5002 (API docs at `/docs`).

Demo accounts (password `Password123`):

- alex@example.com
- jamie@example.com
- admin@novabank.co.uk (admin)

For Postgres: `docker compose up --build`, then seed with `DATABASE_URL` pointed at the compose database.

## Notes

Transfers lock accounts, write an immutable transaction header, post balanced ledger entries, then update the balance cache. Customer balances use the usual liability convention (credit up, debit down).

There are also pots, round-ups, payment requests, category insights, and a small fraud rules worker. Not a real bank — demo only.
