# ENV_CONFIGURATION.md

## Purpose

Centralize configuration (ports, DB URL, secrets).

### In normal language

Environment variables are the “control panel” for deployments. They let the same code run locally, in staging, or in production while pointing at different databases and toggling optional features (like Kafka ingest or dev simulation) without rewriting source files.

---

## Profile files

The backend now loads an environment profile file rather than relying on a single unnamed `.env` file:

- `backend/.env` is the active local file and is created as a dev copy by default.
- `backend/.env.dev` is the fallback when `backend/.env` is absent.
- `backend/.env.staging` is selected with `DEPLOYMENT_ENV=staging`.
- `backend/.env.prod` is selected with `DEPLOYMENT_ENV=prod`.
- `ENV_FILE=/path/to/file` can override the selected file when you need a private local file.

Real shell environment variables still win over values from these files.

## Example dev profile

```
PORT=3000
DEPLOYMENT_ENV=dev
MONGO_URI=mongodb://localhost:27018/triage
STATISTICS_PG_URL=postgres://triage:triage@localhost:5432/triage_stats
REDIS_HOST=localhost
REDIS_PORT=6379
KAFKA_BROKERS=localhost:19092
USE_KAFKA_INGEST=true
USE_BULLMQ_ENQUEUE=false
SIMULATION_MAX_EVENTS_PER_MIN=30
MERGED_LOG_PATH=./logs/merged.log
```

---

## Backend usage

The runtime config loads the selected profile:

```javascript
const { mongoUri, statsPgUrl } = require("./config/runtime");
```

---

## React usage

```
REACT_APP_API_URL=http://localhost:3000
```

---

## Notes

- `MONGO_URI` points to review storage; `STATISTICS_PG_URL` points to chart statistics.
- Never hardcode ports
- Keep private `.env` overrides out of git

