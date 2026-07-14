# Production setup guide — staging and production runbook

This guide tells your team **exactly what to do** to build, configure, deploy, and verify the Suspicious Email Triage application in **staging** and **production**. Background concepts and the dev-vs-cloud service matrix live in companion docs — this file is the **ordered checklist with commands**.

**Audience:** platform engineers **and newcomers** preparing a first staging deploy. If AWS terms like Secrets Manager or MSK are new, read [Novice primer — example on AWS](#novice-primer--example-on-aws) first.

**Related:** [stack_guide_staging_production_services.md](stack_guide_staging_production_services.md) (mock vs real services), [ops_guide_secrets_management.md](ops_guide_secrets_management.md), [ops_guide_kubernetes_helm.md](ops_guide_kubernetes_helm.md), [tech_env_configuration.md](tech_env_configuration.md).

---

## Novice primer — example on AWS

This section assumes your company hosts the triage app on **Amazon Web Services (AWS)** in region **`us-east-1` (N. Virginia)**. Names below are **illustrative** — replace `acme.com` and IDs with your org’s values.

### What you need before Phase 1

| Prerequisite | What it is | How to get it |
|--------------|------------|---------------|
| **AWS account** | Billing + IAM boundary for all cloud resources | [Create an AWS account](https://docs.aws.amazon.com/accounts/latest/reference/manage-acct-creating.html) |
| **AWS CLI** | Command-line tool that talks to AWS APIs from your laptop or CI | [Install AWS CLI v2](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) |
| **Configured credentials** | Proves the CLI is allowed to create secrets, ECR repos, etc. | `aws configure` with an IAM user or SSO profile — [Configuration guide](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-sso.html) |
| **kubectl + helm** | Tools to deploy containers to Kubernetes (Phase 4) | [kubectl install](https://kubernetes.io/docs/tasks/tools/), [Helm install](https://helm.sh/docs/intro/install/) |
| **Docker** | Builds container images (Phase 3) | [Docker Engine install](https://docs.docker.com/engine/install/) |

**Sanity check** — if this prints your account ID, the CLI is working:

```bash
aws sts get-caller-identity
```

### Worked example — “Acme Corp” staging on AWS

Acme deploys **staging** at `https://staging-triage.acme.com`. Production later uses `https://triage.acme.com` with the same pattern.

| Phase 1 choice (Acme) | AWS / vendor service | Why |
|------------------------|----------------------|-----|
| Review documents | **MongoDB Atlas** on AWS (`M10` cluster in `us-east-1`) | Native MongoDB; app uses Mongoose — [Atlas on AWS](https://www.mongodb.com/docs/atlas/reference/amazon-aws/) |
| Auth + chart stats | **Amazon RDS PostgreSQL 16** (`db.t4g.medium`) | Managed Postgres — [RDS PostgreSQL](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/CHAP_GettingStarted.CreatingConnecting.PostgreSQL.html) |
| Celery broker | **Amazon ElastiCache Redis 7** (cluster mode disabled, TLS) | Redis-compatible broker — [ElastiCache Redis](https://docs.aws.amazon.com/AmazonElastiCache/latest/red-ug/GettingStarted.html) |
| Event ingest | **Amazon MSK** (Kafka 3.x, 3 brokers, `kafka.t3.small`) | Managed Kafka — [MSK create cluster](https://docs.aws.amazon.com/msk/latest/developerguide/create-cluster.html) |
| Phishing graph | **Neo4j Aura** Professional (AWS-hosted) | Managed Neo4j; bolt URI in secrets — [Neo4j Aura](https://neo4j.com/docs/aura/) |
| Full-text search | **Amazon OpenSearch Service** (`t3.small.search`, 1 node) | Elasticsearch-compatible — [OpenSearch create domain](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/createupdatedomains.html) |
| Analytics warehouse | **Snowflake** on AWS (`ACME_AWS_US_EAST`) | Separate Snowflake account; app uses HTTP export — [Snowflake on AWS](https://docs.snowflake.com/en/user-guide/admin-intro-cloud-platforms) |
| Backups | **Amazon S3** bucket `acme-triage-staging-backups` | Object storage — [Creating a bucket](https://docs.aws.amazon.com/AmazonS3/latest/userguide/create-bucket-overview.html) |
| Passwords & API keys | **AWS Secrets Manager** secret `triage/staging` | Encrypted key-value store — see below |
| Password-reset email | **Amazon SES** (verified domain `acme.com`) | Transactional email — [SES getting started](https://docs.aws.amazon.com/ses/latest/dg/getting-started.html) |
| LLM scoring | **OpenAI API** (`https://api.openai.com/v1`) | External SaaS; key stored in Secrets Manager |
| App runtime | **Amazon EKS** cluster `acme-triage-staging` | Kubernetes for Helm chart — [EKS getting started](https://docs.aws.amazon.com/eks/latest/userguide/getting-started.html) |
| Public URL + TLS | **Route 53** DNS + **ACM** certificate + **ALB** Ingress | HTTPS for `staging-triage.acme.com` |

**Phase 1 in plain language:** log into the AWS Console (or use Infrastructure-as-Code) and **create each row’s service**. Note every **hostname**, **port**, and **username** — you will paste them into `backend/.env.staging` (non-secret) and into a secrets file (passwords). Production repeats the same list with **separate** RDS/MSK/S3 resources so a staging mistake cannot wipe prod data.

### What is `aws secretsmanager create-secret`?

**AWS Secrets Manager** is a managed service that stores JSON blobs (passwords, connection strings, API keys) encrypted at rest. Your containers **fetch** the secret at startup — they never read passwords from Git.

The command:

```bash
aws secretsmanager create-secret \
  --name triage/staging \
  --secret-string file://backend/staging.secrets \
  --region us-east-1
```

| Part | Meaning |
|------|---------|
| `aws` | The AWS CLI program you installed |
| `secretsmanager create-secret` | Calls the Secrets Manager API to **create** a new named secret |
| `--name triage/staging` | Logical name; must match `SECRETS_BUNDLE_ID` in `backend/.env.staging` |
| `--secret-string file://backend/staging.secrets` | Loads key=value pairs from a **local gitignored file** (never commit it) |
| `--region us-east-1` | Same region as EKS/RDS so latency and IAM policies stay simple |

**Why it is “available”:** once the AWS CLI is installed and your IAM user/role has `secretsmanager:CreateSecret`, the command works from any machine with network access — it is not a special program shipped with this repo.

**At runtime:** `scripts/docker-entrypoint-with-secrets.sh` + `SECRETS_PROVIDER=aws` call `GetSecretValue` and inject keys into `process.env` before Node starts — [ops_guide_secrets_management.md](ops_guide_secrets_management.md).

**Official docs:** [AWS Secrets Manager create-secret](https://docs.aws.amazon.com/cli/latest/reference/secretsmanager/create-secret.html), [Secrets Manager user guide](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html).

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

**How to accomplish Phase 1 (novice path):**

1. Sign in to the [AWS Management Console](https://console.aws.amazon.com/).
2. For each service in the table below, use the **Acme example** column as a template — create the resource in **`us-east-1`**, write down endpoints, and restrict **security groups** so only the EKS worker subnets can reach databases (not `0.0.0.0/0`).
3. For MongoDB Atlas and Neo4j Aura, use their web consoles but choose **AWS / us-east-1** as the cloud region so latency matches EKS.
4. Create the MSK topic **`email.review.ingested`** (or let the app create it on first produce — verify your MSK ACLs allow it).
5. Verify SES: confirm domain `acme.com` and move out of the SES sandbox if you need to mail real users — [SES sandbox](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html).

| # | Service | Acme staging example | Env vars filled later |
|---|---------|----------------------|------------------------|
| 1 | MongoDB Atlas | Cluster `acme-triage-staging`, DB `triage_staging` | `MONGO_URI` (secret) |
| 2 | RDS PostgreSQL | `acme-triage-staging-pg.xxxx.us-east-1.rds.amazonaws.com:5432` | `POSTGRES_HOST`, `STATISTICS_PG_URL` |
| 3 | ElastiCache Redis | `master.acme-triage-staging.xxxx.use1.cache.amazonaws.com:6379` | `CELERY_BROKER_URL` (TLS URL in secret) |
| 4 | Amazon MSK | `b-1.acme-msk.xxxx.kafka.us-east-1.amazonaws.com:9092` | `KAFKA_BROKERS` |
| 5 | Neo4j Aura | `neo4j+s://xxxxx.databases.neo4j.io` | `NEO4J_URI`, `NEO4J_PASSWORD` |
| 6 | OpenSearch | `https://search-acme-triage-xxxxx.us-east-1.es.amazonaws.com` | `ELASTICSEARCH_URL` |
| 7 | Snowflake | `https://acme.aws_us_east.snowflakecomputing.com` | `SNOWFLAKE_URL` |
| 8 | S3 | Bucket `acme-triage-staging-backups` | `BACKUP_S3_BUCKET` |
| 9 | Secrets Manager | Secret name `triage/staging` (created in Phase 2) | `SECRETS_BUNDLE_ID` |
| 10 | SES + Route53 | `noreply@acme.com`, DNS `staging-triage.acme.com` → ALB | `SMTP_*`, `APP_PUBLIC_URL` |
| 11 | OpenAI | API key from platform.openai.com | `LLM_API_KEY` (secret) |
| 12 | EKS + ACM | Cluster `acme-triage-staging`, cert for `staging-triage.acme.com` | Ingress host in Helm |

**Other technology options** (same roles): DocumentDB instead of Atlas, Confluent Cloud instead of MSK, Elastic Cloud instead of OpenSearch — see [stack_guide_staging_production_services.md](stack_guide_staging_production_services.md).

**Network:** each managed service gets a **security group** or IP allowlist allowing **only** the EKS node security group on the required ports (5432, 6379, 9092, etc.).

---

### Phase 2 — Write secrets and environment profiles

**Goal:** split configuration into (a) **public metadata** in Git (`backend/.env.staging`) and (b) **passwords** in AWS Secrets Manager.

**2a. Create a local secrets file (gitignored)**

Copy the example and fill in Acme’s real connection strings from Phase 1:

```bash
cd ~/suspicious-email-triage
cp backend/staging.secrets.example backend/staging.secrets
# Edit backend/staging.secrets — replace every REPLACE_* placeholder
grep -E '^[A-Z_]+=' backend/staging.secrets.example   # checklist of required keys
```

Example snippet (values are fictional):

```bash
MONGO_URI=mongodb+srv://triage_app:SECRET@acme-staging.xxxxx.mongodb.net/triage_staging
STATISTICS_PG_URL=postgres://triage_app:SECRET@acme-triage-staging-pg.xxxx.us-east-1.rds.amazonaws.com:5432/triage_stats
JWT_SECRET=long-random-string-generated-with-openssl
LLM_API_KEY=sk-...
```

Generate a random JWT secret: `openssl rand -base64 48`

**2b. Upload to AWS Secrets Manager**

Ensure AWS CLI works (`aws sts get-caller-identity`). Then:

```bash
aws secretsmanager create-secret \
  --name triage/staging \
  --description "Acme triage staging credentials" \
  --secret-string file://backend/staging.secrets \
  --region us-east-1
```

If the secret already exists, **update** instead of create:

```bash
aws secretsmanager put-secret-value \
  --secret-id triage/staging \
  --secret-string file://backend/staging.secrets \
  --region us-east-1
```

**IAM note:** the EKS **pod service account** (or node role) needs `secretsmanager:GetSecretValue` on `arn:aws:secretsmanager:us-east-1:ACCOUNT_ID:secret:triage/staging-*` — [IAM for Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/auth-and-access.html).

**2c. Edit committed profile metadata** (hostnames only — no passwords in Git)

Edit `backend/.env.staging` with Acme endpoints, for example:

```bash
POSTGRES_HOST=acme-triage-staging-pg.xxxx.us-east-1.rds.amazonaws.com
KAFKA_BROKERS=b-1.acme-msk.xxxx.kafka.us-east-1.amazonaws.com:9092
NEO4J_URI=neo4j+s://xxxxx.databases.neo4j.io
ELASTICSEARCH_URL=https://search-acme-triage-xxxxx.us-east-1.es.amazonaws.com
SNOWFLAKE_URL=https://acme.aws_us_east.snowflakecomputing.com
BACKUP_S3_BUCKET=acme-triage-staging-backups
APP_PUBLIC_URL=https://staging-triage.acme.com
SECRETS_BUNDLE_ID=triage/staging
SECRETS_PROVIDER=aws
AWS_REGION=us-east-1
```

Verify flags:

```bash
grep -E '^(SECRETS_PROVIDER|DEPLOYMENT_ENV|SIMULATION_MAX_EVENTS_PER_MIN|DISABLE_LLM|EMAIL_DELIVERY)=' \
  backend/.env.staging
```

**Expected:** `SECRETS_PROVIDER=aws`, `SIMULATION_MAX_EVENTS_PER_MIN=0`, `EMAIL_DELIVERY=external`, `DISABLE_LLM=false`.

Repeat for production with **`triage/prod`**, **`backend/.env.prod`**, and **separate** AWS resources.

**Guide:** [ops_guide_secrets_management.md](ops_guide_secrets_management.md), [stack_guide_staging_production_services.md](stack_guide_staging_production_services.md).

---

### Phase 3 — Build container images

Build from repository root. Tag images with an **immutable version** (semver or git SHA) — avoid `latest` in production.

**Acme uses Amazon ECR** (Elastic Container Registry) in the same account/region as EKS:

```bash
cd ~/suspicious-email-triage
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR=${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com
aws ecr create-repository --repository-name triage-backend --region us-east-1 || true
aws ecr create-repository --repository-name triage-ai --region us-east-1 || true
aws ecr create-repository --repository-name triage-frontend --region us-east-1 || true
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin ${ECR}
```

Build and push:

```bash
VERSION=1.0.0

docker build -f backend/Dockerfile -t ${ECR}/triage-backend:${VERSION} ./backend
docker build -f ai_service/Dockerfile -t ${ECR}/triage-ai:${VERSION} ./ai_service
docker build -f infra/docker/Dockerfile -t ${ECR}/triage-frontend:${VERSION} \
  --target frontend ./infra/docker

docker push ${ECR}/triage-backend:${VERSION}
docker push ${ECR}/triage-ai:${VERSION}
docker push ${ECR}/triage-frontend:${VERSION}
```

**ECR docs:** [Creating a private repository](https://docs.aws.amazon.com/AmazonECR/latest/userguide/repository-create.html), [Pushing an image](https://docs.aws.amazon.com/AmazonECR/latest/userguide/docker-push-ecr-image.html).

**Local sanity build (optional, dev profile on a laptop):**

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

**4b. Install staging (Acme example):**

```bash
cd ~/suspicious-email-triage
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR=${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com

helm upgrade --install triage-staging ./deploy/helm/triage \
  -f deploy/helm/triage/values.yaml \
  -f deploy/helm/triage/values-staging.yaml \
  -f deploy/helm/triage/secrets-staging.local.yaml \
  --namespace triage-staging \
  --create-namespace \
  --set ingress.host=staging-triage.acme.com \
  --set backend.image.repository=${ECR}/triage-backend \
  --set backend.image.tag=1.0.0 \
  --set celeryWorker.image.repository=${ECR}/triage-ai \
  --set celeryWorker.image.tag=1.0.0 \
  --set frontend.image.repository=${ECR}/triage-frontend \
  --set frontend.image.tag=1.0.0 \
  --set config.kafkaBrokers='b-1.acme-msk.xxxx.kafka.us-east-1.amazonaws.com:9092' \
  --wait \
  --timeout 15m
```

**What Helm does:** packages Kubernetes YAML (Deployments, Services, Ingress) from `deploy/helm/triage/` and applies them to EKS — [Helm docs](https://helm.sh/docs/intro/using_helm/).

**4c. Install production** (same pattern; host `triage.acme.com`, namespace `triage-prod`, prod values file):

```bash
helm upgrade --install triage-prod ./deploy/helm/triage \
  -f deploy/helm/triage/values.yaml \
  -f deploy/helm/triage/values-prod.yaml \
  -f deploy/helm/triage/secrets-prod.local.yaml \
  --namespace triage-prod \
  --create-namespace \
  --set ingress.host=triage.acme.com \
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

# Staging example (Acme)
REACT_APP_API_BASE=https://staging-triage.acme.com npm run build --prefix frontend

# Production example (Acme)
REACT_APP_API_BASE=https://triage.acme.com npm run build --prefix frontend
```

Serve `frontend/build/` via nginx, S3 + CloudFront, or the Helm frontend Deployment. **Pattern:** CRA embeds `REACT_APP_*` at build time — rebuild when the API hostname changes.

**Guide:** [stack_guide_frontend_api.md](stack_guide_frontend_api.md).

---

### Phase 6 — Bootstrap admin and smoke-test

**6a. Health probes (no auth):**

```bash
curl -sS https://staging-triage.acme.com/health/live
curl -sS https://staging-triage.acme.com/health/ready | python3 -m json.tool
```

**Expected:** `ready` reports Mongo, Postgres, Redis, Neo4j reachable.

**6b. Create first admin user** (if empty auth table): use Django admin container or one-time bootstrap script against staging Postgres — [auth_guide_django_admin_users.md](auth_guide_django_admin_users.md). Dev-only `bootstrap-auth-admin.sh` targets local Docker Postgres; for staging use your org’s user-provisioning process.

**6c. Login and JWT smoke test:**

```bash
curl -sS -X POST https://staging-triage.acme.com/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@acme.com","password":"REPLACE"}' | python3 -m json.tool
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
