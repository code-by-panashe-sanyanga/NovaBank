# NovaBank architecture

## Goal

A small banking API that moves money the way a ledger should: **append-only postings**, **balanced debits and credits**, and **concurrency-safe** updates — not a mutable balance column as the source of truth.

## Layers

1. **Browser** — HTML/CSS/vanilla JS. JWT in `localStorage`. Chart.js for spending. WebSocket for live balance pings after posts.
2. **API (FastAPI)** — REST under `/api`, OpenAPI at `/docs`, WebSocket at `/ws?token=…`.
3. **Transfer service** — only module allowed to post ledger rows for money movement.
4. **PostgreSQL** — accounts, immutable `transactions`, `ledger_entries`, cards, notifications, audit, login history.

## Ledger model

```
transactions          ledger_entries
─────────────         ─────────────────────────────
id                    id
reference             transaction_id  → transactions
idempotency_key       account_id      → accounts
kind                  side            DEBIT | CREDIT
status                amount          > 0
note                  created_at
flagged / flag_reason
created_by
created_at
```

Invariant: for each `transaction_id`, `sum(DEBIT amounts) == sum(CREDIT amounts)`.

### Conventions

Customer deposit accounts are treated as **liabilities** (bank owes the customer):

| Event | Legs |
|-------|------|
| Deposit £X | DEBIT system · CREDIT customer |
| Withdraw £X | DEBIT customer · CREDIT system |
| Transfer A→B £X | DEBIT A · CREDIT B |

`accounts.balance_cache` is updated in the same DB transaction. `ledger_balance()` recomputes from entries for reconciliation (`GET /api/accounts/{id}` returns `cacheMatchesLedger`).

## Concurrency

On PostgreSQL, the transfer service loads accounts with:

```sql
SELECT … FROM accounts WHERE id IN (…) ORDER BY id FOR UPDATE
```

Ordering by `id` avoids deadlocks when two transfers cross the same pair of accounts. The entire post (header + legs + cache) is one commit.

SQLite is supported for UI smoke tests only; it does not give the same row-lock behaviour.

## Idempotency

Clients may send `idempotencyKey` on deposit / withdraw / transfer. A second request with the same key returns the original transaction instead of posting twice.

## Fraud / anomaly (lightweight)

`novabank/services/fraud.py` flags (does not block) transfers when:

- amount ≥ 2000
- burst of recent outbound transfers
- amount > mean + 3σ of that account’s recent outbound debits

Flagged rows show on `GET /api/admin/flags`. `workers/fraud_scan.py` can be run on a cron to re-scan.

Optional next step: scikit-learn IsolationForest on synthetic features — not required for the core demo.

## Auth & security

- bcrypt password hashes
- JWT (`Authorization: Bearer`) with role claim
- RBAC: customer vs admin routes
- Auth endpoint rate limit (per IP, in-memory)
- Ownership checks on account/card routes
- Card numbers masked in API responses
- Audit log on money and admin actions

## Trade-offs

| Decision | Trade-off |
|----------|-----------|
| Cached balance + ledger | Fast reads; must reconcile (we expose a check) |
| In-process WebSocket hub | Simple; needs sticky sessions / Redis pubsub to scale out |
| Rules before ML | Explainable flags first; ML is optional depth |
| Keep old `client/`/`server/` | Legacy Next stack until Railway cutover |

## API surface (high level)

Customer: register/login, accounts, deposit/withdraw/transfer, cards (freeze + category blocks),
pots, round-ups, payment requests, insights + health score, FX convert, notifications, WebSocket live events.

Admin: customer search, all transactions, audit logs, flagged transfers, freeze/unfreeze accounts.

## Product features (Monzo / Revolut-inspired)

| Feature | How it works |
|---------|----------------|
| Savings pots | Extra `POT` ledger account + `pots` row (name, target) |
| Round-ups | On card withdraw, sweep `ceil(amount) − amount` into chosen pot |
| Categories | Keyword match on merchant/note (extendable to ML later) |
| Payment requests | Pending request; counterparty approves → transfer |
| FX | Live rates from **Frankfurter** (ECB), `Decimal` maths, dual balanced postings |
| Health score | Toy score from *your* ledger activity — **not** a credit bureau file |

## Real external data vs mocks

**Safe / used:** Frankfurter (`api.frankfurter.dev`) — public ECB FX, no API key.

**Not used (and should not be scraped):** bank login pages, Experian/Equifax/TransUnion consumer files,
card-network merchant feeds. Real credit scores need commercial contracts and consent flows.

Spending categories start as keyword rules so the demo stays honest and offline-friendly if FX is down.
