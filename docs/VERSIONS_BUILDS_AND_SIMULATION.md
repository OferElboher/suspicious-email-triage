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

After that script finishes, start the stack with `DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up` (see [Local development: recommended multi-terminal layout](#local-development-recommended-multi-terminal-layout) below).

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

- active local file: `backend/.env`, created as a dev copy by default
- fallback default: `backend/.env.dev` when `backend/.env` is absent
- staging: `DEPLOYMENT_ENV=staging` loads `backend/.env.staging`
- prod: `DEPLOYMENT_ENV=prod` loads `backend/.env.prod`

You can also override the exact file path:

```bash
# Use a private env file without editing tracked sample profiles.
ENV_FILE=backend/.env.private npm start --prefix backend
```

## Local development: recommended multi-terminal layout

These commands assume you are at the repository root: `/home/ofer/suspicious-email-triage` (adjust paths if yours differ).

### Terminal A — infrastructure + API + python workers (Docker)

Command:

```bash
# Start local dev infrastructure and services. Docker Compose creates MongoDB,
# PostgreSQL, Redis, Redpanda/Kafka, the Node API, the Celery worker, and the dispatcher.
docker compose -f infra/docker/docker-compose.yml up --build
```

To use a different profile with Compose:

```bash
# Staging sample profile.
DEPLOYMENT_ENV=staging docker compose -f infra/docker/docker-compose.yml up --build

# Production sample profile.
DEPLOYMENT_ENV=prod docker compose -f infra/docker/docker-compose.yml up --build
```

Expected output (high level, not byte-for-byte):

- `mongo` starts and listens internally on `27017` (mapped to host `27018` in the provided compose file).
- `postgres` starts and listens on host port `5432` for chart statistics.
- `redis` starts on host port `6379`.
- `redpanda` exposes Kafka protocol on host port `19092` (and internally on `9092` inside the compose network).
- `backend` builds the Node image and prints `listening on 3000` (from the API logger).
- `ai-celery` prints Celery worker boot logs.
- `ai-kafka-dispatch` prints dispatcher logs like `consumer started`.

### Terminal B — React UI (host machine)

Command (from repository root):

```bash
# Install frontend libraries only if they were not installed already, then start the UI.
test -d frontend/node_modules || npm install --prefix frontend && npm start --prefix frontend
```

Expected output:

- CRA prints a local URL such as `http://localhost:3000` **or** it may choose another port if `3000` is taken.
- If the API is on `http://localhost:3000` and CRA also wants `3000`, set `PORT=3001` for the frontend:

```bash
# Start the frontend on port 3001 if the backend already uses port 3000.
PORT=3001 npm start --prefix frontend
```

Then set the API base for the UI:

```bash
# Point the frontend at the local Node API while serving the UI on port 3001.
REACT_APP_API_URL=http://localhost:3000 PORT=3001 npm start --prefix frontend
```

### Browser

Open the URL CRA printed (commonly `http://localhost:3000` or `http://localhost:3001`).

You should see:

- **Triage workspace** tab for submissions
- **Analytics & graphs** tab for charts (requires some PostgreSQL statistics events to look interesting). Use **Auto-refresh: on** for a live rolling 24-hour view, or **Auto-refresh: off** with **Apply range** for a custom window.

## Simulation mode (dev only)

Simulation creates synthetic `Review` documents at a capped rate and runs them through the same enqueue path as real submissions.

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
