# Deploy NovaBank on Railway

NovaBank is a **single Python service** (FastAPI + HTML/CSS/JS) plus **PostgreSQL**.

## 1. Create a project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Add PostgreSQL

## 2. API + UI service

1. New Service → GitHub Repo → `NovaBank`
2. Root Directory: repo root (leave empty)
3. Builder: Dockerfile (`Dockerfile` at repo root)
4. Variables:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (use `postgresql+psycopg://…` if needed) |
| `SECRET_KEY` | long random string |
| `PORT` | leave to Railway |

5. Public domain, e.g. `https://novabank-client-production.up.railway.app`
6. Check `/` and `/docs`
7. Seed demo users once from a one-off shell:

```bash
python seed_ledger.py
```

Demo: `alex@example.com` / `Password123`, `admin@novabank.co.uk` / `Password123`.

## 3. Common failures

| Symptom | Cause |
| --- | --- |
| API 500 on boot | missing `DATABASE_URL` / `SECRET_KEY` |
| Empty DB | seed never run |
| Wrong dialect | Railway Postgres URL needs a SQLAlchemy-compatible driver prefix |

## 4. After it works

Put the public URL on your portfolio / CV / repo homepage. Keep `SECRET_KEY` in Railway vars only.
