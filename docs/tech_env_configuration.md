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
JWT_SECRET=dev-jwt-secret-change-before-staging-or-prod
# Set via: bash scripts/configure-dev-bootstrap-admin.sh YOUR_EMAIL@example.com
AUTH_BOOTSTRAP_ADMIN_PASSWORD=temp-admin-pswd
```

Authentication variables are documented in `auth_guide_rbac.md`, [auth_guide_dev_admin_credentials.md](auth_guide_dev_admin_credentials.md), and [auth_guide_dev_auth_recovery.md](auth_guide_dev_auth_recovery.md).

Neo4j graph variables (`NEO4J_*`, `GRAPH_INTERNAL_TOKEN`, `BACKEND_INTERNAL_URL`) are documented in [graph_guide_neo4j_phishing.md](graph_guide_neo4j_phishing.md) and [tech_neo4j_setup_wsl_windows.md](tech_neo4j_setup_wsl_windows.md).

LLM and PostgreSQL prompt context variables (`DISABLE_LLM`, `LLM_*`, `STATISTICS_PG_URL`) are documented in [data_guide_mock_llm.md](data_guide_mock_llm.md).

---

## Backend usage

The runtime config loads the selected profile:

```javascript
const { mongoUri, statsPgUrl } = require("./config/runtime");
```

---

## React usage

| Variable | When to set |
|----------|-------------|
| `REACT_APP_API_URL` | **Production builds only** (`npm run build`) — baked into the static bundle. Example: `https://api.example.com`. |
| *(unset in dev)* | **Recommended for `npm start`:** leave unset so `frontend/src/lib/apiBase.js` returns an empty base and `setupProxy.js` forwards API paths to port **3000**. Avoid `REACT_APP_API_URL=http://localhost:3000` during dev — it used to cause cross-origin login failures. |
| `REACT_APP_PROXY_TARGET` | Optional override for proxy target (default `http://localhost:3000`). |
| `PORT` | CRA dev server port (default **3001** in project docs). |

Details: [stack_guide_frontend_api.md](stack_guide_frontend_api.md).

---

## Notes

- `MONGO_URI` points to review storage; `STATISTICS_PG_URL` points to chart statistics.
- Never hardcode ports
- Keep private `.env` overrides out of git

