# DBeaver on Windows 11 → PostgreSQL in WSL Docker

Connect **DBeaver** on Windows to the dev **PostgreSQL** statistics database used for analytics charts.

**Prerequisite:** complete [windows_docker_databases_start_and_verify.md](windows_docker_databases_start_and_verify.md) through Step 5.

## Values you will enter

| Setting | Value |
|---------|--------|
| Host | `localhost` |
| Port | `5432` |
| Database | `triage_stats` |
| Username | `triage` |
| Password | `triage` |

These match `backend/.env.dev` and `infra/docker/docker-compose.yml`. They are **not** your Windows or `sudo` password.

---

## Step 1 — Install DBeaver

1. Download [DBeaver Community](https://dbeaver.io/download/) for Windows.
2. Run the installer and finish setup.
3. Launch **DBeaver**.

---

## Step 2 — Ensure PostgreSQL is running in Docker (WSL)

In a WSL terminal, from the repository root:

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d postgres
```

Verify:

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres pg_isready -U triage -d triage_stats
```

---

## Step 3 — Create a new PostgreSQL connection

1. In DBeaver: **Database → New Database Connection** (or click the plug **+** icon).
2. Select **PostgreSQL**.
3. Click **Next**.

---

## Step 4 — Main connection settings

On the **Main** tab:

1. **Host:** `localhost`
2. **Port:** `5432`
3. **Database:** `triage_stats`
4. **Username:** `triage`
5. **Password:** `triage`
6. Check **Save password** (optional, for local dev only).

Do **not** use `postgres` as the host — that name only works inside the Docker network.

---

## Step 5 — Download driver (first time only)

1. If DBeaver prompts to download PostgreSQL drivers, click **Download**.
2. Wait for the download to finish.

---

## Step 6 — Test connection

1. Click **Test Connection**.
2. Expected: **Connected** (or success dialog).
3. Click **Finish** to save the connection.

If the test fails, see [Troubleshooting](#troubleshooting) below.

---

## Step 7 — Browse project data

1. In the **Database Navigator**, expand your connection → **Databases** → `triage_stats` → **Schemas** → **public** → **Tables**.
2. Open **`review_stats_events`** — chart/statistics events written by the API and workers.
3. Right-click the table → **View data** to inspect rows.

Optional SQL:

```sql
SELECT event_type, status, COUNT(*)
FROM review_stats_events
GROUP BY event_type, status
ORDER BY event_type, status;
```

---

## What this database is (and is not)

- **Is:** compact statistics for the **Analytics & graphs** UI (PostgreSQL-backed `/metrics/*` routes).
- **Is not:** full email review bodies — those live in **MongoDB** (`triage` database). See [mongodb_compass_windows_setup.md](mongodb_compass_windows_setup.md).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Connection refused | Postgres container not running | `docker compose -f infra/docker/docker-compose.yml up -d postgres` |
| Connection refused | Docker Desktop stopped | Start Docker Desktop; retry |
| Password authentication failed | Wrong user/password | Use `triage` / `triage`, not `.env` Docker hostnames |
| Port in use | Another PostgreSQL on Windows/WSL | `netstat -ano \| findstr :5432` in PowerShell; stop conflicting service or remap compose port |
| Table missing | Schema not initialized | `DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d backend` then refresh |

For shared Docker/WSL checks, see [windows_docker_databases_start_and_verify.md](windows_docker_databases_start_and_verify.md).
