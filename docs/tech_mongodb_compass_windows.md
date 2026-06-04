# MongoDB Compass on Windows 11 → MongoDB in WSL Docker

Connect **MongoDB Compass** on Windows to the dev **MongoDB** database that stores review documents and analysis results.

**Prerequisite:** complete [stack_guide_windows_docker_databases.md](stack_guide_windows_docker_databases.md) through Step 5 (or the full [stack_guide_windows_startup.md](stack_guide_windows_startup.md) after a Windows restart).

## Values you will enter

| Setting | Value |
|---------|--------|
| Connection URI | `mongodb://localhost:27018/triage` |
| Host | `localhost` |
| Port | **`27018`** (not 27017) |
| Database | `triage` |
| Authentication | None in default dev compose |

Default dev MongoDB has **no username/password**. Credentials in `.env` like `mongodb://mongo:27017/triage` use the Docker **service name** `mongo` — Compass on Windows must use **`localhost:27018`**.

---

## Step 1 — Install MongoDB Compass

1. Download [MongoDB Compass](https://www.mongodb.com/try/download/compass) for Windows.
2. Run the installer.
3. Launch **MongoDB Compass**.

---

## Step 2 — Ensure MongoDB is running in Docker (WSL)

In a WSL terminal, from the repository root:

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d mongo
```

Verify:

```bash
docker compose -f infra/docker/docker-compose.yml exec mongo mongosh --eval "db.runCommand({ ping: 1 })"
```

Confirm the host port mapping:

```bash
docker compose -f infra/docker/docker-compose.yml ps mongo
```

Expected in **PORTS:** `0.0.0.0:27018->27017/tcp`.

---

## Step 3 — Connect with the connection string

1. On the Compass start screen, find **New connection**.
2. In **URI**, paste:

```text
mongodb://localhost:27018/triage
```

3. Click **Connect**.

### Alternative: fill fields manually

1. Click **Advanced Connection Options** (if URI is hidden).
2. Set **Hostname:** `localhost`
3. Set **Port:** `27018`
4. Leave authentication **off** (default dev).
5. Click **Connect**, then select database **`triage`** in the left sidebar.

---

## Step 4 — Confirm connectivity

After a successful connection:

1. Compass shows cluster `localhost:27018`.
2. Open database **`triage`**.
3. You should see collections (collection names depend on app usage; reviews are typically stored in a **`reviews`** collection — exact name matches the Mongoose model in `backend/`).

If collections are empty, that is normal before any submissions. Generate traffic via the UI or dev simulation.

Quick ping from WSL (optional, if `mongosh` is installed on the host):

```bash
mongosh "mongodb://localhost:27018/triage" --eval "db.runCommand({ ping: 1 })"
```

---

## Step 5 — Explore review documents

1. Expand **`triage`** → **Collections**.
2. Open the reviews collection (commonly **`reviews`**).
3. Use the **Documents** tab to browse stored submissions, statuses, and `analysisResult` payloads.

Example filter in Compass (adjust field names if your schema differs):

```json
{ "status": "completed" }
```

---

## What this database is (and is not)

- **Is:** primary document store for triage **Review** records (ingest, processing status, analysis output, overrides).
- **Is not:** chart statistics — those are in PostgreSQL (`review_stats_events`). See [tech_postgresql_dbeaver_windows.md](tech_postgresql_dbeaver_windows.md).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Connection refused on `27017` | Wrong port | Use **`27018`** on Windows |
| Connection refused | Container down | `docker compose -f infra/docker/docker-compose.yml up -d mongo` |
| Used URI with `mongo:27017` | Docker-internal hostname | Replace with `mongodb://localhost:27018/triage` |
| Empty database | No data yet | Submit a review or run dev simulation |
| Timeout from Windows | Docker/WSL forwarding | Start Docker Desktop; see WSL IP fallback in [stack_guide_windows_docker_databases.md](stack_guide_windows_docker_databases.md) |

---

## Stop Mongo when finished (optional)

From the repository root in WSL:

```bash
docker compose -f infra/docker/docker-compose.yml stop mongo
```

Or stop the entire stack:

```bash
docker compose -f infra/docker/docker-compose.yml down
```
