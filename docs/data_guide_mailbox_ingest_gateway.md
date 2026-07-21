# Mailbox ingest gateway — Go service guide (novice-friendly)

This guide explains the **Go ingest-gateway** service: why it exists, which Go language features it uses, how it connects to the existing Node/Python pipeline, and how to run **dev simulation** with live charts in the React **#ingest** tab.

**Audience:** developers new to Go who want to understand this repository’s first Go microservice.

**Related:** [data_guide_kafka_events.md](data_guide_kafka_events.md), [ui_guide_mailbox_ingest.md](ui_guide_mailbox_ingest.md), [stack_guide_full_feature_activation.md](stack_guide_full_feature_activation.md), [roadmap_tbd.md](roadmap_tbd.md) §3.1.

---

## Why a separate Go service?

The Node API is optimized for **analyst HTTP traffic** (JWT login, review CRUD, graph, search). **Mailbox ingest** is a different problem:

- Many concurrent inbound HTTP connections (webhooks from Microsoft Graph, Gmail, or Postfix).
- Long-lived timers for **simulation** in dev.
- A small, static binary that is cheap to run at the edge in Kubernetes.

Go is a strong fit because:

| Go idea | How we use it |
|---------|----------------|
| **Goroutines** | Background simulation loop without blocking HTTP handlers |
| **`net/http`** | Built-in HTTP server (no heavy framework required) |
| **Static binary** | Single container image from multi-stage Docker build |
| **Prometheus client** | Standard metrics scrape at `/metrics` |

The gateway **does not** talk to MongoDB directly. It calls the Node internal route `POST /ingest/internal/mailbox`, which keeps one source of truth for review documents and Kafka publishing.

---

## End-to-end flow

```text
[External mailbox webhook OR dev simulation goroutine]
        │
        ▼
  Go ingest-gateway (:8080)
    POST /v1/ingest/email
    or simulation ticker
        │
        ▼
  Node POST /ingest/internal/mailbox
    (header X-Ingest-Internal-Token)
        │
        ▼
  Mongo Review (source=mailbox_ingest | mailbox_simulation)
  enqueueAfterCreate → Kafka email.review.ingested
        │
        ▼
  Python ai-kafka-dispatch → Celery → completed review
        │
        ▼
  React UI (#ingest tab polls stats; workspace shows real ingests)
```

---

## Repository layout (`ingest-gateway/`)

| Path | Purpose |
|------|---------|
| `cmd/ingest-gateway/main.go` | Program entry — wires config, HTTP server, simulation |
| `internal/config/config.go` | Reads `DEPLOYMENT_ENV`, `INGEST_BACKEND_URL`, rate caps |
| `internal/handler/handler.go` | HTTP routes (Go 1.22 method-aware `ServeMux` patterns) |
| `internal/backend/client.go` | HTTP client to Node internal API |
| `internal/simulation/simulator.go` | Goroutine + `time.Ticker` synthetic emails |
| `internal/stats/stats.go` | In-memory counters + per-minute buckets for UI charts |
| `internal/metrics/prometheus.go` | Prometheus counters (`triage_mailbox_ingest_*`) |
| `Dockerfile` | Multi-stage build → distroless runtime image |

**Pattern: `internal/` packages** — Go convention to mark code that is not imported by external modules; only this repo’s `main` package uses them.

---

## HTTP API (Go service)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health/live` | Process up (Docker liveness) |
| GET | `/health/ready` | Config sanity (backend URL set) |
| GET | `/metrics` | Prometheus text exposition |
| GET | `/v1/stats/dashboard` | JSON stats for React charts |
| POST | `/v1/ingest/email` | Webhook-style email JSON |
| POST | `/v1/simulation/start` | Dev only — `{ "emailsPerMinute": N }` |
| POST | `/v1/simulation/stop` | Dev only — stop simulation |
| GET | `/v1/simulation/status` | Dev simulation state |

**Webhook body example** (send to Go, not to Node directly):

```bash
curl -sS -X POST http://localhost:8080/v1/ingest/email \
  -H "Content-Type: application/json" \
  -d '{"senderName":"Alice","senderEmail":"alice@example.com","subject":"Invoice","body":"Please review"}'
```

The browser **never** calls port 8080 in dev — React uses `GET /metrics/mailbox-ingest` on Node (JWT protected), which proxies to Go.

---

## Environment variables

| Variable | Default (dev) | Meaning |
|----------|---------------|---------|
| `MAILBOX_INGEST_ENABLED` | `true` | When false, main sleeps (container no-op) |
| `INGEST_GATEWAY_LISTEN` | `:8080` | Go HTTP bind address |
| `INGEST_BACKEND_URL` | `http://backend:3000` | Node API base URL |
| `INGEST_INTERNAL_TOKEN` | in `dev.secrets` | Shared secret with Node |
| `MAILBOX_INGEST_MAX_EVENTS_PER_MIN` | `30` | Simulation rate cap |
| `DEPLOYMENT_ENV` | `dev` | Simulation routes forbidden outside dev |

Node also uses `INGEST_GATEWAY_URL=http://ingest-gateway:8080` for dashboard proxying.

---

## Go patterns explained (for newcomers)

### Goroutine + ticker (simulation)

A **goroutine** is a lightweight thread scheduled by the Go runtime. The simulation controller starts one goroutine that loops on `time.Ticker` — each tick builds a synthetic email and calls the same Node API as production webhooks.

This avoids loading the Node event loop with timer logic and keeps simulation failures isolated in the Go container logs.

### `context.Context`

HTTP handlers pass `r.Context()` into backend calls so requests cancel if the client disconnects — standard Go practice for outbound HTTP.

### Prometheus metrics

Counters like `triage_mailbox_ingest_received_total{source="mailbox_ingest"}` follow the [Prometheus naming convention](https://prometheus.io/docs/concepts/metric_types/). Ops can scrape `:8080/metrics` alongside Node `/ops/prometheus`.

---

## Docker Compose

Service name: **`ingest-gateway`**. Start with the full stack:

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --build \
  ingest-gateway backend ai-celery ai-kafka-dispatch redpanda mongo postgres redis
```

---

## Tests

```bash
cd ~/suspicious-email-triage/ingest-gateway
go test ./...
```

Included in `bash scripts/test-all.sh` when `go` is installed on the host.

Node tests: `backend/__tests__/ingestInternal.test.js`  
Frontend: `frontend/src/views/IngestDashboardView.test.jsx`

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — send one test email through the Go gateway (requires stack up)</p>

```bash
curl -sS -X POST http://localhost:8080/v1/ingest/email \
  -H "Content-Type: application/json" \
  -d '{"senderName":"Dev Test","senderEmail":"dev@test.local","subject":"Gateway ping","body":"Hello from curl"}' \
  | python3 -m json.tool
```

</div>
