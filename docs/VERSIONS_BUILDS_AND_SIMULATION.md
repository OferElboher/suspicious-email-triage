# Versions, builds, simulation mode, and “how do I run this locally?”

This document is written for engineers who want predictable commands without a brittle checklist. It treats **development (`dev`) as the default** slice: local Docker Compose brings up local databases and queues, and the UI unlocks the optional **simulation** controls.

## What “dev / staging / prod” means here

These names are **deployment slices**, not magic keywords. They are selected with:

- `DEPLOYMENT_ENV` (preferred), or
- `APP_ENV` (alias)

The API reads this value in `backend/src/config/runtime.js`.

### Development (`dev`) — default

**Intent:** fast iteration, verbose logging, optional load generation, and charts for local demos.

**Typical properties:**

- `DEPLOYMENT_ENV=dev`
- Local MongoDB, PostgreSQL, Redis, and Redpanda/Kafka through Docker Compose
- Simulation endpoints enabled (`/dev/simulation`)
- UI shows the simulation panel when `/dev/features` reports `simulation: true`

### Staging (`staging`)

**Intent:** rehearsal environment that should behave like production, but with non-customer data and safer credentials rotation.

**Typical properties:**

- `DEPLOYMENT_ENV=staging`
- Remote MongoDB, PostgreSQL, Redis, and Kafka-compatible broker
- Simulation endpoints disabled (403)
- Stricter secrets management (still not “public internet secure” unless you engineer that separately)

### Production (`prod`)

**Intent:** real users, real data, minimum surprises.

**Typical properties:**

- `DEPLOYMENT_ENV=prod`
- Simulation endpoints disabled
- Kafka/Celery/Mongo/PostgreSQL/Redis endpoints point to managed infrastructure rather than compose defaults

## Required installations, checked and installed when possible

The easiest option is to run the repository setup script. It checks first, installs only what is missing when `apt-get` is available, and then installs project libraries only when needed:

```bash
# Recommended: one command for local dev prerequisites and project dependencies.
bash scripts/setup-local-dev.sh
```

To install prerequisites **and** build the dev Docker images in one step:

```bash
# Setup + dev image build (npm alias: npm run build:dev).
bash scripts/setup-and-build-dev.sh
```

After that script finishes, start the stack — see [windows_dev_startup_run_guide.md](windows_dev_startup_run_guide.md) (Windows 11 + WSL) or run `DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up` from the repository root.

If you prefer to do the checks manually, the commands below use the same idea. They are meant for Ubuntu/WSL-style development machines. If you use another OS, keep the same spirit: check first, then install only what is absent.

```bash
# Helper: install an apt package only when apt-get exists.
install_if_missing() {
  command_name="$1"
  package_name="$2"

  if command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name already installed"
    return 0
  fi

  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y "$package_name"
  else
    echo "Please install $package_name manually; apt-get is unavailable."
  fi
}

install_package_if_possible() {
  package_name="$1"
  if command -v apt-get >/dev/null 2>&1; then
    sudo apt-get update
    sudo apt-get install -y "$package_name"
  else
    echo "Please install $package_name manually; apt-get is unavailable."
  fi
}

# 1) Docker runs local MongoDB, PostgreSQL, Redis, Redpanda/Kafka, API, and workers.
if command -v docker >/dev/null 2>&1; then
  echo "Docker already installed: $(docker --version)"
else
  install_if_missing docker docker.io
fi

# 2) Docker Compose starts the local dev stack in the right order.
if docker compose version >/dev/null 2>&1; then
  echo "Docker Compose already installed: $(docker compose version)"
else
  install_package_if_possible docker-compose-plugin
fi

# 3) Node.js runs the Express API tooling and React development server.
if command -v node >/dev/null 2>&1; then
  echo "Node already installed: $(node --version)"
else
  install_if_missing node nodejs
fi

# 4) npm installs JavaScript libraries for backend and frontend packages.
if command -v npm >/dev/null 2>&1; then
  echo "npm already installed: $(npm --version)"
else
  install_if_missing npm npm
fi

# 5) Python runs the Celery/Kafka scoring service.
if command -v python3 >/dev/null 2>&1; then
  echo "Python already installed: $(python3 --version)"
else
  install_if_missing python3 python3
fi

# 6) pip installs Python libraries for ai_service.
if python3 -m pip --version >/dev/null 2>&1; then
  echo "pip already installed: $(python3 -m pip --version)"
else
  install_if_missing pip3 python3-pip
fi
```

## Local library installation, skipped when already present

Run from the repository root:

```bash
# 1) Install root tooling only if root node_modules is absent.
test -d node_modules || npm install --prefix .

# 2) Install backend libraries only if backend/node_modules is absent.
test -d backend/node_modules || npm install --prefix backend

# 3) Install frontend libraries only if frontend/node_modules is absent.
test -d frontend/node_modules || npm install --prefix frontend

# 4) Install Python libraries into ai_service/.venv (required on PEP 668 systems such as Ubuntu 24.04).
bash scripts/ensure-ai-service-venv.sh >/dev/null && echo "ai_service/.venv ready"
```

The local databases themselves do not need bare-metal installation. In `dev`, MongoDB, PostgreSQL, Redis, and Redpanda/Kafka are provided by Docker Compose.

## Environment profiles

The backend loads one profile file:

- active local file: `backend/.env`, created as a dev copy by default (gitignored; holds your bootstrap admin email)
- fallback default: `backend/.env.dev` when `backend/.env` is absent
- staging: `DEPLOYMENT_ENV=staging` loads `backend/.env.staging`
- prod: `DEPLOYMENT_ENV=prod` loads `backend/.env.prod`

Configure bootstrap admin email before first run:

```bash
bash scripts/configure-dev-bootstrap-admin.sh YOUR_EMAIL@example.com
```

See [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md) for sign-in, password change, and recovery. To reset auth tables and recreate admin, see [dev_auth_tables_reset_and_admin_recovery.md](dev_auth_tables_reset_and_admin_recovery.md).

You can also override the exact file path:

```bash
# Use a private env file without editing tracked sample profiles.
ENV_FILE=backend/.env.private npm start --prefix backend
```

## Local development: run the stack

**Windows 11 + WSL:** after every OS restart, follow [windows_dev_startup_run_guide.md](windows_dev_startup_run_guide.md) (Docker Desktop, databases, multi-terminal layout, DBeaver/Compass/Redis Insight, UI sign-in).

That guide links to [windows_docker_databases_start_and_verify.md](windows_docker_databases_start_and_verify.md) and [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md).

Quick start from repository root (when Docker is already running):

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up --build
```

Frontend (separate terminal):

```bash
REACT_APP_API_URL=http://localhost:3000 PORT=3001 npm start --prefix frontend
```

Open `http://localhost:3001` (workspace), `http://localhost:3001/#analytics`, or Django admin at `http://localhost:8000/admin/` (admin role). Browser refresh (F5) keeps the current triage tab.

Sign in with the email you configured via `configure-dev-bootstrap-admin.sh` and temporary password `temp-admin-pswd` — see [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md). If login fails despite a row in `auth_users`, see [dev_auth_tables_reset_and_admin_recovery.md](dev_auth_tables_reset_and_admin_recovery.md).

## Simulation mode (dev only, developer role)

Simulation creates synthetic `Review` documents at a capped rate and runs them through the same enqueue path as real submissions. The signed-in user must have the **`developer` role** (and `DEPLOYMENT_ENV=dev`). See `AUTHENTICATION_AND_RBAC.md`.

### Configure via UI

In `dev`, the triage workspace shows a dashed **Simulation mode (development)** card:

- Toggle **Enable synthetic ingests**
- Choose **Target events per minute** (clamped server-side)
- Click **Update simulation**

The same development card also includes **Reset local databases & queues**. That button:

- turns simulation off,
- deletes local MongoDB review documents,
- truncates local PostgreSQL statistics,
- flushes Redis queues/state,
- recreates the local Kafka/Redpanda ingest topic.

This is intentionally available only in `dev`.

### Configure via HTTP (curl)

```bash
# Enable local synthetic traffic at a safe, small rate.
curl -sS -X POST "http://localhost:3000/dev/simulation" \
  -H "content-type: application/json" \
  -d '{"enabled":true,"eventsPerMinute":3}' | jq .
```

Expected output shape:

```json
{ "ok": true, "simulation": { "enabled": true, "eventsPerMinute": 3 } }
```

If you call this while not in `dev`, you should see:

```json
{ "error": "dev_only" }
```

### Reset local development state with HTTP

```bash
# Clear local dev data and queues, and stop simulation if it is active.
curl -sS -X POST "http://localhost:3000/dev/reset-local-state" \
  -H "content-type: application/json" \
  -d '{}' | jq .
```

Expected output shape:

```json
{
  "ok": true,
  "summary": {
    "simulation": "disabled",
    "mongoReviewsDeleted": 12,
    "postgresStats": "cleared",
    "redis": "flushed",
    "kafka": "topic_recreated"
  }
}
```

## Building images only (no run)

```bash
# Build local images without starting containers.
docker compose -f infra/docker/docker-compose.yml build
```

Expected output: Docker prints build steps and ends with `Successfully tagged ...` lines.

## Notes on “expected output”

Exact log lines change with dependency versions. What matters is **stable health signals**:

- API responds `200` on `GET /health`
- Creating a review returns `201` from `POST /reviews`
- Kafka dispatcher logs show `dispatched` for new IDs
- Celery logs show task start/done lines without tracebacks
