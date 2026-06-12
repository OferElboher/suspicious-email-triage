# ENV_CONFIGURATION.md

## Purpose

Centralize configuration (ports, DB URL, secrets).

### In normal language

Environment variables are the “control panel” for deployments. They let the same code run locally, in staging, or in production while pointing at different databases and toggling optional features (like Kafka ingest or dev simulation) without rewriting source files.

---

## Profile files (non-sensitive metadata only)

Committed profile files contain **hostnames, ports, and feature flags** — not passwords or API keys. Credentials live in gitignored `*.secrets` files loaded at container startup (see [ops_guide_secrets_management.md](ops_guide_secrets_management.md)).

| File | Role |
|------|------|
| `backend/.env.dev` | Local Docker defaults; `SECRETS_BUNDLE_ID=triage/dev` |
| `backend/.env.staging` | Staging metadata; credentials in `backend/staging.secrets` |
| `backend/.env.prod` | Production metadata; credentials in `backend/prod.secrets` or real AWS |
| `backend/dev.secrets` | **Gitignored** — JWT, DB passwords, OAuth secrets for dev |
| `backend/ci.secrets` | **Committed fake values** for Jest/pytest/CI only |
| `ENV_FILE=/path/to/file` | Override which profile file dotenv loads |

Real shell environment variables still win over values from profile files. Secrets injected after the profile override credential keys.

## Example dev profile (excerpt — no secrets)

```
PORT=3000
DEPLOYMENT_ENV=dev
SECRETS_PROVIDER=mock-aws
SECRETS_MANAGER_URL=http://mock-secrets-manager:4566
SECRETS_BUNDLE_ID=triage/dev
MONGO_URI=mongodb://mongo:27017/triage
POSTGRES_HOST=postgres
POSTGRES_USER=triage
REDIS_HOST=redis
USE_KAFKA_INGEST=true
```

Example **dev.secrets** keys (read `backend/dev.secrets.example` — never paste values into docs):

```
JWT_SECRET=<in dev.secrets>
POSTGRES_PASSWORD=<in dev.secrets>
NEO4J_PASSWORD=<in dev.secrets>
AUTH_BOOTSTRAP_ADMIN_EMAIL=<set via configure-dev-bootstrap-admin.sh>
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

- `MONGO_URI` points to review storage; `STATISTICS_PG_URL` (password in secrets) points to chart statistics.
- Never hardcode ports
- Keep `*.secrets` and legacy `backend/.env` overrides out of git
---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — WSL, repository root unless noted</p>

```bash
cd ~/suspicious-email-triage/backend
DEPLOYMENT_ENV=dev node -e "const r=require('./src/config/runtime'); console.log('deployment', process.env.DEPLOYMENT_ENV || 'dev');"
```

</div>

