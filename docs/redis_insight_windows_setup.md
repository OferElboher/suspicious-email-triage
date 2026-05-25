# Redis Insight on Windows 11 → Redis in WSL Docker

Connect **Redis Insight** on Windows to the dev **Redis** instance used for Celery broker/result backends and lightweight API state.

**Prerequisite:** complete [windows_docker_databases_start_and_verify.md](windows_docker_databases_start_and_verify.md) through Step 5 (or the full [windows_dev_startup_run_guide.md](windows_dev_startup_run_guide.md) after a Windows restart).

## Values you will enter

| Setting | Value |
|---------|--------|
| Host | `localhost` |
| Port | `6379` |
| Username | *(leave empty)* |
| Password | *(leave empty)* |
| Database alias | `triage-dev` (any label you prefer) |

Default dev Redis has **no TLS and no password**. Logical Redis databases used by the app (from `backend/.env.dev`):

| Redis DB index | Purpose |
|----------------|---------|
| `0` | Celery broker (`CELERY_BROKER_URL=redis://redis:6379/0`) |
| `1` | Celery result backend (`CELERY_RESULT_BACKEND=redis://redis:6379/1`) |

---

## Step 1 — Install Redis Insight

1. Download [Redis Insight](https://redis.io/insight/) for Windows (or install via Redis’s official installer page).
2. Run the installer.
3. Launch **Redis Insight**.

*(UI labels vary slightly by Redis Insight version; the fields below map to the standard “Add Redis database” flow.)*

---

## Step 2 — Ensure Redis is running in Docker (WSL)

In a WSL terminal, from the repository root:

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d redis
```

Verify:

```bash
docker compose -f infra/docker/docker-compose.yml exec redis redis-cli ping
```

Expected:

```text
PONG
```

Confirm port mapping:

```bash
docker compose -f infra/docker/docker-compose.yml ps redis
```

Expected in **PORTS:** `0.0.0.0:6379->6379/tcp`.

---

## Step 3 — Add a database in Redis Insight

1. Open Redis Insight.
2. Click **Add Redis database** (or **+** / **Connect to a Redis database**).
3. Choose **Add database manually** (not cloud) if asked.

Enter:

1. **Host:** `localhost`
2. **Port:** `6379`
3. **Database alias:** `triage-dev`
4. **Username:** leave blank
5. **Password:** leave blank
6. **Database index:** leave default (`0`) for the first connection — you can switch indexes inside the UI later.

Do **not** use `redis` as the host — that is the Docker service name, not valid from Windows.

7. Click **Add Redis database** / **Connect**.

---

## Step 4 — Confirm connectivity

1. Redis Insight opens the **Browser** view for `localhost:6379`.
2. You should see keys appear after the app runs (Celery tasks, dev simulation state, etc.).
3. On an idle stack, the key list may be empty — that is still a successful connection if no error is shown.

Optional CLI check from WSL:

```bash
docker compose -f infra/docker/docker-compose.yml exec redis redis-cli -n 0 ping
docker compose -f infra/docker/docker-compose.yml exec redis redis-cli -n 1 ping
```

Both should return `PONG`.

---

## Step 5 — Inspect Celery broker vs results

Redis Insight lets you select the logical database index:

1. **DB 0** — Celery broker queues (lists, streams, or celery-related keys depending on workload).
2. **DB 1** — Celery task results.

Switch database index in the UI (often a **DB** dropdown or `SELECT` control) and refresh the key list.

Generate activity if keys are empty:

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d backend ai-celery ai-kafka-dispatch
```

Then submit a review in the UI or enable dev simulation.

---

## Step 6 — CLI reference (optional, WSL)

From the repository root:

```bash
# List keys in DB 0 (may be empty on a quiet stack)
docker compose -f infra/docker/docker-compose.yml exec redis redis-cli -n 0 keys '*'

# List keys in DB 1
docker compose -f infra/docker/docker-compose.yml exec redis redis-cli -n 1 keys '*'
```

Use sparingly in production-like environments; `KEYS *` is fine for local dev debugging.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Connection refused | Redis container down | `docker compose -f infra/docker/docker-compose.yml up -d redis` |
| Connection refused | Docker Desktop stopped | Start Docker Desktop |
| Auth error | Password configured elsewhere | Default dev has no password; clear auth fields |
| Port in use | Another Redis on 6379 | Stop conflicting Redis or remap compose host port |
| No keys | No traffic yet | Start workers and submit reviews / simulation |

Shared Docker/WSL troubleshooting: [windows_docker_databases_start_and_verify.md](windows_docker_databases_start_and_verify.md).

---

## Related GUI guides

- PostgreSQL (charts): [dbeaver_postgresql_windows_setup.md](dbeaver_postgresql_windows_setup.md)
- MongoDB (reviews): [mongodb_compass_windows_setup.md](mongodb_compass_windows_setup.md)
