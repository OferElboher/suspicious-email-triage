# Running the local stack

This guide is for local development. The `dev` version uses local Docker Compose services for MongoDB, PostgreSQL, Redis, and Redpanda/Kafka. You do not need to install MongoDB or PostgreSQL directly on the host machine for the normal dev path.

## Quick start: setup and build

From the repository root, one command checks/installs prerequisites and builds dev images:

```bash
bash scripts/setup-and-build-dev.sh
# or: npm run build:dev
```

Then continue with the terminal layout below to start services and the React UI.

## First, check required tools

```bash
# Docker runs the local databases, queues, and service containers.
command -v docker >/dev/null 2>&1 && docker --version || echo "Docker is missing"

# Docker Compose starts the multi-container dev stack.
docker compose version >/dev/null 2>&1 && docker compose version || echo "Docker Compose plugin is missing"

# Node and npm run the React dev server and JS tooling.
command -v node >/dev/null 2>&1 && node --version || echo "Node.js is missing"
command -v npm >/dev/null 2>&1 && npm --version || echo "npm is missing"
```

## Terminal 1 — local infrastructure and backend services

```bash
# From the repository root, start MongoDB, PostgreSQL, Redis, Redpanda/Kafka, Node API, Celery, and dispatcher.
docker compose -f infra/docker/docker-compose.yml up --build
```

Expected signs:

- MongoDB container stays running.
- PostgreSQL container stays running and stores chart statistics.
- Redis container stays running.
- Redpanda container starts Kafka-compatible listeners.
- Backend logs mention `listening on 3000`.
- Celery and dispatcher logs show startup messages.

## Terminal 2 — React frontend

From repository root:

```bash
# Install frontend libraries when needed, then start the local browser UI.
test -d frontend/node_modules || npm install --prefix frontend && \
  REACT_APP_API_URL=http://localhost:3000 PORT=3001 npm start --prefix frontend
```

## Browser

Open:

```text
http://localhost:3001
```

You should see the triage workspace, analytics graphs (with optional **Auto-refresh** for the rolling last 24 hours), and (because this is `dev`) the simulation controls.

## Health checks

```bash
# API health check.
curl http://localhost:3000/health

# Local MongoDB ping through the host port exposed by docker-compose.
mongosh --port 27018 --eval "db.runCommand({ ping: 1 })"

# Local PostgreSQL readiness check for chart statistics.
docker compose -f infra/docker/docker-compose.yml exec postgres pg_isready -U triage -d triage_stats
```

If `mongosh` is not installed, you can still use the application normally; Docker is running MongoDB inside the compose stack. The PostgreSQL check uses the container’s own `pg_isready`, so it does not require host PostgreSQL tools.

## Reset local dev data

Use the UI button **Reset local databases & queues** in development mode, or call the endpoint directly:

```bash
# Stop simulation and clear local MongoDB reviews, PostgreSQL stats, Redis, and Kafka ingest backlog.
curl -sS -X POST "http://localhost:3000/dev/reset-local-state" \
  -H "content-type: application/json" \
  -d '{}'
```

## Notes

- Dev databases are local.
- MongoDB stores review records; PostgreSQL stores chart statistics.
- Staging and production databases/statistics stores are remote and credentialed.
- The old Node BullMQ worker can still be started through the `legacy-bullmq` profile, but the default path is Kafka → Celery.
