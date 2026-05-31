# Run the dev stack after Windows 11 startup

This guide tells you **exactly** how to bring the Suspicious Email Triage project up on **Windows 11 + WSL** after a reboot or cold start, connect **DBeaver / MongoDB Compass / Redis Insight**, and open the React UI.

**Audience:** developers using the local `dev` deployment slice.

---

## Before you start

1. Repository checked out in WSL (for example `/home/you/suspicious-email-triage`).
2. One-time setup completed: `bash scripts/setup-and-build-dev.sh` (installs tools, prompts for your bootstrap admin email, builds images).
3. Bootstrap admin configured — see [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md) if you have never set `AUTH_BOOTSTRAP_ADMIN_EMAIL`.

---

## Part 1 — Databases and Windows GUI clients (required first)

After every Windows restart, Docker Desktop and containers are stopped. **Do not skip this part.**

Follow every step in **[windows_docker_databases_start_and_verify.md](windows_docker_databases_start_and_verify.md)**, starting with **After Windows 11 restarts → Step 0a** (start Docker Desktop).

Minimum commands (WSL, repository root) once Docker Desktop is running:

```bash
cd ~/suspicious-email-triage
docker --version
docker compose version
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d mongo postgres redis neo4j
docker compose -f infra/docker/docker-compose.yml ps mongo postgres redis neo4j
```

When databases are healthy, connect GUI tools on **Windows** (not WSL):

| Tool | Guide | Host | Port |
|------|-------|------|------|
| DBeaver (PostgreSQL) | [dbeaver_postgresql_windows_setup.md](dbeaver_postgresql_windows_setup.md) | `localhost` | `5432` |
| MongoDB Compass | [mongodb_compass_windows_setup.md](mongodb_compass_windows_setup.md) | `localhost` | `27018` |
| Redis Insight | [redis_insight_windows_setup.md](redis_insight_windows_setup.md) | `localhost` | `6379` |
| Neo4j Browser / Bolt | [neo4j_wsl_windows_setup_guide.md](neo4j_wsl_windows_setup_guide.md) | `localhost` | `7474` (HTTP), `7687` (Bolt) |

Auth tables and unified logs in DBeaver: [dbeaver_auth_tables_and_unified_log_viewing.md](dbeaver_auth_tables_and_unified_log_viewing.md).

---

## Part 2 — Sign in credentials

Bootstrap admin email and password are **not** fixed defaults — you choose a **real email** at build/setup time.

| Setting | Where | Value |
|---------|-------|-------|
| Email | `backend/.env` → `AUTH_BOOTSTRAP_ADMIN_EMAIL` | Your email (set by `configure-dev-bootstrap-admin.sh`) |
| Temporary password | `backend/.env.dev` / `backend/.env` | `temp-admin-pswd` |

Full procedures (first login, change password, forgot password, change email): **[dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md)**.

**Cannot sign in though DBeaver shows your email in `auth_users`?** The password is stored as a bcrypt hash — use [dev_auth_tables_reset_and_admin_recovery.md](dev_auth_tables_reset_and_admin_recovery.md).

If `auth_users` is empty after starting the API, create the admin:

```bash
cd ~/suspicious-email-triage
bash scripts/bootstrap-auth-admin.sh
```

---

## Part 2.5 — Two web servers: why you use BOTH Docker AND `npm start` (read this if ports confuse you)

When you follow the steps below, you are **doing the right thing**. This project intentionally runs **two separate programs** on **two different port numbers**.

Think of it like a restaurant:

| Role | Real-world analogy | This project | Port | How you start it |
|------|-------------------|--------------|------|------------------|
| **Kitchen** | Cooks food, stores recipes, talks to suppliers | **Node/Express API** (`triage-backend` container) | **3000** | Docker: `docker compose up -d backend ...` |
| **Dining room** | Menus and tables for customers | **React web UI** (Create React App) | **3001** | Host: `REACT_APP_API_URL=http://localhost:3000 PORT=3001 npm start --prefix frontend` |

### What happens when you browse `http://localhost:3001`

1. Your browser loads the **React app** (HTML + JavaScript) from port **3001**.
2. When you sign in, submit a review, or open **Phishing graph**, the JavaScript **automatically calls the API on port 3000** in the background (`REACT_APP_API_URL=http://localhost:3000`).
3. You **do not** need to open port 3000 in the browser for normal work — the UI does it for you.

### Your exact commands (correct workflow)

```bash
# Step 1 — start API, databases, workers (includes backend on port 3000 inside Docker)
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --build

# Step 2 — start the web UI on port 3001 (in the same or another terminal)
REACT_APP_API_URL=http://localhost:3000 PORT=3001 npm start --prefix frontend
```

Then open **`http://localhost:3001`** in the browser. That is the intended address.

### When would you use port 3000 directly?

| Use case | Example |
|----------|---------|
| Health check | `curl http://localhost:3000/health` |
| Login API / scripts | `bash scripts/curl-graph-api.sh EMAIL PASSWORD` |
| Debugging with curl/Postman | `http://localhost:3000/graph/status` with a JWT |

**Do not** expect `curl http://localhost:3001/graph/status` to return JSON — port 3001 only serves the React HTML shell.

More detail: [frontend_backend_integration_guide.md](frontend_backend_integration_guide.md), [neo4j_wsl_windows_setup_guide.md](neo4j_wsl_windows_setup_guide.md).

---

## Part 3 — Local development: recommended multi-terminal layout

These commands assume the repository root: `~/suspicious-email-triage` (adjust if yours differs).

### Terminal A — infrastructure + API + Python workers (Docker)

Start the full local dev stack:

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up --build
```

To use a different profile with Compose:

```bash
# Staging sample profile.
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=staging docker compose -f infra/docker/docker-compose.yml up --build

# Production sample profile.
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=prod docker compose -f infra/docker/docker-compose.yml up --build
```

Expected output (high level, not byte-for-byte):

- `mongo` starts and listens internally on `27017` (mapped to host `27018` in the provided compose file).
- `postgres` starts and listens on host port `5432` for chart statistics.
- `redis` starts on host port `6379`.
- `redpanda` exposes Kafka protocol on host port `19092` (and internally on `9092` inside the compose network).
- `backend` builds the Node image and prints `listening on 3000` (from the API logger).
- `django-admin` runs migrations then prints `Starting development server at http://0.0.0.0:8000/` (port **8000** on the host — required for **User administration**).
- `ai-celery` prints Celery worker boot logs.
- `ai-kafka-dispatch` prints dispatcher logs like `consumer started`.

**Databases-only shortcut** (if Terminal A feels heavy and you only need GUI clients + API later):

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d mongo postgres redis backend django-admin ai-celery ai-kafka-dispatch redpanda
```

### Terminal B — React UI (host machine)

From the repository root:

```bash
cd ~/suspicious-email-triage
test -d frontend/node_modules || npm install --prefix frontend
REACT_APP_API_URL=http://localhost:3000 PORT=3001 npm start --prefix frontend
```

Expected output:

- CRA prints a local URL such as `http://localhost:3001`.
- If port `3001` is taken, set another free port: `PORT=3002 REACT_APP_API_URL=http://localhost:3000 npm start --prefix frontend`.

### Browser

1. Open the URL CRA printed (commonly `http://localhost:3001`).
2. **Sign in** with the email you configured and temporary password `temp-admin-pswd` — see [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md).
3. You should see:
   - **Triage workspace** tab for submissions
   - **Analytics & graphs** tab for charts — see [analytics_and_graphs_guide.md](analytics_and_graphs_guide.md)
   - **User administration** button (admin role only) → Django admin — see [django_admin_user_management.md](django_admin_user_management.md)

**Browser refresh (F5)** keeps the current tab. The UI stores the active view in the URL hash:

| Tab | URL example |
|-----|-------------|
| Triage workspace | `http://localhost:3001/` |
| Analytics & graphs | `http://localhost:3001/#analytics` |
| Phishing graph (Neo4j) | `http://localhost:3001/#graph` |
| Django user admin | `http://localhost:8000/admin/` (admin role; also via **User administration** button) |

You can bookmark or share these URLs; after sign-in, opening one lands on that tab directly.

### Quick API health check (optional, WSL)

```bash
curl -sS http://localhost:3000/health
curl -sS -o /dev/null -w 'Django admin HTTP %{http_code}\n' http://localhost:8000/admin/login/
```

Expected: JSON with `"ok": true` (or similar) from the API; **`HTTP 200`** from Django admin login. If port 8000 fails, see [django_admin_user_management.md](django_admin_user_management.md#troubleshooting).

---

## Part 4 — Stop the stack

From the repository root (WSL):

```bash
cd ~/suspicious-email-triage
docker compose -f infra/docker/docker-compose.yml down
```

Add `-v` only if you intentionally want to remove named volumes (this wipes container data).

Stop the React dev server with **Ctrl+C** in Terminal B.

---

## Related docs

- [windows_docker_databases_start_and_verify.md](windows_docker_databases_start_and_verify.md) — Docker Desktop after restart, DB ports, health checks
- [django_admin_user_management.md](django_admin_user_management.md) — Django admin user CRUD
- [analytics_and_graphs_guide.md](analytics_and_graphs_guide.md) — analytics charts
- [dev_auth_tables_reset_and_admin_recovery.md](dev_auth_tables_reset_and_admin_recovery.md) — reset auth tables, fix login when password unknown
- [VERSIONS_BUILDS_AND_SIMULATION.md](VERSIONS_BUILDS_AND_SIMULATION.md) — dev/staging/prod profiles, simulation mode, build-only commands
- [AUTHENTICATION_AND_RBAC.md](AUTHENTICATION_AND_RBAC.md) — roles, permissions, protected routes
