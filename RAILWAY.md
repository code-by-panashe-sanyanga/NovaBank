# Deploy NovaBank on Railway

NovaBank needs **three services**: Postgres, the API (`server/`), and the Next.js client (`client/`).
Deploying the whole repo as one service will not work.

## 1. Create a project

1. Go to [railway.app](https://railway.app) → **New Project**
2. Add PostgreSQL

## 2. API service (`server`)

1. New Service → GitHub Repo → `NovaBank`
2. Root Directory: `server`
3. Builder: Dockerfile (`server/Dockerfile`)
4. Variables:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `JWT_SECRET` | long random string |
| `CLIENT_ORIGIN` | set after client has a URL (`https://YOUR-CLIENT.up.railway.app`) |
| `CLIENT_URL` | same as `CLIENT_ORIGIN` |
| `PORT` | leave to Railway (don’t hardcode 4000) |

5. Public domain for the API, e.g. `https://novabank-api-production.up.railway.app`
6. Check ` /api/health` and `/api/ready`
7. Seed demo users once (API shell / one-off):

```bash
npm run db:seed-if-empty
```

Skips if users already exist. Demo: `alex@example.com` / `Password123`, `admin@novabank.co.uk` / `Password123`.

From a laptop against the Railway DB:

```bash
cd server
DATABASE_URL="postgresql://..." npm run db:seed-if-empty
```

## 3. Client service (`client`)

1. Same repo, root `client`, Dockerfile builder
2. Build-time variable:

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `https://YOUR-API.up.railway.app/api` |

3. Public domain for the client
4. Go back to the API and set `CLIENT_ORIGIN` / `CLIENT_URL` to that client HTTPS URL
5. Redeploy the API so CORS picks it up

## 4. Common failures

| Symptom | Cause |
| --- | --- |
| Blank site / network errors | `NEXT_PUBLIC_API_URL` wrong, missing `/api`, or still `localhost` |
| API 500 on boot | missing `DATABASE_URL` / `JWT_SECRET` |
| CORS in the browser | `CLIENT_ORIGIN` not the exact client HTTPS URL |
| Empty DB | migrations didn’t run, or seed never run |
| Only one service | need Postgres + server + client |

## 5. After it works

Put the client URL on your portfolio / CV / repo homepage. Keep `JWT_SECRET` in Railway vars only.
