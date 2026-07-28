# Staging and production services — mocks in dev, real cloud in staging/prod

This guide explains **how the same application code runs in three deployment slices** (`dev`, `staging`, `prod`) while **changing only configuration** — not forking source code. If you are new to environment profiles, secrets managers, or the difference between a Docker mock and a paid AWS service, read this before editing `.env` files.

**Deploy staging or production?** Follow the numbered runbook in [stack_guide_production.md](stack_guide_production.md) (Phases 1–7) — this document explains *why* each service switches from mock to cloud; the production guide lists *exact commands*.

**Related:** [data_guide_dev_mock_services.md](data_guide_dev_mock_services.md), [ops_guide_secrets_management.md](ops_guide_secrets_management.md), [tech_env_configuration.md](tech_env_configuration.md).

---

## The core pattern (configuration, not code forks)

| Idea | What it means |
|------|----------------|
| **Deployment slice** | `DEPLOYMENT_ENV=dev\|staging\|prod` selects `backend/.env.dev`, `.env.staging`, or `.env.prod` |
| **Secrets bundle** | Passwords and API keys live in gitignored `*.secrets` (dev file on disk) or **AWS Secrets Manager** (staging/prod) |
| **URL switching** | Each integration reads a base URL from env (`LLM_BASE_URL`, `SNOWFLAKE_URL`, …) — dev points at Docker mocks; staging/prod point at vendors |
| **Runtime helpers** | `backend/src/config/runtime.js` exposes `usesMockExternalServices()` — `true` only in **dev** |

**Note:** “Mock” does not mean fake business logic. The **mock HTTP servers** return the same JSON shapes as real vendors so Celery, Express, and the React UI behave identically — you only pay when URLs aim at cloud endpoints.

---

## Service matrix: dev vs staging vs prod

| Capability | Dev (`DEPLOYMENT_ENV=dev`) | Staging / Prod |
|------------|------------------------------|----------------|
| **Secrets** | `mock-secrets-manager` container → reads `backend/dev.secrets` | **AWS Secrets Manager** (`SECRETS_PROVIDER=aws`, IAM role) |
| **LLM scoring** | `mock-llm` container (free canned JSON) | **OpenAI / Azure OpenAI / Anthropic** via `LLM_BASE_URL=https://api.openai.com/v1` |
| **Analytics warehouse** | `mock-snowflake` in-memory REST | **Snowflake** cloud account (`SNOWFLAKE_URL`) |
| **Email (password reset)** | **Mailpit** (local inbox, no delivery) | **Amazon SES** or corporate SMTP (`EMAIL_DELIVERY=external`) |
| **MongoDB** | Docker `mongo` container | **MongoDB Atlas** or DocumentDB (URI in secrets) |
| **PostgreSQL** | Docker `postgres` | **Amazon RDS** or Cloud SQL (host in profile, password in secrets) |
| **Redis / Celery** | Docker `redis` | **Amazon ElastiCache** (TLS URL in secrets) |
| **Kafka ingest** | Docker **Redpanda** | **Amazon MSK** or Confluent Cloud |
| **Neo4j graph** | Docker Neo4j Community | **Neo4j Aura** or self-hosted cluster |
| **Full-text search** | Docker **Elasticsearch** single-node | **Amazon OpenSearch** or Elastic Cloud |
| **Central logs** | Local `merged.log` + API search | **CloudWatch Logs**, OpenSearch, or Loki (roadmap) |
| **Simulation / dev reset** | Enabled for developers | **Disabled** (`SIMULATION_MAX_EVENTS_PER_MIN=0`) |

Committed profile files (`backend/.env.staging`, `backend/.env.prod`) contain **hostnames and feature flags only** — never JWT keys or database passwords.

---

## How secrets load in each slice

```text
dev:     docker-entrypoint → GET mock-secrets-manager:4566/v1/secrets/triage/dev
         → inject JWT_SECRET, POSTGRES_PASSWORD, … into process.env

staging: docker-entrypoint → AWS SDK GetSecretValue(triage/staging)
         → IAM role on EKS/ECS (no secrets in git)

prod:    same as staging with bundle id triage/prod
```

**Code:** `backend/src/secrets/secretsProvider.js` — `mock-aws` vs `aws` providers; `ai_service/app/secrets_provider.py` — urllib mock vs **boto3**.

**CI/tests:** `SECRETS_PROVIDER=file` + committed `backend/ci.secrets` (fake values only).

---

## LLM: mock name, real API in staging/prod

The env value `LLM_PROVIDER=mock_commercial` is historical naming. The implementation (`ai_service/app/llm_client.py` → `analyze_with_mock_commercial`) sends a standard **OpenAI Chat Completions** POST:

| Variable | Dev | Staging / Prod |
|----------|-----|----------------|
| `LLM_BASE_URL` | `http://mock-llm:8090/v1` | `https://api.openai.com/v1` (or Azure/Anthropic compatible URL) |
| `LLM_API_KEY` | `dev-mock-key` (Compose default) | Real key from secrets bundle |
| `DISABLE_LLM` | often `true` (deterministic tests) | `false` for production scoring |

No code change is required to switch — only URLs and keys.

---

## Snowflake analytics

| Variable | Dev | Staging / Prod |
|----------|-----|----------------|
| `SNOWFLAKE_URL` | `http://mock-snowflake:4567` | Snowflake account URL or internal ETL proxy |
| `SNOWFLAKE_ENABLED` | `true` | `true` |

The Node client (`backend/src/analytics/snowflakeClient.js`) speaks a **project REST contract**. Production teams typically place a small proxy in front of Snowflake’s SQL API or use an ETL tool (Fivetran, dbt Cloud) — see [data_guide_snowflake_analytics.md](data_guide_snowflake_analytics.md).

---

## Docker Compose is dev-oriented

`infra/docker/docker-compose.yml` always includes **mock-*** containers for local convenience. **Cloud staging/prod deploys** (Helm/EKS, ECS) do **not** run `mock-secrets-manager`, `mock-llm`, or `mock-snowflake` — they use the URLs in `.env.staging` / `.env.prod`.

To exercise staging profile locally (without mocks):

```bash
DEPLOYMENT_ENV=staging docker compose -f infra/docker/docker-compose.yml up -d backend ai-celery
# Requires real AWS credentials and reachable remote hostnames in staging.secrets / AWS bundle.
```

For day-to-day laptop work, keep `DEPLOYMENT_ENV=dev`.

---

## Checklist before staging/prod deploy

Full step-by-step commands: **[stack_guide_production.md](stack_guide_production.md)** (Phases 1–7). Summary:

1. Create AWS Secrets Manager secrets `triage/staging` and `triage/prod` with keys from `backend/staging.secrets.example` / `prod.secrets.example`.
2. Set `SECRETS_PROVIDER=aws` and `AWS_REGION` on every Node/Python container.
3. Point `MONGO_URI`, `STATISTICS_PG_URL`, `CELERY_BROKER_URL` in the bundle at managed services.
4. Set `LLM_BASE_URL` to your LLM vendor; store `LLM_API_KEY` in the bundle.
5. Configure SES (or SMTP) for `EMAIL_DELIVERY=external`.
6. Disable simulation: `SIMULATION_MAX_EVENTS_PER_MIN=0` (already set in staging/prod profiles).
7. Build frontend with production API URL — [stack_guide_frontend_api.md](stack_guide_frontend_api.md).

---

## Security note

Never copy values from gitignored `backend/dev.secrets`, `staging.secrets`, or `prod.secrets` into documentation. Use placeholders (`REPLACE_STAGING_JWT_SECRET`) and variable names only.

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — compare dev vs prod profile metadata (no secrets printed)</p>

```bash
cd ~/suspicious-email-triage
grep -E '^(DEPLOYMENT_ENV|SECRETS_PROVIDER|LLM_BASE_URL|SNOWFLAKE_URL|EMAIL_DELIVERY)=' backend/.env.dev backend/.env.staging backend/.env.prod
```

</div>
