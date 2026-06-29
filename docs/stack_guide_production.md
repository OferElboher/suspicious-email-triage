# Production setup guide

This guide describes how to run the Suspicious Email Triage application **outside the local Docker dev stack** — on managed databases, real AWS services, and a reverse proxy. It complements the detailed service matrix in [stack_guide_staging_production_services.md](stack_guide_staging_production_services.md).

**Audience:** engineers preparing staging or production who already understand that **dev uses Docker mocks** while **staging/prod use paid cloud services**.

---

## Goal

Prepare the app for staging and production in a careful, repeatable way:

- Remote **MongoDB** (Atlas/DocumentDB) for review documents
- Remote **PostgreSQL** (RDS) for auth and chart statistics
- Remote **Redis** (ElastiCache) for Celery
- **Kafka-compatible** broker (MSK, Confluent Cloud, or Redpanda Cloud)
- **AWS Secrets Manager** for credentials (`SECRETS_PROVIDER=aws`)
- **Commercial LLM** via OpenAI-compatible API (`LLM_BASE_URL`, not `mock-llm`)
- **Snowflake** or warehouse proxy for analytics export
- **Amazon SES** or corporate SMTP for password-reset email
- Secrets injected at container start — **never committed to Git**

---

## Environment profiles

| Slice | Profile file | Secrets source |
|-------|--------------|----------------|
| Dev | `backend/.env.dev` | `mock-secrets-manager` + `backend/dev.secrets` |
| Staging | `backend/.env.staging` | AWS Secrets Manager `triage/staging` |
| Prod | `backend/.env.prod` | AWS Secrets Manager `triage/prod` |

Set `DEPLOYMENT_ENV=staging` or `prod` before `docker compose` or in Kubernetes Helm values. See [tech_env_configuration.md](tech_env_configuration.md).

---

## Backend process manager (non-container hosts)

Use PM2 only when the API runs directly on a VM without Kubernetes:

```bash
command -v pm2 >/dev/null 2>&1 || npm install -g pm2
pm2 start backend/src/server.js --name suspicious-email-api
```

Container deployments should use the Docker entrypoint (`docker-entrypoint-with-secrets.sh`) so secrets load before Node starts.

---

## Frontend

Build the static bundle with the production API URL baked in:

```bash
test -d frontend/node_modules || npm install --prefix frontend
REACT_APP_API_BASE=https://api.triage.example.com npm run build --prefix frontend
```

Serve via nginx, S3 + CloudFront, or your platform static host — [stack_guide_frontend_api.md](stack_guide_frontend_api.md).

---

## Databases and queues

- Enable authentication and network restrictions on every managed service.
- Store connection strings with passwords in **AWS Secrets Manager**, not in Helm plain-text Secrets long term (use External Secrets Operator — [ops_guide_kubernetes_helm.md](ops_guide_kubernetes_helm.md)).
- Keep dev-only containers (`mock-*`, Mailpit) **out** of production compose/Helm overlays.

---

## Reverse proxy (nginx example)

- Route `/api` (or your prefix) to the Node backend on port 3000.
- Serve the React `build/` folder for `/`.
- Terminate TLS at nginx, CloudFront, or an AWS Application Load Balancer.

---

## Security

- `SECRETS_PROVIDER=aws` on staging/prod — IAM roles, not long-lived access keys in env files.
- Rate-limit `/auth/login` at the edge (roadmap — [roadmap_tbd.md](roadmap_tbd.md)).
- Restrict database security groups to application subnets only.

---

## Monitoring

- Scrape `GET /ops/prometheus` into Amazon Managed Prometheus or self-hosted Grafana.
- Ship `merged.log` or stdout to **CloudWatch Logs** (roadmap item in TBD).
- Use managed service dashboards for RDS, ElastiCache, and MSK health.

---

## Result

Single-domain application:

- React SPA + Node API behind one hostname
- Async Celery workers on Kafka ingest
- Credentials rotated via AWS Secrets Manager without redeploying code

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — verify prod profile uses real AWS secrets (metadata only)</p>

```bash
cd ~/suspicious-email-triage
grep '^SECRETS_PROVIDER=' backend/.env.prod
grep '^LLM_BASE_URL=' backend/.env.prod
```

</div>
