# Production setup guide — staging and production runbook

This guide tells your team **exactly what to do** to build, configure, deploy, and verify the Suspicious Email Triage application in **staging** and **production**. Background concepts and the dev-vs-cloud service matrix live in companion docs — this file is the **ordered checklist with commands**.

**Audience:** platform engineers preparing a first staging deploy or a production cutover.

**Related:** [stack_guide_staging_production_services.md](stack_guide_staging_production_services.md) (mock vs real services), [ops_guide_secrets_management.md](ops_guide_secrets_management.md), [ops_guide_kubernetes_helm.md](ops_guide_kubernetes_helm.md), [tech_env_configuration.md](tech_env_configuration.md).

---

## Where to go for each environment

| Environment | Use this guide |
|-------------|----------------|
| **Local development** (Docker mocks, free) | [stack_guide_build_and_run.md](stack_guide_build_and_run.md) → Option B, then [stack_guide_full_feature_activation.md](stack_guide_full_feature_activation.md) |
| **Staging** (real cloud, pre-prod validation) | **This document — Phases 1–7 below** with `DEPLOYMENT_ENV=staging` |
| **Production** (customer-facing) | **This document — Phases 1–7 below** with `DEPLOYMENT_ENV=prod` |

---

## Staging / production runbook (exact steps)

Complete phases **in order**. Replace `example.net` hostnames and `REPLACE_*` placeholders with your infrastructure values. **Never commit real secrets to Git** — use AWS Secrets Manager bundles `triage/staging` and `triage/prod`.

### Phase 1 — Provision managed services

Create (or designate) these **before** building images. Staging and production should use **separate** instances/buckets/accounts.

| # | Service | Technology options | Used for |
|---|---------|-------------------|----------|
| 1 | Document DB | MongoDB Atlas, Amazon DocumentDB | Review documents (`MONGO_URI` in secrets) |
| 2 | Relational DB | Amazon RDS PostgreSQL, Cloud SQL | Auth + chart stats (`POSTGRES_*`, `STATISTICS_PG_URL`) |
| 3 | Cache / Celery broker | Amazon ElastiCache Redis (TLS) | `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND` |
| 4 | Event bus | Amazon MSK, Confluent Cloud, Redpanda Cloud | `KAFKA_BROKERS` — topic `email.review.ingested` |
| 5 | Graph DB | Neo4j Aura, self-hosted Neo4j | `NEO4J_URI`, `NEO4J_PASSWORD` |
| 6 | Search | Amazon OpenSearch, Elastic Cloud | `ELASTICSEARCH_URL` |
| 7 | Analytics warehouse | Snowflake account or HTTP proxy | `SNOWFLAKE_URL` — see [data_guide_snowflake_analytics.md](data_guide_snowflake_analytics.md) |
| 8 | Backup storage | Amazon S3 bucket + lifecycle policy | `BACKUP_S3_BUCKET` — [ops_guide_s3_backups.md](ops_guide_s3_backups.md) |
| 9 | Secrets | AWS Secrets Manager secret per env | `triage/staging`, `triage/prod` |
| 10 | Email | Amazon SES or corporate SMTP | Password reset — `SMTP_*` in profile |
| 11 | LLM vendor | OpenAI, Azure OpenAI, Anthropic-compatible API | `LLM_BASE_URL`, `LLM_API_KEY` in secrets |
| 12 | TLS + DNS | ACM certificate, Route53 or Cloudflare | `APP_PUBLIC_URL`, Ingress host |

**Network:** restrict each database/broker security group to application subnets only.

---

### Phase 2 — Write secrets and environment profiles

**2a. Create AWS Secrets Manager JSON** (one secret per environment). Keys must match `backend/staging.secrets.example` / `backend/prod.secrets.example`:

```bash
cd ~/suspicious-email-triage
# Review required keys (placeholders only — do not paste real values into docs)
grep -E '^[A-Z_]+=' backend/staging.secrets.example
grep -E '^[A-Z_]+=' backend/prod.secrets.example
```

Upload to AWS (example — use your IAM profile and region):

```bash
aws secretsmanager create-secret \
  --name triage/staging \
  --secret-string file://backend/staging.secrets \
  --region us-east-1
# Repeat for triage/prod with prod.secrets (gitignored local file)
```

**2b. Edit committed profile metadata** (hostnames and flags only — no passwords):

```bash
# Staging hostnames — edit backend/.env.staging
# Production hostnames — edit backend/.env.prod
grep -E '^(POSTGRES_HOST|KAFKA_BROKERS|NEO4J_URI|ELASTICSEARCH_URL|SNOWFLAKE_URL|BACKUP_S3_BUCKET|APP_PUBLIC_URL)=' \
  backend/.env.staging backend/.env.prod
```

Verify critical flags:

```bash
grep -E '^(SECRETS_PROVIDER|DEPLOYMENT_ENV|SIMULATION_MAX_EVENTS_PER_MIN|DISABLE_LLM|EMAIL_DELIVERY)=' \
  backend/.env.staging backend/.env.prod
```

**Expected for staging/prod:** `SECRETS_PROVIDER=aws`, `SIMULATION_MAX_EVENTS_PER_MIN=0`, `EMAIL_DELIVERY=external`, `DISABLE_LLM=false`.

**Guide:** [ops_guide_secrets_management.md](ops_guide_secrets_management.md), [stack_guide_staging_production_services.md](stack_guide_staging_production_services.md).

---

### Phase 3 — Build container images

Build from repository root. Tag images with an **immutable version** (semver or git SHA) — avoid `latest` in production.

```bash
cd ~/suspicious-email-triage

# Node API
docker build -f backend/Dockerfile -t your-registry/triage-backend:1.0.0 ./backend

# Python Celery worker + Kafka dispatcher (same ai_service context)
docker build -f ai_service/Dockerfile -t your-registry/triage-ai:1.0.0 ./ai_service

# React static assets (nginx stage in compose file, or build separately — Phase 5)
docker build -f infra/docker/Dockerfile -t your-registry/triage-frontend:1.0.0 \
  --target frontend ./infra/docker
```

Push to your registry (ECR, GCR, ACR):

```bash
docker push your-registry/triage-backend:1.0.0
docker push your-registry/triage-ai:1.0.0
docker push your-registry/triage-frontend:1.0.0
```

**Local sanity build (optional, dev profile):**

```bash
bash scripts/setup-and-build-dev.sh
```

---

### Phase 4 — Deploy application workloads

**Recommended path: Kubernetes + Helm** ([ops_guide_kubernetes_helm.md](ops_guide_kubernetes_helm.md)).

**4a. Prepare Helm secrets override** (gitignored `deploy/helm/triage/secrets-staging.local.yaml`):

```yaml
secrets:
  jwtSecret: "REPLACE_ME"
  postgresPassword: "REPLACE_ME"
  neo4jPassword: "REPLACE_ME"
  graphInternalToken: "REPLACE_ME"
```

**4b. Install staging:**

```bash
cd ~/suspicious-email-triage
helm upgrade --install triage-staging ./deploy/helm/triage \
  -f deploy/helm/triage/values.yaml \
  -f deploy/helm/triage/values-staging.yaml \
  -f deploy/helm/triage/secrets-staging.local.yaml \
  --namespace triage-staging \
  --create-namespace \
  --set ingress.host=staging.triage.example.com \
  --set backend.image.repository=your-registry/triage-backend \
  --set backend.image.tag=1.0.0 \
  --set celeryWorker.image.repository=your-registry/triage-ai \
  --set celeryWorker.image.tag=1.0.0 \
  --set frontend.image.repository=your-registry/triage-frontend \
  --set frontend.image.tag=1.0.0 \
  --set config.kafkaBrokers='kafka-staging.internal:9092' \
  --wait \
  --timeout 15m
```

**4c. Install production** (same pattern, prod values + stricter replicas):

```bash
helm upgrade --install triage-prod ./deploy/helm/triage \
  -f deploy/helm/triage/values.yaml \
  -f deploy/helm/triage/values-prod.yaml \
  -f deploy/helm/triage/secrets-prod.local.yaml \
  --namespace triage-prod \
  --create-namespace \
  --set ingress.host=triage.example.com \
  --set backend.image.tag=1.0.0 \
  --set frontend.image.tag=1.0.0 \
  --set celeryWorker.image.tag=1.0.0 \
  --wait \
  --timeout 20m
```

**4d. Confirm pods and ingress:**

```bash
kubectl get pods -n triage-staging
kubectl get ingress -n triage-staging
kubectl get hpa -n triage-staging
```

**Containers must NOT include dev mocks:** no `mock-secrets-manager`, `mock-llm`, `mock-snowflake`, or `mock-s3` in staging/prod overlays.

**Alternative (legacy VM, no Kubernetes):** use PM2 only for Node on bare metal — see [Backend process manager (non-container hosts)](#backend-process-manager-non-container-hosts) below. You still need Celery workers, Kafka consumer, and managed databases separately.

---

### Phase 5 — Build and publish the React frontend

If not using the Helm frontend image, build static files with the **public API URL** baked in:

```bash
cd ~/suspicious-email-triage
test -d frontend/node_modules || npm install --prefix frontend

# Staging example
REACT_APP_API_BASE=https://staging.triage.example.com npm run build --prefix frontend

# Production example
REACT_APP_API_BASE=https://triage.example.com npm run build --prefix frontend
```

Serve `frontend/build/` via nginx, S3 + CloudFront, or the Helm frontend Deployment. **Pattern:** CRA embeds `REACT_APP_*` at build time — rebuild when the API hostname changes.

**Guide:** [stack_guide_frontend_api.md](stack_guide_frontend_api.md).

---

### Phase 6 — Bootstrap admin and smoke-test

**6a. Health probes (no auth):**

```bash
curl -sS https://staging.triage.example.com/health/live
curl -sS https://staging.triage.example.com/health/ready | python3 -m json.tool
```

**Expected:** `ready` reports Mongo, Postgres, Redis, Neo4j reachable.

**6b. Create first admin user** (if empty auth table): use Django admin container or one-time bootstrap script against staging Postgres — [auth_guide_django_admin_users.md](auth_guide_django_admin_users.md). Dev-only `bootstrap-auth-admin.sh` targets local Docker Postgres; for staging use your org’s user-provisioning process.

**6c. Login and JWT smoke test:**

```bash
curl -sS -X POST https://staging.triage.example.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"REPLACE"}' | python3 -m json.tool
```

**6d. End-to-end triage path:**

| # | Check | How |
|---|-------|-----|
| 1 | Submit review | UI or `POST /reviews` with JWT |
| 2 | Async completion | Status becomes `completed` (Celery + Kafka) |
| 3 | Graph | `#graph` shows nodes — [graph_guide_neo4j_phishing.md](graph_guide_neo4j_phishing.md) |
| 4 | Search | `#search` returns indexed review |
| 5 | Analytics | `#analytics` charts populate |
| 6 | Snowflake export | `GET /analytics/snowflake/status` — [data_guide_snowflake_analytics.md](data_guide_snowflake_analytics.md) |
| 7 | S3 backup | Admin `#admin` → Run backup — [ui_guide_s3_backups.md](ui_guide_s3_backups.md) |

**6e. Run automated tests in CI before promote:**

```bash
cd ~/suspicious-email-triage
bash scripts/lint-all.sh
bash scripts/test-all.sh
CI=true npm run build --prefix frontend
```

---

### Phase 7 — Monitoring and hardening (ongoing)

| # | Action | Reference |
|---|--------|-----------|
| 1 | Scrape `GET /ops/prometheus` | [ops_guide_metrics_alerting.md](ops_guide_metrics_alerting.md) |
| 2 | Ship logs to CloudWatch or OpenSearch | [ops_guide_central_logging.md](ops_guide_central_logging.md) |
| 3 | Confirm `SECRETS_PROVIDER=aws` and IAM roles (no long-lived keys in env) | [ops_guide_secrets_management.md](ops_guide_secrets_management.md) |
| 4 | Rate-limit `/auth/login` at edge | [roadmap_tbd.md](roadmap_tbd.md) |
| 5 | Schedule S3 backup runs | [ops_guide_s3_backups.md](ops_guide_s3_backups.md) |
| 6 | Pin Helm image tags; rolling updates via `helm upgrade` | [ops_guide_kubernetes_helm.md](ops_guide_kubernetes_helm.md) |

---

## Reference — environment profiles

| Slice | Profile file | Secrets source |
|-------|--------------|----------------|
| Dev | `backend/.env.dev` | `mock-secrets-manager` + `backend/dev.secrets` |
| Staging | `backend/.env.staging` | AWS Secrets Manager `triage/staging` |
| Prod | `backend/.env.prod` | AWS Secrets Manager `triage/prod` |

Set `DEPLOYMENT_ENV=staging` or `prod` on every Node/Python container. Entrypoint: [scripts/docker-entrypoint-with-secrets.sh](../scripts/docker-entrypoint-with-secrets.sh).

---

## Reference — Backend process manager (non-container hosts)

Use **only** when the Node API runs **directly on a Linux VM** without Docker or Kubernetes. Skip if you completed Phase 4 with Helm.

**Problem:** `node backend/src/server.js` dies when SSH disconnects unless a process manager keeps it alive.

```bash
command -v pm2 >/dev/null 2>&1 || npm install -g pm2
pm2 start backend/src/server.js --name suspicious-email-api
pm2 save && pm2 startup   # optional — survive reboot
```

**Before starting:** export or inject the same env vars as staging/prod (`MONGO_URI`, `STATISTICS_PG_URL`, …). PM2 does **not** run `docker-entrypoint-with-secrets.sh`.

| Deployment | Use PM2? |
|------------|----------|
| Docker / Kubernetes (Phase 4) | **No** |
| Legacy bare-metal Node only | **Yes** (or systemd) |

---

## Reference — reverse proxy

Typical nginx / ALB layout:

- `/` → React static `build/` or frontend Service
- `/auth`, `/reviews`, `/metrics`, … → Node backend port 3000
- TLS termination at nginx, CloudFront, or ALB

---

## Security checklist (summary)

- No production secrets in Git or plain `.env` on servers
- `SIMULATION_MAX_EVENTS_PER_MIN=0` in staging/prod profiles
- Dev routes (`/dev/reset-local-state`, bootstrap reset) unreachable in prod builds
- Database security groups limited to app subnets
- S3 backup objects exclude password hashes — [ops_guide_s3_backups.md](ops_guide_s3_backups.md)

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — verify staging/prod profile metadata (no secrets printed)</p>

```bash
cd ~/suspicious-email-triage
grep -E '^(DEPLOYMENT_ENV|SECRETS_PROVIDER|LLM_BASE_URL|SNOWFLAKE_URL|EMAIL_DELIVERY|BACKUP_PROVIDER)=' \
  backend/.env.staging backend/.env.prod
```

</div>
