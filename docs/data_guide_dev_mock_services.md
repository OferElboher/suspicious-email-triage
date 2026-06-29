# Development mock services — what they simulate and how they match real APIs

This guide is for developers **new to AWS, OpenAI, or Snowflake** who run the local Docker stack and wonder why containers like `mock-llm` or `mock-secrets-manager` exist, and whether those mocks behave like the real cloud services.

**Short answer:** each mock implements the **same HTTP shapes our application code expects**, aligned with the real vendor protocol where practical. Mocks run **only when `DEPLOYMENT_ENV=dev`** (local Docker Compose). **Staging and production** profiles in `backend/.env.staging` and `backend/.env.prod` point at **real paid services** — see [stack_guide_staging_production_services.md](stack_guide_staging_production_services.md).

**Related:** [ops_guide_secrets_management.md](ops_guide_secrets_management.md), [data_guide_mock_llm.md](data_guide_mock_llm.md), [data_guide_snowflake_analytics.md](data_guide_snowflake_analytics.md), [stack_guide_full_feature_activation.md](stack_guide_full_feature_activation.md), [stack_guide_staging_production_services.md](stack_guide_staging_production_services.md).

---

## Why mocks exist

| Real service | Problem in local dev | Mock container |
|--------------|---------------------|----------------|
| **AWS Secrets Manager** | Costs money; secrets must not live in git | `mock-secrets-manager` (:4566) |
| **OpenAI Chat Completions** | Per-token billing | `mock-llm` (:8090) |
| **Snowflake warehouse** | Cloud account required | `mock-snowflake` (:4567) |

**Pattern:** the application reads a **URL from environment variables** (`SECRETS_MANAGER_URL`, `LLM_BASE_URL`, `SNOWFLAKE_URL`). In dev those URLs aim at Docker mocks; in production they aim at real services — **no code fork**, only configuration.

---

## Mock AWS Secrets Manager

**Real-world protocol:** AWS Secrets Manager `GetSecretValue` returns JSON with fields `SecretString`, `ARN`, `Name`, `VersionId`, `CreatedDate`. Clients typically call HTTPS POST `/` with header `X-Amz-Target: secretsmanager.GetSecretValue` and body `{ "SecretId": "my/secret" }`.

**LocalStack shortcut:** many teams also use REST `GET /v1/secrets/{SecretId}` during development.

**Our mock** (`infra/mock-aws-secrets-manager/server.js`) supports **both**:

1. `GET /v1/secrets/triage/dev` — what Node `secretsProvider.js` and Python `secrets_provider.py` call today.
2. `POST /` with `X-Amz-Target: secretsmanager.GetSecretValue` — matches the **AWS SDK wire protocol** for tools that expect real RPC shape.

**Data source:** gitignored `backend/dev.secrets` (never committed). The mock reads that file and returns its text as `SecretString`.

**Novice tip:** if login fails after clone, you still need `bash scripts/ensure-dev-secrets.sh` — the mock only **serves** secrets, it does not invent them.

Deep dive: [ops_guide_secrets_management.md](ops_guide_secrets_management.md).

---

## Mock commercial LLM (OpenAI-compatible)

**Real-world protocol:** OpenAI `POST /v1/chat/completions` with `Authorization: Bearer <api_key>`, JSON body `{ "model", "messages", "temperature", "max_tokens" }`. Response includes `choices[].message.content`.

**Our mock** (`ai_service/mock_commercial_llm/server.py`):

- Implements **`POST /v1/chat/completions`** and **`GET /health`**.
- Validates **Bearer token** against `LLM_API_KEY` (default `dev-mock-key` in Compose — safe for local use only).
- Returns **canned JSON analyses** from `responses.py` based on keyword rules (no network call to OpenAI).

**When it runs:** Celery worker with `LLM_PROVIDER=mock_commercial` and `DISABLE_LLM=false`. Default dev uses `DISABLE_LLM=true` (rule engine only).

Deep dive: [data_guide_mock_llm.md](data_guide_mock_llm.md).

---

## Mock Snowflake analytics warehouse

**Real-world Snowflake:** analysts run SQL via Snowflake’s web UI, JDBC, ODBC, or Snowflake’s **SQL REST API** against a cloud account. Data lives in tables inside a database/schema.

**Our mock** (`infra/mock-aws-snowflake/server.js`) is **not** a full SQL engine. It implements a **project-internal REST contract** that mirrors what our Node backend needs:

| Mock endpoint | Purpose |
|---------------|---------|
| `POST /v1/data/insert` | Upsert analytical rows after review completion |
| `GET /v1/analytics/verdict-distribution` | Reporting API for dashboards |
| `POST /v1/data/clear` | Dev reset |

**Why this is OK:** `backend/src/analytics/snowflakeClient.js` talks to this HTTP API. Production would swap `SNOWFLAKE_URL` to a real proxy or ETL pipeline — the **Mongo → export → warehouse** pattern stays the same.

Deep dive: [data_guide_snowflake_analytics.md](data_guide_snowflake_analytics.md).

---

## Services that are real (not mocks) in dev

| Service | Container | Notes |
|---------|-----------|-------|
| **MongoDB** | `mongo` | Document store for reviews |
| **PostgreSQL** | `postgres` | Auth + chart statistics |
| **Redis** | `redis` | Celery broker + simulation state |
| **Neo4j** | `neo4j` | Phishing graph (Community edition) |
| **Redpanda** | `redpanda` | Kafka-compatible message bus |
| **Elasticsearch** | `elasticsearch` | Review full-text search (single-node dev image) |

These are **real software** running locally — only cloud-hosted *managed* versions are replaced by Docker images.

---

## Verify mocks are running

```bash
curl -sS http://localhost:4566/health
curl -sS http://localhost:4567/health
curl -sS http://localhost:8090/health
```

Expected: JSON `"status":"ok"` for each (ports may differ if you changed Compose mapping).

---

## Security note

Documentation never copies values from gitignored `backend/dev.secrets`. Committed `backend/ci.secrets` holds **fake CI-only credentials**. Never paste production secrets into markdown or the UI.

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — WSL, repository root</p>

```bash
cd ~/suspicious-email-triage
docker compose -f infra/docker/docker-compose.yml ps mock-secrets-manager mock-snowflake mock-llm
```

</div>
