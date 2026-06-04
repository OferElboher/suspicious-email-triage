# Start Docker databases (WSL) and verify Windows can reach them

This guide is the **prerequisite** for connecting GUI clients on **Windows 11** (DBeaver, MongoDB Compass, Redis Insight) to the dev databases that run in **Docker inside WSL**.

It also covers the **full sequence after a Windows 11 restart**, when Docker Desktop and containers are usually stopped.

All commands below assume your repository is checked out in WSL and you run bash commands **from the repository root** (for example `/home/you/suspicious-email-triage`). Adjust the path if yours differs.

**Related guides**

- Run the full app after startup: [stack_guide_windows_startup.md](stack_guide_windows_startup.md)
- Admin login and password recovery: [auth_guide_dev_admin_credentials.md](auth_guide_dev_admin_credentials.md)
- Reset auth tables / login blocked despite visible email: [auth_guide_dev_auth_recovery.md](auth_guide_dev_auth_recovery.md)

---

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
| Neo4j | `localhost` | `7474` / `7687` | default graph `neo4j` | see `NEO4J_USER` in `backend/.env.dev` | see `NEO4J_PASSWORD` locally | Phishing relationship graph |

Credentials for PostgreSQL/Mongo/Redis match `backend/.env.dev`. **Neo4j and service tokens:** read `NEO4J_*` and `GRAPH_*` from your local env files — do not paste secrets into docs. Staging and production use remote services; this guide is for **local dev only**.

---

## After Windows 11 restarts (do this first)

Windows restarts stop **Docker Desktop** and all containers. DBeaver, Compass, and Redis Insight will show **connection refused** until you complete the steps below.

### Step 0a — Start Docker Desktop (Windows)

**Option A — Start menu**

1. Press the **Windows** key.
2. Type **Docker Desktop**.
3. Press **Enter**.
4. Wait until the Docker whale icon in the system tray is steady and the app shows **Docker Desktop is running** (often 30–60 seconds).

**Option B — PowerShell (Windows)**

1. Press **Windows + X** → **Terminal** (or **PowerShell**).
2. Run:

```powershell
Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
```

3. Wait until Docker Desktop reports **running** (same as Option A, step 4).

**Optional — start Docker automatically on sign-in**

1. Open **Docker Desktop**.
2. Go to **Settings** → **General**.
3. Enable **Start Docker Desktop when you sign in to your computer**.
4. Click **Apply & restart** if prompted.

### Step 0b — Open a WSL terminal

1. On Windows 11, open **Ubuntu** (or your WSL distro) from the Start menu or **Windows Terminal**.
2. Go to the repository root:

```bash
cd ~/suspicious-email-triage
```

### Step 0c — Confirm Docker works (WSL)

Run both commands:

```bash
docker --version
docker compose version
```

**Expected:** each prints a version line (for example `Docker version 29.x.x`).

**If you see** `The command 'docker' could not be found in this WSL 2 distro`:

1. Ensure **Step 0a** finished (Docker Desktop must be running).
2. Open **Docker Desktop** → **Settings** → **Resources** → **WSL integration**.
3. Enable integration for your distro (for example **Ubuntu**).
4. Click **Apply & restart**.
5. Close and reopen the WSL terminal, then rerun the two commands above.

If Docker is still missing, install [Docker Desktop for Windows](https://docs.docker.com/desktop/setup/install/windows-install/) and repeat Step 0a.

### Step 0d — Start the database containers (WSL)

From the repository root:

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d mongo postgres redis
```

**Expected:** lines like `Container triage-postgres Running` or `Started`.

Wait a few seconds, then list containers:

```bash
docker compose -f infra/docker/docker-compose.yml ps mongo postgres redis
```

**Expected:** three rows — `triage-mongo`, `triage-postgres`, `triage-redis` — all with state **running** or **Up**.

### Step 0e — Health checks (WSL)

Run each command from the repository root:

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres pg_isready -U triage -d triage_stats
```

**Expected:** `/var/run/postgresql:5432 - accepting connections`

```bash
docker compose -f infra/docker/docker-compose.yml exec mongo mongosh --eval "db.runCommand({ ping: 1 })"
```

**Expected:** `{ ok: 1 }` (formatting may vary).

```bash
docker compose -f infra/docker/docker-compose.yml exec redis redis-cli ping
```

**Expected:** `PONG`

When Step 0e succeeds, continue to [Step 3](#step-3--confirm-published-ports) (ports) and [Step 6](#step-6--configure-gui-clients-on-windows-11) (GUI clients), or proceed to [stack_guide_windows_startup.md](stack_guide_windows_startup.md) to start the API and UI.

---

## Step 1 — Open a WSL terminal

*(Same as [Step 0b](#step-0b--open-a-wsl-terminal) if you already completed the restart checklist.)*

On Windows 11, open **Ubuntu** (or your WSL distro) from the Start menu or Windows Terminal.

Confirm Docker works:

```bash
docker --version
docker compose version
```

If either command fails, complete [After Windows 11 restarts](#after-windows-11-restarts-do-this-first) from Step 0a.

---

## Step 2 — Start the database containers

From the repository root, start only the data stores (fastest path for GUI client setup):

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d mongo postgres redis
```

To start the **full dev stack** (API, workers, Redpanda, and databases):

```bash
cd ~/suspicious-email-triage
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

- [DBeaver → PostgreSQL](tech_postgresql_dbeaver_windows.md)
- [MongoDB Compass → MongoDB](tech_mongodb_compass_windows.md)
- [Redis Insight → Redis](tech_redis_insight_windows.md)
- [Neo4j Browser / DBeaver → Neo4j graph](tech_neo4j_setup_wsl_windows.md)

Use **`localhost`** as the host in all clients unless troubleshooting (see below).

---

## Troubleshooting

### Connection refused from Windows

1. Complete [After Windows 11 restarts](#after-windows-11-restarts-do-this-first) — especially **Step 0a** (Docker Desktop running).
2. Confirm containers are running ([Step 2](#step-2--start-the-database-containers)).
3. Confirm port mappings ([Step 3](#step-3--confirm-published-ports)).
4. Ensure **WSL integration** is enabled (Docker Desktop → Settings → Resources → WSL integration).
5. Temporarily try the WSL IP instead of `localhost`:
   - In WSL: `hostname -I | awk '{print $1}'`
   - Use that IP in DBeaver / Compass / Redis Insight (same ports).

### `docker` not found in WSL after restart

Docker Desktop is not running or WSL integration is disabled. Run **Step 0a** and **Step 0c** above.

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
cd ~/suspicious-email-triage
docker compose -f infra/docker/docker-compose.yml down
```

Add `-v` only if you intentionally want to remove named volumes (this wipes container data).
