# Kubernetes and Helm deployment guide

This guide explains how the **Suspicious Email Triage** application is packaged for Kubernetes using **Helm**, written for readers who may be new to containers, orchestration, or cloud deployment. It describes what each Kubernetes object does, how the project’s Helm chart is organized, and how to install or upgrade the stack in **dev**, **staging**, and **production**.

For broader context about what the product does and how its services interact, start with the [documentation index](README.md) — especially [arch_guide_overview.md](arch_guide_overview.md), [stack_guide_deployment.md](stack_guide_deployment.md), [tech_env_configuration.md](tech_env_configuration.md), and [stack_guide_production.md](stack_guide_production.md).

---

## What problem Kubernetes solves

Running a modern application like Suspicious Email Triage means running **many processes at once**:

- A **React frontend** (static files served by nginx)
- A **Node.js API** (Express)
- **Celery workers** (Python scoring pipeline)
- **MongoDB** (review documents)
- **PostgreSQL** (chart statistics and auth tables)
- **Redis** (Celery broker and cache)
- **Kafka-compatible messaging** (event ingest between API and workers)
- Optionally **Neo4j** (phishing relationship graph)

On a single laptop, Docker Compose can start all of these together. In a shared cluster (a dev Kubernetes cluster, staging, or production), you need something that can:

1. **Schedule** containers onto machines
2. **Restart** them when they crash
3. **Scale** them up or down under load
4. **Wire networking** so “backend” can find “mongo” by a stable name
5. **Attach storage** so databases survive pod restarts
6. **Inject configuration** without baking secrets into images

**Kubernetes** (often abbreviated **K8s**) is an open-source platform that does exactly that. You declare *desired state* (“run three API pods behind a load balancer”) and Kubernetes continuously works to match reality to that declaration.

**Helm** is a package manager for Kubernetes. Instead of applying dozens of YAML files by hand, you install a **chart** — a templated bundle — with one command and override settings per environment through **values** files.

---

## Kubernetes concepts, in plain language

The chart under `deploy/helm/triage/` creates several standard Kubernetes resource types. Here is what each one means for this project.

### Pod

A **Pod** is the smallest deployable unit in Kubernetes: one or more containers that share network and storage on the same node. You rarely create Pods directly; higher-level controllers create and manage them for you.

**In this project:** Each running instance of the backend API, frontend, Celery worker, Redis, MongoDB, or PostgreSQL is a Pod (or will become one when the corresponding controller starts it).

### Deployment

A **Deployment** manages **stateless** applications: web APIs, frontends, workers that do not own durable disk. It ensures a desired number of identical Pods are running, replaces failed Pods, and supports rolling updates (replace old Pods gradually with new ones).

**In this project:**

| Deployment | Role |
|------------|------|
| `*-backend` | Node.js Express API — accepts reviews, talks to MongoDB/PostgreSQL, publishes Kafka events |
| `*-frontend` | nginx serving the React SPA |
| `*-celery` | Python Celery worker — async LLM scoring and graph sync |
| `*-redis` | Redis broker/cache (dev-style in-cluster; disabled in prod values in favor of managed Redis) |

Deployments are defined in:

- `deploy/helm/triage/templates/backend-deployment.yaml`
- `deploy/helm/triage/templates/frontend-deployment.yaml`
- `deploy/helm/triage/templates/celery-deployment.yaml`
- `deploy/helm/triage/templates/redis-deployment.yaml`

### StatefulSet

A **StatefulSet** is like a Deployment, but for **stateful** workloads that need stable network identity and persistent disks — typically databases.

**In this project:**

| StatefulSet | Role |
|-------------|------|
| `*-mongo` | MongoDB — review documents, analysis results, overrides |
| `*-postgres` | PostgreSQL — auth tables and narrow statistics events for charts |

Templates: `mongo-statefulset.yaml`, `postgres-statefulset.yaml`.

StatefulSets pair with **PersistentVolumeClaims** so data survives Pod restarts and rescheduling onto another node (when storage class supports it).

### Service

A **Service** is a stable **DNS name and IP** inside the cluster that load-balances traffic to matching Pods. Pods come and go; Services do not.

**Examples in this chart:**

- `triage-backend` → port 3000 (API)
- `triage-frontend` → port 80 (UI)
- `triage-mongo` → port 27017
- `triage-postgres` → port 5432
- `triage-redis` → port 6379

The ConfigMap builds connection strings using these names, e.g. `mongodb://<release>-mongo:27017/triage`.

### PersistentVolumeClaim (PVC)

A **PersistentVolumeClaim** requests disk space from the cluster. When bound, a Pod mounts that volume so database files are not lost when the container restarts.

**In this project:** MongoDB and PostgreSQL StatefulSets request storage sized by `mongo.storage` and `postgres.storage` in values (e.g. `2Gi` in dev, `5Gi` in defaults). Redis in this chart is intentionally **ephemeral** in dev (no PVC) — acceptable for development; production typically uses managed Redis with its own persistence policy.

### ConfigMap

A **ConfigMap** holds **non-secret** configuration as key-value pairs, injected into Pods as environment variables or files.

**In this project:** `templates/configmap.yaml` sets:

| Key | Purpose |
|-----|---------|
| `DEPLOYMENT_ENV` | `dev`, `staging`, or `prod` — selects runtime behavior |
| `LOG_LEVEL` | Logging verbosity (`debug` in dev, `warn` in prod) |
| `NEO4J_ENABLED` | Toggle graph features |
| `KAFKA_BROKERS` | Kafka/Redpanda bootstrap address |
| `REDIS_HOST` | In-cluster Redis service hostname |
| `MONGO_URI` | MongoDB connection string |
| `STATS_PG_URL` | PostgreSQL URL for statistics (password substituted from Secret) |

This follows the [twelve-factor app](https://12factor.net/config) pattern: **config in the environment**, not baked into container images. See also [tech_env_configuration.md](tech_env_configuration.md).

### Secret

A **Secret** stores sensitive values (passwords, signing keys, tokens). Kubernetes stores them separately from ConfigMaps and can restrict who reads them.

**In this project:** `templates/secret.yaml` defines:

| Key | Purpose |
|-----|---------|
| `JWT_SECRET` | Signs and verifies login tokens |
| `POSTGRES_PASSWORD` | PostgreSQL superuser/app password |
| `NEO4J_PASSWORD` | Neo4j authentication |
| `GRAPH_INTERNAL_TOKEN` | Service-to-service token for graph sync API |

**Important:** Default `values.yaml` uses placeholder strings like `REPLACE_ME`. **Never commit real production secrets to git.** Inject them at deploy time (see [Secrets at install time](#secrets-at-install-time) below).

For production maturity, prefer **External Secrets Operator**, AWS Secrets Manager, Azure Key Vault, or HashiCorp Vault instead of plain Kubernetes Secrets checked into Helm values — see [roadmap_tbd.md](roadmap_tbd.md) section on secrets management.

### Ingress

An **Ingress** exposes HTTP routes from outside the cluster to internal Services. It typically sits behind an **Ingress controller** (this chart defaults to the `nginx` class).

**In this project:** When `ingress.enabled` is true (staging and prod values), external traffic to host `staging.triage.example.com` or `triage.example.com` is routed:

| Path | Backend Service |
|------|-----------------|
| `/` | Frontend (React UI) |
| `/api` | Backend (Node API) |

TLS can be enabled via `ingress.tls: true` (staging/prod). You must provision a TLS certificate Secret (e.g. cert-manager) matching the chart’s expected name pattern.

Dev values keep `ingress.enabled: false` — use `kubectl port-forward` or an internal-only cluster DNS name instead.

### Horizontal Pod Autoscaler (HPA)

An **HPA** automatically increases or decreases Pod count based on metrics (here: **CPU utilization** on the backend Deployment).

**In this project:**

- **Dev:** autoscaling disabled (`backend.autoscaling.enabled: false`)
- **Staging:** 2–6 backend replicas, target ~70% CPU
- **Prod:** 3–12 backend replicas, higher resource requests/limits

Template: `templates/hpa.yaml`. Only created when `backend.autoscaling.enabled` is true.

---

## What Helm adds on top of Kubernetes

Helm wraps Kubernetes YAML in **templates** with placeholders (`{{ .Values.backend.replicaCount }}`) and **values** files that supply environment-specific numbers and flags.

### Chart location

```
deploy/helm/triage/
├── Chart.yaml              # Chart metadata (name, version)
├── values.yaml             # Sensible defaults (all environments)
├── values-dev.yaml         # Dev cluster overrides
├── values-staging.yaml     # Staging overrides
├── values-prod.yaml        # Production overrides
└── templates/
    ├── _helpers.tpl        # Naming and label helpers
    ├── backend-deployment.yaml
    ├── frontend-deployment.yaml
    ├── celery-deployment.yaml
    ├── redis-deployment.yaml
    ├── mongo-statefulset.yaml
    ├── postgres-statefulset.yaml
    ├── configmap.yaml
    ├── secret.yaml
    ├── ingress.yaml
    └── hpa.yaml
```

### Release naming

When you run `helm install my-triage ...`, **my-triage** is the **release name**. Kubernetes object names are prefixed with the release (via `triage.fullname` in `_helpers.tpl`), e.g. `my-triage-triage-backend`. Labels like `app.kubernetes.io/instance: my-triage` tie resources to that install.

### Layered values

Helm merges `values.yaml` with environment files (`-f values-dev.yaml`). Later files override earlier keys. This lets you share one chart while changing replica counts, ingress hosts, and which databases run in-cluster vs. managed.

---

## How this maps to the Suspicious Email Triage architecture

The application flow (see [arch_guide_overview.md](arch_guide_overview.md)) is unchanged in Kubernetes; only **where** processes run changes.

```text
Browser
  → Ingress (staging/prod) or port-forward (dev)
  → Frontend Service → Frontend Pods
  → Backend Service → Backend Pods
       → MongoDB (reviews)
       → PostgreSQL (stats/auth)
       → Redis (Celery)
       → Kafka (ingest events)
  → Celery Worker Pods
       → MongoDB, PostgreSQL, Neo4j (when enabled)
```

### Backend health probes

The backend Deployment configures Kubernetes **probes** so the cluster knows when the API is alive vs. ready to serve traffic:

| Probe | HTTP path | Meaning |
|-------|-----------|---------|
| **Liveness** | `/health/live` | Is the Node process responding? If this fails repeatedly, Kubernetes **restarts** the Pod. No dependency checks — avoids restart loops when MongoDB is briefly unavailable. |
| **Readiness** | `/health/ready` | Can this Pod accept traffic? Checks MongoDB, PostgreSQL, Redis, and optionally Neo4j. Failing readiness **removes** the Pod from Service load balancing until dependencies recover. |

Defaults are in `values.yaml` under `backend.probes` (`initialDelaySeconds: 20`, `periodSeconds: 15`). The same endpoints are used by Docker Compose health checks in local dev.

### Environment profiles: dev vs staging vs prod

| Aspect | Dev (`values-dev.yaml`) | Staging (`values-staging.yaml`) | Prod (`values-prod.yaml`) |
|--------|-------------------------|----------------------------------|---------------------------|
| `DEPLOYMENT_ENV` | `dev` | `staging` | `prod` |
| Backend replicas | 1 | 2 (+ HPA 2–6) | 3 (+ HPA 3–12) |
| Frontend replicas | 1 | 2 | 3 |
| Celery replicas | 1 | 1 | 2 |
| MongoDB in-cluster | Yes (2Gi) | No — use Atlas/managed | No |
| PostgreSQL in-cluster | Yes (2Gi) | No — use RDS/managed | No |
| Redis in-cluster | Yes | Yes (override for managed) | No — ElastiCache/managed |
| Neo4j in-cluster | Config only* | External/managed | External (Aura/dedicated) |
| Ingress | Off | On + TLS | On + TLS |
| Log level | `debug` | `info` | `warn` |

\*The chart sets `NEO4J_ENABLED` and `NEO4J_PASSWORD` via ConfigMap/Secret. Values files include `neo4j.enabled` and storage sizing for future in-cluster Neo4j templates; today, run Neo4j via [tech_neo4j_setup_wsl_windows.md](tech_neo4j_setup_wsl_windows.md) locally or a managed service in cloud environments, and point connection settings through additional ConfigMap overrides or an extended values file.

When **in-cluster databases are disabled** (staging/prod), you must supply **remote connection strings** for MongoDB, PostgreSQL, Redis, and Kafka — the default ConfigMap still assumes in-cluster hostnames. Extend your environment values or pass `--set config.kafkaBrokers=...` and add custom keys to the ConfigMap template as your platform matures. See [stack_guide_deployment.md](stack_guide_deployment.md) for the expected variable names (`MONGO_URI`, `STATISTICS_PG_URL`, `CELERY_BROKER_URL`, etc.).

---

## Prerequisites

Before installing the chart, you typically need:

1. **A Kubernetes cluster** — local (kind, minikube, Docker Desktop Kubernetes), cloud (EKS, GKE, AKS), or an internal platform.
2. **kubectl** configured to talk to that cluster (`kubectl cluster-info`).
3. **Helm 3** (`helm version`).
4. **Container images** built and available to the cluster:
   - `triage-backend:latest`
   - `triage-frontend:latest`
   - `triage-celery:latest`

   Build locally with [stack_guide_deployment.md](stack_guide_deployment.md) / `scripts/setup-and-build-dev.sh`, then push to a registry your cluster can pull from. Set `global.imagePullSecrets` if using a private registry.

5. **Ingress controller** (staging/prod) — e.g. [ingress-nginx](https://kubernetes.github.io/ingress-nginx/) if you use `ingress.className: nginx`.
6. **Storage class** (dev with in-cluster DBs) — a default `StorageClass` for PVCs, or set `mongo.storageClassName` / `postgres.storageClassName`.

---

## Secrets at install time

Never put real passwords in `values.yaml` committed to git. Use one of these patterns:

### Option A — `--set` flags (quick tests only)

```bash
helm upgrade --install triage-dev ./deploy/helm/triage \
  -f deploy/helm/triage/values.yaml \
  -f deploy/helm/triage/values-dev.yaml \
  --namespace triage-dev --create-namespace \
  --set secrets.jwtSecret='REPLACE_ME_WITH_LONG_RANDOM_STRING' \
  --set secrets.postgresPassword='REPLACE_ME' \
  --set secrets.neo4jPassword='REPLACE_ME' \
  --set secrets.graphInternalToken='REPLACE_ME'
```

Replace every `REPLACE_ME` with strong random values generated for **that environment only**. Do not reuse dev secrets in staging or prod.

### Option B — Private values file (not in git)

Create `deploy/helm/triage/secrets-dev.local.yaml` (add to `.gitignore`):

```yaml
secrets:
  jwtSecret: "REPLACE_ME"
  postgresPassword: "REPLACE_ME"
  neo4jPassword: "REPLACE_ME"
  graphInternalToken: "REPLACE_ME"
```

Install with:

```bash
helm upgrade --install triage-dev ./deploy/helm/triage \
  -f deploy/helm/triage/values.yaml \
  -f deploy/helm/triage/values-dev.yaml \
  -f deploy/helm/triage/secrets-dev.local.yaml \
  --namespace triage-dev --create-namespace
```

### Option C — External secret manager (recommended for prod)

Integrate External Secrets Operator or your cloud provider’s secret store so Pods receive rotated credentials without Helm ever storing plaintext in CI logs. This aligns with [stack_guide_production.md](stack_guide_production.md) and the P0 item in [roadmap_tbd.md](roadmap_tbd.md).

---

## Helm install and upgrade examples

All examples assume your shell is at the **repository root** and images are pullable by the cluster.

### Development cluster (in-cluster databases, no Ingress)

First-time install:

```bash
helm upgrade --install triage-dev ./deploy/helm/triage \
  -f deploy/helm/triage/values.yaml \
  -f deploy/helm/triage/values-dev.yaml \
  -f deploy/helm/triage/secrets-dev.local.yaml \
  --namespace triage-dev \
  --create-namespace \
  --wait \
  --timeout 10m
```

Upgrade after chart or image changes:

```bash
helm upgrade triage-dev ./deploy/helm/triage \
  -f deploy/helm/triage/values.yaml \
  -f deploy/helm/triage/values-dev.yaml \
  -f deploy/helm/triage/secrets-dev.local.yaml \
  --namespace triage-dev \
  --set backend.image.tag=latest \
  --set frontend.image.tag=latest \
  --set celeryWorker.image.tag=latest
```

Access the UI without Ingress:

```bash
# Frontend
kubectl port-forward -n triage-dev svc/triage-dev-triage-frontend 8080:80

# Backend API (optional, for direct API testing)
kubectl port-forward -n triage-dev svc/triage-dev-triage-backend 3000:3000
```

Open `http://localhost:8080` in your browser. Ensure `frontend.env.apiUrl` in values points at a URL the **browser** can reach (for port-forward-only dev, you may need `http://localhost:3000` and a separate backend port-forward, or a single Ingress even in dev).

Verify health:

```bash
kubectl exec -n triage-dev deploy/triage-dev-triage-backend -- \
  wget -qO- http://127.0.0.1:3000/health/live

kubectl exec -n triage-dev deploy/triage-dev-triage-backend -- \
  wget -qO- http://127.0.0.1:3000/health/ready
```

### Staging (Ingress, autoscaling, external databases)

Prepare a staging secrets file and **override remote service endpoints** (example — adjust hostnames to your infrastructure):

```yaml
# secrets-staging.local.yaml (gitignored)
secrets:
  jwtSecret: "REPLACE_ME"
  postgresPassword: "REPLACE_ME"
  neo4jPassword: "REPLACE_ME"
  graphInternalToken: "REPLACE_ME"

# Optional: extend via --set until ConfigMap template supports all remote URLs
```

```bash
helm upgrade --install triage-staging ./deploy/helm/triage \
  -f deploy/helm/triage/values.yaml \
  -f deploy/helm/triage/values-staging.yaml \
  -f deploy/helm/triage/secrets-staging.local.yaml \
  --namespace triage-staging \
  --create-namespace \
  --set ingress.host=staging.triage.example.com \
  --set config.kafkaBrokers='kafka-staging.internal:9092' \
  --wait \
  --timeout 15m
```

Confirm Ingress and HPA:

```bash
kubectl get ingress -n triage-staging
kubectl get hpa -n triage-staging
kubectl get pods -n triage-staging
```

Traffic flows: `https://staging.triage.example.com/` → frontend, `https://staging.triage.example.com/api` → backend.

### Production (HA, external managed data stores)

```bash
helm upgrade --install triage-prod ./deploy/helm/triage \
  -f deploy/helm/triage/values.yaml \
  -f deploy/helm/triage/values-prod.yaml \
  -f deploy/helm/triage/secrets-prod.local.yaml \
  --namespace triage-prod \
  --create-namespace \
  --set ingress.host=triage.example.com \
  --set backend.image.tag='1.0.0' \
  --set frontend.image.tag='1.0.0' \
  --set celeryWorker.image.tag='1.0.0' \
  --wait \
  --timeout 20m
```

Production checklist (see also [stack_guide_production.md](stack_guide_production.md)):

- [ ] Pin image tags to immutable digests or semver tags — avoid `latest` in prod.
- [ ] Managed MongoDB, PostgreSQL, Redis, Kafka, Neo4j with network policies restricting access.
- [ ] TLS certificates for Ingress (cert-manager or cloud LB).
- [ ] Secrets from a secret manager, not shell history.
- [ ] Resource requests/limits reviewed under real load (`values-prod.yaml` raises backend CPU/memory).
- [ ] HPA min replicas ≥ 3 for API availability during rolling updates.
- [ ] Centralized logging and monitoring (JSON logs from backend; platform metrics for HPA).
- [ ] Dev-only routes like `/dev/reset-local-state` must remain disabled in prod builds.

---

## Inspecting and operating a release

### List releases

```bash
helm list -A
```

### Render templates locally (dry-run, no cluster changes)

```bash
helm template triage-dev ./deploy/helm/triage \
  -f deploy/helm/triage/values.yaml \
  -f deploy/helm/triage/values-dev.yaml \
  --namespace triage-dev
```

Useful to review generated YAML before applying.

### Roll back a bad upgrade

```bash
helm history triage-prod -n triage-prod
helm rollback triage-prod 2 -n triage-prod
```

### Uninstall

```bash
helm uninstall triage-dev -n triage-dev
```

**Warning:** Uninstalling removes Deployments and Services. PVCs created by StatefulSets may **persist** unless your platform reclaims them — verify storage cleanup policy before uninstalling dev databases.

### Common kubectl commands

```bash
kubectl get all -n triage-dev
kubectl logs -n triage-dev deploy/triage-dev-triage-backend -f
kubectl logs -n triage-dev deploy/triage-dev-triage-celery -f
kubectl describe pod -n triage-dev -l app.kubernetes.io/component=backend
```

---

## Configuration reference (chart defaults)

### Key `values.yaml` knobs

| Path | Default | Notes |
|------|---------|-------|
| `global.deploymentEnv` | `dev` | Overridden per env file |
| `backend.replicaCount` | `1` | Prod/staging raise this; HPA may override |
| `backend.probes.livenessPath` | `/health/live` | |
| `backend.probes.readinessPath` | `/health/ready` | |
| `backend.autoscaling.enabled` | `false` | `true` in staging/prod |
| `frontend.env.apiUrl` | `http://triage-backend:3000` | Browser-visible URL may differ when using Ingress |
| `celeryWorker.enabled` | `true` | |
| `mongo.enabled` | `true` | `false` in staging/prod |
| `postgres.enabled` | `true` | `false` in staging/prod |
| `redis.enabled` | `true` | `false` in prod |
| `ingress.enabled` | `false` | `true` in staging/prod |
| `config.logLevel` | `info` | `debug` / `warn` in dev/prod |
| `config.kafkaBrokers` | `redpanda:9092` | Point to your cluster’s Kafka service |
| `secrets.*` | `REPLACE_ME` | Inject at install |

### Optional components

`values.yaml` includes `nodeWorker.enabled: false` for an optional Node Kafka dispatcher. Enable and add a template when your deployment needs that path instead of or in addition to the Python dispatcher — see [arch_guide_worker_pipeline.md](arch_guide_worker_pipeline.md).

---

## Relationship to Docker Compose local dev

Most developers still use **Docker Compose** for day-to-day work (`infra/docker/docker-compose.yml`). That path is documented in [stack_guide_deployment.md](stack_guide_deployment.md), [stack_guide_full_stack.md](stack_guide_full_stack.md), and [stack_guide_windows_startup.md](stack_guide_windows_startup.md).

| Concern | Docker Compose (local) | Kubernetes + Helm (shared envs) |
|---------|------------------------|----------------------------------|
| Audience | Individual developer laptop | Team dev cluster, staging, prod |
| Networking | Published localhost ports | Cluster DNS + Ingress |
| Secrets | `backend/.env` (gitignored) | Kubernetes Secrets / external store |
| Scaling | Single replica per service | Replicas + HPA |
| Databases | Containers in Compose file | StatefulSets (dev) or managed (staging/prod) |

The **same container images** and **same environment variable names** apply in both worlds; only orchestration differs.

---

## Troubleshooting

### Pods stuck in `Pending`

Often insufficient cluster CPU/memory or missing StorageClass for PVCs. Run:

```bash
kubectl describe pod -n <namespace> <pod-name>
```

### Backend `CrashLoopBackOff`

Check logs. Common causes: wrong `MONGO_URI` / `STATS_PG_URL`, PostgreSQL not ready, or invalid secrets.

### Readiness probe failures (503 on `/health/ready`)

Dependencies are unreachable. Verify Services exist for mongo/postgres/redis and that Secrets contain non-placeholder passwords when databases require auth.

### Image pull errors

Build and push images to a registry the cluster can access, or load images into kind/minikube. Configure `imagePullSecrets` for private registries.

### Ingress returns 404

Confirm the Ingress controller is installed, `ingress.host` matches your DNS, and backend/frontend Services have ready endpoints:

```bash
kubectl get endpoints -n triage-staging
```

---

## Further reading (from this repo)

| Document | Why read it |
|----------|-------------|
| [README.md](README.md) | Full documentation index and reading order |
| [arch_guide_overview.md](arch_guide_overview.md) | Service boundaries and data flow |
| [stack_guide_deployment.md](stack_guide_deployment.md) | Image build and Compose-based dev deployment |
| [tech_env_configuration.md](tech_env_configuration.md) | Environment variables and profile files |
| [stack_guide_production.md](stack_guide_production.md) | Hardening beyond “it runs” |
| [auth_guide_rbac.md](auth_guide_rbac.md) | JWT, roles, bootstrap admin |
| [arch_guide_worker_pipeline.md](arch_guide_worker_pipeline.md) | Celery vs Kafka worker paths |
| [graph_guide_neo4j_phishing.md](graph_guide_neo4j_phishing.md) | Graph database features |
| [roadmap_tbd.md](roadmap_tbd.md) | Production roadmap (secrets, observability, HA) |
| [stack_guide_pre_push_verification.md](stack_guide_pre_push_verification.md) | Tests before shipping chart changes |

---

## Summary

- **Kubernetes** runs and connects the frontend, API, workers, and data stores with health checks, scaling, and networking.
- **Helm chart** `deploy/helm/triage/` packages those resources with environment-specific **values** files for dev, staging, and prod.
- **ConfigMaps** hold non-secret settings; **Secrets** hold `JWT_SECRET`, `POSTGRES_PASSWORD`, and related keys — always use `REPLACE_ME` placeholders in git and inject real values at deploy time.
- **Ingress** and **HPA** turn on for staging/prod-style deployments; dev typically uses in-cluster databases and port-forwarding instead.
- Start from the [documentation index](README.md) for the full picture of the product; use this guide when you are ready to run the same application on a Kubernetes cluster.
