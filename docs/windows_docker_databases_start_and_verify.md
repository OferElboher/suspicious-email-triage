# Start Docker databases (WSL) and verify Windows can reach them

This guide is the **prerequisite** for connecting GUI clients on **Windows 11** (DBeaver, MongoDB Compass, Redis Insight) to the dev databases that run in **Docker inside WSL**.

All commands below assume your repository is checked out in WSL and you run them **from the repository root** (for example `/home/you/suspicious-email-triage`).

## What runs where

```text
Windows 11 (DBeaver / Compass / Redis Insight)
        |
        |  localhost + published port
        v
Docker Desktop / WSL2 port forwarding
        |
        v
Docker Compose containers (mongo, postgres, redis, ...)
```

Inside Docker, services talk to each other by **service name** (`mongo`, `postgres`, `redis`). GUI tools on Windows use **`localhost`** and the **host port** from `infra/docker/docker-compose.yml`.

## Dev connection quick reference

| Store | Windows host | Port | Database / DB index | User | Password | Main data |
|-------|--------------|------|---------------------|------|----------|-----------|
| PostgreSQL | `localhost` | `5432` | `triage_stats` | `triage` | `triage` | Chart statistics (`review_stats_events`) |
| MongoDB | `localhost` | `27018` | `triage` | *(none in default dev)* | *(none)* | Review documents |
| Redis | `localhost` | `6379` | `0` broker, `1` Celery results | *(none in default dev)* | *(none)* | Queues / dev state |

Credentials match `backend/.env.dev`. Staging and production use remote services; this guide is for **local dev only**.

---

## Step 1 — Open a WSL terminal

On Windows 11, open **Ubuntu** (or your WSL distro) from the Start menu or Windows Terminal.

Confirm Docker works:

```bash
docker --version
docker compose version
```

If either command fails, install [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/) and enable **WSL integration** for your distro (Docker Desktop → Settings → Resources → WSL integration).

---

## Step 2 — Start the database containers

From the repository root, start only the data stores (fastest path for GUI client setup):

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d mongo postgres redis
```

To start the **full dev stack** (API, workers, Redpanda, and databases):

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --build
```

Wait a few seconds, then list containers:

```bash
docker compose -f infra/docker/docker-compose.yml ps
```

Expected container names (among others):

- `triage-mongo`
- `triage-postgres`
- `triage-redis`

All should show **State** `running` (or `Up`).

---

## Step 3 — Confirm published ports

Still from the repository root:

```bash
docker compose -f infra/docker/docker-compose.yml ps mongo postgres redis
```

Check the **PORTS** column:

| Container | Expected mapping |
|-----------|------------------|
| `triage-mongo` | `0.0.0.0:27018->27017/tcp` |
| `triage-postgres` | `0.0.0.0:5432->5432/tcp` |
| `triage-redis` | `0.0.0.0:6379->6379/tcp` |

**Important:** MongoDB is **not** on port `27017` from Windows. Compose maps host **`27018`** → container `27017`.

Optional — see which process listens on Windows (PowerShell on Windows):

```powershell
netstat -ano | findstr ":5432"
netstat -ano | findstr ":27018"
netstat -ano | findstr ":6379"
```

You should see listeners when Docker is forwarding correctly (often via `com.docker.backend` or similar).

---

## Step 4 — Health checks from WSL

Run these one at a time from the repository root.

### PostgreSQL

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres pg_isready -U triage -d triage_stats
```

Expected:

```text
/var/run/postgresql:5432 - accepting connections
```

### MongoDB

```bash
docker compose -f infra/docker/docker-compose.yml exec mongo mongosh --eval "db.runCommand({ ping: 1 })"
```

Expected: `{ ok: 1 }` (exact formatting may vary).

### Redis

```bash
docker compose -f infra/docker/docker-compose.yml exec redis redis-cli ping
```

Expected:

```text
PONG
```

---

## Step 5 — Smoke tests through localhost (WSL)

These mimic what Windows GUI clients do: connect via **published ports** on `localhost`.

### PostgreSQL

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres psql -U triage -d triage_stats -c "SELECT COUNT(*) FROM review_stats_events;"
```

If the table does not exist yet, start the API once so schema initialization runs:

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d backend
```

Then retry the `SELECT`.

### MongoDB (via host port from WSL)

If `mongosh` is installed on WSL:

```bash
mongosh "mongodb://localhost:27018/triage" --eval "db.runCommand({ ping: 1 })"
```

If `mongosh` is not installed on WSL, the `docker compose exec mongo mongosh` check in Step 4 is enough.

### Redis (via host port from WSL)

```bash
docker compose -f infra/docker/docker-compose.yml exec redis redis-cli -h localhost -p 6379 ping
```

Or from WSL if `redis-cli` is installed:

```bash
redis-cli -h localhost -p 6379 ping
```

---

## Step 6 — Configure GUI clients on Windows 11

When Steps 4–5 succeed, open the tool-specific guides:

- [DBeaver → PostgreSQL](dbeaver_postgresql_windows_setup.md)
- [MongoDB Compass → MongoDB](mongodb_compass_windows_setup.md)
- [Redis Insight → Redis](redis_insight_windows_setup.md)

Use **`localhost`** as the host in all three unless troubleshooting (see below).

---

## Troubleshooting

### Connection refused from Windows

1. Confirm containers are running (Step 2).
2. Confirm port mappings (Step 3).
3. Ensure **Docker Desktop is running** and WSL integration is enabled.
4. Temporarily try the WSL IP instead of `localhost`:
   - In WSL: `hostname -I | awk '{print $1}'`
   - Use that IP in DBeaver / Compass / Redis Insight (same ports).

### Port already in use

Another program (native PostgreSQL, MongoDB, Redis on Windows or WSL) may hold the port.

- PostgreSQL conflict on `5432`: stop the other service or change compose to `"5433:5432"` and use port **5433** in DBeaver.
- Mongo conflict on `27018`: rare; change compose mapping if needed.
- Redis conflict on `6379`: stop other Redis instances or remap the host port.

### Wrong Mongo port

If Compass fails on `27017`, switch to **`27018`** — that is the dev compose host port.

### GUI works but tables/collections are empty

That is normal on a fresh dev stack. Submit a review in the UI or enable dev simulation; statistics land in PostgreSQL and reviews in MongoDB.

---

## Stop the stack

From the repository root:

```bash
docker compose -f infra/docker/docker-compose.yml down
```

Add `-v` only if you intentionally want to remove named volumes (this wipes container data).
