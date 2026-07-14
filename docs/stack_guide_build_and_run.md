# Build, bootstrap, and sign in — complete dev workflow

This guide walks you through **every step** from a fresh clone (or a Docker rebuild) to a working **sign-in** at `http://localhost:3001`. It explains *why* each step exists, which **technologies** are involved, and how to recover when login fails after `docker compose build`.

**Audience:** developers new to Docker, Create React App (CRA), or JWT auth in this project.

**Staging or production deploy?** This guide is for **local dev only**. Use [stack_guide_production.md](stack_guide_production.md) for the staging/prod runbook.

**Related:** [auth_guide_dev_admin_credentials.md](auth_guide_dev_admin_credentials.md), [stack_guide_windows_startup.md](stack_guide_windows_startup.md), [stack_guide_frontend_api.md](stack_guide_frontend_api.md)

---



## Why login breaks after `docker compose build`

Three things interact:


| Piece                | Technology                                               | What happens on rebuild                                                                                              |
| -------------------- | -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Postgres volume**  | Docker named volume `postgres-data`                      | **Survives** rebuild — `auth_users` rows and bcrypt password hashes stay                                             |
| **Bootstrap script** | Node + `authPg.bootstrapAdminUser()`                     | Runs **only when the user table is empty** — does **not** reset an existing password                                 |
| **Backend env**      | `env_file: backend/.env.dev` + gitignored `backend/.env` | Injected when the **container starts** — changing `.env` without recreating the container leaves stale values inside |


So after rebuild you often have: **old password hash in Postgres**, **new** `AUTH_BOOTSTRAP_`* **in** `.env`, or **wrong email typed in the UI**. That looks like “invalid credentials” even though DBeaver shows your email in `auth_users`.

**Fix (pick one):**

1. **Sign-in screen** → **Reset dev bootstrap password** (calls `POST /auth/dev/bootstrap-reset`).
2. **Terminal:** `bash scripts/bootstrap-auth-admin.sh --reset-password`
3. **Manual:** [auth_guide_dev_auth_recovery.md](auth_guide_dev_auth_recovery.md)

---



## Architecture snapshot (ports and proxy)

```text
Browser (Windows)  →  http://localhost:3001  →  CRA dev server (React)
                              │
                              │  setupProxy.js forwards /auth, /reviews, …
                              ▼
                         http://backend:3000  (Docker network)
                              │
                              ▼
                         Node Express API + JWT (bcrypt passwords in Postgres)
```

- **Port 3000** — API inside Docker (also published to host `localhost:3000`).
- **Port 3001** — React UI; **do not** set `REACT_APP_API_URL` in dev (see [stack_guide_frontend_api.md](stack_guide_frontend_api.md)).
- **Auth pattern:** stateless **JWT** after `POST /auth/login`; passwords stored as **bcrypt** hashes in PostgreSQL `auth_users`.

---



## Part 1 — One-time setup (clone → images)



**Run in terminal** — WSL, repository root

```bash
cd ~/suspicious-email-triage
bash scripts/setup-and-build-dev.sh
```



**What this does:**

1. Checks Docker, Node, and helper tools.
2. Prompts for your **real** bootstrap admin email (`configure-dev-bootstrap-admin.sh`) — stored in gitignored `backend/.env`, not in GitHub.
3. Builds Docker images (`docker compose build`).

**Expected:** `AUTH_BOOTSTRAP_ADMIN_EMAIL=you@example.com` written to `backend/.env`.

---



## Part 2 — Start infrastructure

Choose **one** of the options below. Both use **`DEPLOYMENT_ENV=dev`**, which tells Docker Compose to load `backend/.env.dev` plus your gitignored `backend/.env` / `backend/dev.secrets`. That profile enables dev-only API routes (bootstrap password reset, dev simulation, local mocks). **Never commit real passwords** — they live only in gitignored files ([ops_guide_secrets_management.md](ops_guide_secrets_management.md)).

Docker Compose also starts **dependency containers** automatically. For example, `backend` declares `depends_on` for Redpanda (Kafka), Mailpit, mock secrets/Snowflake/S3, and Elasticsearch — so those start even if you do not name them on the command line.

---

### Option A — Minimal (sign-in + manual triage only)

Enough to **sign in**, submit reviews via the UI, and hit the API. Reviews stay **`pending`** until you add workers later ([stack_guide_full_feature_activation.md](stack_guide_full_feature_activation.md)).

**Run in terminal** — databases + API

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d mongo postgres redis neo4j backend
docker compose -f infra/docker/docker-compose.yml ps
```

| Service | Technology | Why it is here |
|---------|------------|----------------|
| `mongo` | MongoDB 6 | Review documents |
| `postgres` | PostgreSQL 16 | Auth (`auth_users`) + analytics stats |
| `redis` | Redis 7 | Cache / Celery broker |
| `neo4j` | Neo4j 5 | Phishing graph (optional until graph tab used) |
| `backend` | Node / Express | REST API on port **3000** |

Compose will also bring up **Mailpit**, **Redpanda**, **Elasticsearch**, and the **mock AWS** sidecars because `backend` depends on them — that is normal for this project’s dev profile.

---

### Option B — Full dev stack (recommended after clone)

Starts everything needed for **async analysis** (pending → processing → completed), **dev simulation**, **Elasticsearch search**, **Live flow dashboard** metrics, **phishing graph** sync, and **mock LLM** scoring — without starting optional extras like Django admin or the legacy BullMQ worker.

**Run in terminal** — dev version with workers, search, and mock LLM

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d elasticsearch mongo postgres redis neo4j backend ai-celery ai-kafka-dispatch mock-llm
docker compose -f infra/docker/docker-compose.yml ps
```

(Single line — same command without the line break:)

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d elasticsearch mongo postgres redis neo4j backend ai-celery ai-kafka-dispatch mock-llm
```

| Service | Technology | What it unlocks |
|---------|------------|-----------------|
| `elasticsearch` | Elasticsearch 8 (single-node) | **Search past reviews** tab (`#search`) |
| `mongo` / `postgres` / `redis` / `neo4j` | Same as Option A | Reviews, auth, stats, graph |
| `backend` | Node / Express | API + in-process **dev simulation** timer |
| `ai-kafka-dispatch` | Python Kafka consumer | Reads ingest events from **Redpanda** |
| `ai-celery` | Python Celery worker | LLM analysis → `completed` status |
| `mock-llm` | OpenAI-compatible mock | Zero-cost `LLM_PROVIDER=mock_commercial` |

**Also started via `depends_on` (not listed above):** `redpanda` (Kafka API), `mock-secrets-manager`, `mock-snowflake`, `mock-s3`, `mailpit`. See [stack_guide_full_feature_activation.md](stack_guide_full_feature_activation.md) if you want **Django admin** (port 8000) or a `--build` after code changes.

**Expected:** `backend`, `ai-celery`, and `ai-kafka-dispatch` show **running** (not restart-looping). Elasticsearch may take ~30 s before `GET /search/status` is reachable.

---

### Recreate backend after `.env` changes

If you changed `backend/.env` after the container was created, recreate the backend so env vars reload:

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --force-recreate backend
```

---



## Part 3 — Bootstrap admin (first time or after rebuild)



### First time (empty `auth_users`)

```bash
cd ~/suspicious-email-triage
bash scripts/bootstrap-auth-admin.sh
```

**Expected:** `Bootstrap admin created: you@example.com`

### After rebuild (users already exist — login fails)

```bash
cd ~/suspicious-email-triage
bash scripts/bootstrap-auth-admin.sh --reset-password
```

**Expected:** `Bootstrap admin password_reset: you@example.com`

This runs `resetBootstrapAdminForDev()` inside the backend container: sets password to `AUTH_BOOTSTRAP_ADMIN_PASSWORD` (default `temp-admin-pswd`) and ensures the `admin` role.

---



## Part 4 — Verify API login (before opening the browser)

Replace `you@example.com` with your configured email:

```bash
curl -sS -X POST "http://localhost:3000/auth/login" \
  -H "content-type: application/json" \
  -d '{"email":"you@example.com","password":"temp-admin-pswd"}' | python3 -m json.tool
```

**Expected:** JSON with `"token"` and `"user"` containing `"roles": ["admin"]`.

If this works but the UI fails, the problem is almost always the **CRA proxy** — see [stack_guide_frontend_api.md](stack_guide_frontend_api.md).

---



## Part 5 — Start React UI and sign in

If you used **Option B** in Part 2, you can use **dev simulation** and the **Live flow dashboard** (`#flow`) as soon as you sign in — see [stack_guide_dev_simulation.md](stack_guide_dev_simulation.md) and [ui_guide_flow_dashboard.md](ui_guide_flow_dashboard.md).

```bash
cd ~/suspicious-email-triage
PORT=3001 npm start --prefix frontend
```

Open `http://localhost:3001`.


| Field    | Value                                                                |
| -------- | -------------------------------------------------------------------- |
| Email    | From `grep AUTH_BOOTSTRAP_ADMIN_EMAIL backend/.env`                  |
| Password | `temp-admin-pswd` unless you changed `AUTH_BOOTSTRAP_ADMIN_PASSWORD` |


The sign-in form shows a **masked** hint (`yo***@example.com`) from `GET /auth/config` when `DEPLOYMENT_ENV=dev`.

**UI recovery:** click **Reset dev bootstrap password** — same as `--reset-password` script.

---

