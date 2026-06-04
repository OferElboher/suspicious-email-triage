# Health checks and uptime guide

This guide explains how the **Suspicious Email Triage** API tells orchestrators (Docker, Kubernetes) whether a container is **alive** and whether it can **serve traffic**. It implements [TBD §1.2](roadmap_tbd.md#12-health-checks-and-uptime-p0) — the free, local path without paid uptime vendors.

**Related:** [arch_guide_overview.md](arch_guide_overview.md), [infra/docker/docker-compose.yml](../infra/docker/docker-compose.yml), [deploy/helm/triage](../deploy/helm/triage).

---

## Liveness vs readiness (for beginners)

Think of a restaurant:

| Probe | Question it asks | If it fails |
|-------|------------------|-------------|
| **Liveness** | Is the process still running? | The platform **restarts** the container (like rebooting a frozen app). |
| **Readiness** | Can this instance safely handle requests right now? | The load balancer **stops sending traffic** to this instance until it passes again. It may **not** restart the process. |

**Why two probes?**

- A slow database should **not** cause endless restarts (liveness would flap). Readiness marks the pod “not ready” until Mongo/Postgres respond.
- A deadlocked Node process **should** be restarted — liveness catches “process up but not responding.”

In this project:

- **`GET /health/live`** — liveness (no database calls).
- **`GET /health/ready`** — readiness (checks MongoDB, PostgreSQL, optional Redis and Neo4j).
- **`GET /health`** — legacy summary for humans and old scripts; same dependency logic as readiness.

All health routes are **public** (no JWT). Load balancers and Docker must poll without credentials.

---

## HTTP endpoints

Implementation: `backend/src/api/health.js`, `backend/src/lib/healthChecks.js`. Mounted at `/health` before authentication in `backend/src/http/createApp.js`.

### `GET /health/live`

Returns **200** with JSON when the Node process can answer HTTP:

```json
{
  "status": "ok",
  "probe": "live",
  "service": "triage-api",
  "timestamp": "2026-06-01T12:00:00.000Z"
}
```

No external I/O — suitable for Kubernetes **livenessProbe**.

### `GET /health/ready`

Runs parallel checks:

| Dependency | Behavior |
|------------|----------|
| **MongoDB** | `mongoose` connection `readyState === 1` |
| **PostgreSQL** | `SELECT 1` on the statistics DB (`statsPgUrl()`) |
| **Redis** | Ping when `REDIS_HOST` is set; otherwise **skipped** (treated as ok) |
| **Neo4j** | Bolt check when graph features enabled; otherwise **disabled** (ok) |

- **200** when every check reports `ok: true` (`status: "ok"`).
- **503** when any check fails (`status: "degraded"`) with a `checks` array per service.

Example degraded body:

```json
{
  "status": "degraded",
  "probe": "ready",
  "service": "triage-api",
  "timestamp": "2026-06-01T12:00:00.000Z",
  "checks": [
    { "name": "mongodb", "ok": true, "detail": "connected" },
    { "name": "postgres", "ok": false, "detail": "connection refused" }
  ]
}
```

Use this path for Docker **HEALTHCHECK** and Kubernetes **readinessProbe**.

### `GET /health`

Backward-compatible summary for `curl` and integration tests:

- **200** when readiness is ok; **503** when degraded.
- Includes `auth: "required_for_api"` as a reminder that business routes need JWT.

```bash
curl -sS http://localhost:3000/health/live
curl -sS http://localhost:3000/health/ready
curl -sS http://localhost:3000/health
```

---

## Docker Compose HEALTHCHECK

File: `infra/docker/docker-compose.yml` (backend service).

The backend container polls **`http://127.0.0.1:3000/health/ready`** with built-in Node `fetch` (no extra image packages):

| Setting | Value | Meaning |
|---------|-------|---------|
| `interval` | 15s | How often to probe |
| `timeout` | 5s | Max wait per probe |
| `retries` | 5 | Failures before marking unhealthy |
| `start_period` | 30s | Grace period after container start |

When readiness fails, Compose marks the service **unhealthy**. Other tooling (and operators) can use `docker inspect` health status. Pair this with `depends_on` and your runbook: “API up but graph empty” (Neo4j degraded) vs “API down” (process not listening).

---

## Kubernetes probes (Helm)

Chart: `deploy/helm/triage/`.

`values.yaml` defaults:

```yaml
backend:
  probes:
    livenessPath: /health/live
    readinessPath: /health/ready
    initialDelaySeconds: 20
    periodSeconds: 15
```

`templates/backend-deployment.yaml` wires:

- **livenessProbe** → `/health/live` (process responding).
- **readinessProbe** → `/health/ready` (dependencies OK).

Tune `initialDelaySeconds` if Mongo/Postgres need longer cold starts on your cluster.

---

## Runbook snippets

| Symptom | Likely cause | What to check |
|---------|--------------|---------------|
| `/health/live` OK, `/health/ready` 503 | Dependency down | `checks[]` in JSON — Mongo, Postgres, Redis, Neo4j |
| Both fail / connection refused | API not listening | Container logs, port 3000, crash loop |
| Ready OK but empty graph UI | Neo4j optional / sync | Graph sync logs; Neo4j check may be `disabled` |
| Ready flaps after deploy | DB still starting | Increase `start_period` / `initialDelaySeconds` |

---

## Technologies and patterns

| Piece | Technology |
|-------|------------|
| API | Node.js + Express |
| Health logic | `healthChecks.js` (mongoose, `pg` Pool, optional `ioredis`, Neo4j driver) |
| Orchestration | Docker Compose `healthcheck`, Kubernetes HTTP probes via Helm |
| Auth on probes | None (industry-standard public probe paths) |

**Not in scope for this free path:** external uptime SaaS, `@godaddy/terminus` graceful shutdown (mentioned in TBD as optional future work). Counters and alerts live in [ops_guide_metrics_alerting.md](ops_guide_metrics_alerting.md).

---

## Tests

Jest: `backend/__tests__/healthApi.test.js` — live/ready/summary status codes and payloads.

Integration: `integration_tests/test_http_endpoints.py` hits `GET /health`.
