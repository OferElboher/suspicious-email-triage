# Mailbox ingest gateway — Go service guide

This guide explains the **Go ingest-gateway** service: why it exists, which Go language features it uses, how it connects to the existing Node/Python pipeline, and how to run **dev simulation** with live charts in the React **#ingest** tab.

**Related:** [data_guide_kafka_events.md](data_guide_kafka_events.md), [ui_guide_mailbox_ingest.md](ui_guide_mailbox_ingest.md), [ui_guide_review_dashboard.md](ui_guide_review_dashboard.md), [api_reference_rest.md](api_reference_rest.md), [stack_guide_full_feature_activation.md](stack_guide_full_feature_activation.md), [roadmap_tbd.md](roadmap_tbd.md) §3.1.

---

## Three ways to get email into triage

The product supports **three distinct entry paths**. All of them eventually create a **Review** document in MongoDB and enqueue the same Kafka topic (`email.review.ingested`) for Celery scoring — but they differ in **who sends the data**, **which HTTP endpoint** is used, **how authentication works**, and **typical production use cases**.


| Path                    | How it is triggered                                                                      | HTTP endpoint                                                                      | Authentication                                                                              | MongoDB `source` field                                               | Typical use case                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **1. Manual UI input**  | Analyst fills the submit modal in the Review dashboard and clicks submit                 | `POST /reviews` on Node (`:3000`)                                                  | Browser **JWT** (login session; needs `reviews.write`)                                      | `user`                                                               | Day-to-day SOC work: analyst pastes a suspicious email, phishing exercise, demo for stakeholders                                                                                           |
| **2. HTTP POST review** | Script, curl, Postman, SOAR playbook, or CI test calls the **same** Node API the UI uses | `POST /reviews` on Node (`:3000`)                                                  | **Bearer JWT** in `Authorization` header (same permission as UI)                            | `user`                                                               | Trusted automation that submits **one review at a time** on behalf of analysts — e.g. internal tooling, regression tests, webhook adapter you control that already has analyst credentials |
| **3. Mailbox ingest**   | External mailbox platform (or Go dev simulation) pushes email-shaped JSON at volume      | `POST /v1/ingest/email` on Go (`:8080`), then Node `POST /ingest/internal/mailbox` | **No analyst JWT** at the edge; shared secret `X-Ingest-Internal-Token` between Go and Node | `mailbox_ingest` (real webhook) or `mailbox_simulation` (dev ticker) | **Production mail flow**: M365 Graph subscription, Gmail Pub/Sub, Postfix pipe — many emails per hour, machines not humans                                                                 |


### How manual UI and `POST /reviews` relate

**Manual UI input is not a separate backend path.** The Review dashboard modal is a form that calls `**POST /reviews`** with the analyst’s JWT. From the server’s perspective, a curl with a valid token and the same JSON body is identical to clicking Submit in the browser.

Use **manual UI** when a human is working in the product. Use `**POST /reviews` from HTTP** when you need programmatic submit without driving the browser — but you still need analyst-grade auth and you still send one review per request.

See [ui_guide_review_dashboard.md](ui_guide_review_dashboard.md) and [auth_guide_obtain_jwt.md](auth_guide_obtain_jwt.md) for UI and JWT details; see [api_reference_rest.md](api_reference_rest.md) for the request body schema.

### How mailbox ingest differs — and why it exists

**Mailbox ingest** is for **machine senders at scale**, not for analysts or single-shot scripts:

- **Callers are mail systems**, not logged-in users — Graph, Gmail, mail transfer agents, or (in dev) the Go simulation ticker.
- **Traffic pattern** — bursts of short POSTs; callers expect a fast `201` and may retry; often deployed at a **network edge** separate from the analyst API.
- **Different public endpoint** — `POST /v1/ingest/email` on **Go** (`:8080`), not `POST /reviews` on Node. Go forwards to Node `**POST /ingest/internal/mailbox`**, which is **not** JWT-protected; it uses the internal token instead.
- **Different `source` value** — `mailbox_ingest` / `mailbox_simulation` so operators can filter mailbox traffic vs analyst submissions (`user`) in metrics and the review queue.

**You do not need mailbox ingest** if your only goal is to submit occasional test emails — use the UI or `POST /reviews`. **You do need mailbox ingest** (or something like it) when real mail must flow automatically from an organization’s mailbox infrastructure into the same triage pipeline without issuing JWTs to Microsoft or Google.

After Node accepts any of these paths, the **downstream pipeline is the same**: link extraction, Kafka, Celery `analyze_review`, rules/agent/LLM, Neo4j sync, Elasticsearch index.

**Related (dev-only load generators, not production ingest):** Node **Dev simulation** (`dev_simulation` source, Review dashboard card) and Go **mailbox simulation** (`mailbox_simulation`, **#ingest** tab) create synthetic volume for demos — see [stack_guide_dev_simulation.md](stack_guide_dev_simulation.md) and [ui_guide_mailbox_ingest.md](ui_guide_mailbox_ingest.md).

---

## Why a separate Go service?

In production, email triage has **two very different kinds of HTTP traffic**. Mixing them in one server works for a demo, but it becomes painful at scale — so this project splits them deliberately.

### Two audiences, two traffic patterns


| Traffic type             | Who calls the API                         | Real-world examples                                                                                                                                                                       | What “good” looks like                                                                                                                                                     |
| ------------------------ | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Analyst HTTP traffic** | Humans in the browser (after JWT login)   | Analyst opens the review queue, reads an email, overrides a verdict, runs graph/search, views analytics                                                                                   | Sessions last minutes; requests are bursty but relatively low volume; **correctness and RBAC** matter most                                                                 |
| **Mailbox ingest**       | Machines — mailbox platforms and webhooks | Microsoft 365 pushes new mail via **Graph subscription**; Gmail uses **Pub/Sub**; a Postfix server **pipes** each message to an HTTP endpoint; a SOAR playbook POSTs a normalized payload | Traffic can **spike** (Monday morning mail storms); many short POSTs in parallel; callers often **retry** on timeout; the edge must stay up even when analysts are offline |


**Analyst traffic** is the product UI: login, list reviews, submit one email manually, inspect graph campaigns, change status. Those flows need JWT, role checks, rich JSON responses, and integration with MongoDB, Postgres, Neo4j, and Elasticsearch. The Node API (`backend` on port 3000) is built for that.

**Mailbox ingest** is the **automatic front door** for email-shaped data. Nobody is clicking “Submit” — an external system delivers `{ sender, subject, body }` over HTTP, often hundreds or thousands of times per hour. That workload looks like:

- **Webhook bursts** — Graph/Gmail notify you the instant mail arrives; many notifications can land in the same second.
- **Fire-and-forget POSTs** — the sender expects a quick `201 Created` (or `4xx` if malformed), then disconnects; long handler chains block connection pools.
- **Edge placement** — in Kubernetes you often want a **small, dedicated pod** at the perimeter (DMZ / ingress) that only accepts ingest and forwards inward, instead of exposing the full analyst API.
- **Dev simulation** — in local Docker, engineers need a **configurable fake mailbox** (emails per minute) to stress-test Kafka → Celery → agent triage without paying for M365/Gmail sandbox tenants.

Those ingest requirements are **not** the same as serving React and JWT-protected CRUD. Putting webhook timers and burst POST handling inside the same Node process that serves analysts would couple two failure modes: a simulation loop or webhook storm could contend with analyst API latency.

So this repo adds `ingest-gateway`: a small Go service whose only job is “accept mailbox-shaped HTTP → forward to Node internal API → expose ingest metrics.” Analysts still use Node on `:3000`; mail platforms (or dev simulation) hit Go on `:8080`.

The gateway **does not** talk to MongoDB directly. It calls the Node internal route `POST /ingest/internal/mailbox`, which keeps **one source of truth** for review documents, link extraction, and Kafka publishing — the same downstream pipeline as `**POST /reviews`** and manual UI submit (see [Three ways to get email into triage](#three-ways-to-get-email-into-triage)).

### ן

Go is a strong fit for the **ingest edge** (you do not need to know Go to operate the product; this table explains what the code is doing):


| Go idea               | What it means                                                                                                                                                                                                                                                                                                                                                                                                                                                              | How we use it in `ingest-gateway`                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Goroutines**        | A **goroutine** is like starting a tiny background task that runs **concurrently** with the main program. Go schedules many goroutines on a few OS threads — cheap compared to spawning a full thread per connection. You do not manage thread pools manually.                                                                                                                                                                                                             | Dev **simulation** runs in a goroutine with a **ticker** (clock tick every N seconds). While synthetic emails are generated in the background, the HTTP server still accepts real webhook POSTs on other goroutines — neither blocks the other.                                                                                                                                                                                                                                                            |
| `net/http`            | Go’s standard library includes a production-grade HTTP **server and client** without importing Express, FastAPI, or similar. Patterns like `ListenAndServe`, route registration, and timeouts are built in.                                                                                                                                                                                                                                                                | The gateway exposes `/v1/ingest/email`, health checks, and stats using `net/http` and Go 1.22’s method-aware routes — no heavy web framework, small attack surface, easy to reason about.                                                                                                                                                                                                                                                                                                                  |
| **Static binary**     | `go build` produces a **single executable file** with no separate runtime (no Node.js install, no Python interpreter inside the container). “Static” here means the binary carries its dependencies; the container only needs that one file plus minimal OS glue.                                                                                                                                                                                                          | The **Dockerfile** uses a multi-stage build: compile in `golang:1.22-alpine`, copy one binary into a **distroless** image (~tens of MB). Fast deploys, fewer CVEs from unused packages, fits well as a dedicated ingest pod.                                                                                                                                                                                                                                                                               |
| **Prometheus client** | **Prometheus** is an open-source **metrics** system used widely in cloud-native ops. Your service exposes counters/gauges at an HTTP path (here `/metrics`); a **Prometheus server** (or compatible scraper) **pulls** that page every few seconds and stores time series. **Grafana** (or similar) charts them. The **Prometheus client library** in Go defines counters like “emails received” and increments them in code — you do not build your own metrics database. | Counters such as `triage_mailbox_ingest_received_total{source="mailbox_ingest"}` track successful handoffs to Node; error counters label validation vs backend failures. Ops can scrape `:8080/metrics` alongside Node’s `/ops/prometheus` to answer: “Is the gateway up? Are webhooks failing? Is simulation flooding us?” The React **#ingest** tab uses a **separate** JSON dashboard (`/v1/stats/dashboard`) for human-readable charts; Prometheus is for **monitoring/alerting**, not the analyst UI. |


---

## End-to-end flow

Read this diagram **top to bottom** as the life of one ingested email. The steps above explain *why* each box exists; here is *what happens* in order.

```text
[Who sends mail-shaped data?]
  • Production: Microsoft Graph / Gmail Pub/Sub / Postfix pipe → POST webhook
  • Dev: simulation goroutine inside Go (no external mailbox needed)
        │
        ▼
  Go ingest-gateway (:8080)                    ← ingest edge: fast accept, metrics, rate-limited sim
    • POST /v1/ingest/email  (real webhook path)
    • or internal ticker     (dev simulation only)
        │
        ▼
  Node POST /ingest/internal/mailbox         ← domain logic stays in existing API
    • Header: X-Ingest-Internal-Token        (shared secret — not browser JWT)
    • Validates body, extracts links, creates Review document
        │
        ▼
  MongoDB Review                               ← source=mailbox_ingest or mailbox_simulation
  enqueueAfterCreate → Kafka topic             email.review.ingested
        │
        ▼
  Python ai-kafka-dispatch → Celery            ← same async pipeline as POST /reviews / manual UI
  analyze_review → rules / agent / LLM → completed
        │
        ▼
  Analyst-facing surfaces
    • Workspace queue (real ingests; simulation hidden unless filtered)
    • #ingest tab (polls Go stats via Node proxy — throughput chart, errors, sim status)
    • Prometheus scrape of :8080/metrics (optional ops monitoring)
```

**Takeaways for operators:**

1. **Go is the mailbox door; Node is the system of record.** External platforms should not POST directly to Node’s public JWT routes — they use Go (or, in some deployments, an API gateway in front of Go).
2. **After Node accepts the review, nothing is “Go-specific.”** Kafka, Celery, agent triage, Neo4j, and Elasticsearch behave exactly as for `**POST /reviews`** or a manual dashboard submit (`source: user`).
3. **Metrics appear in two places by design:** Prometheus counters for SRE alerts; JSON dashboard for the **#ingest** UI during demos and debugging.

---

## Repository layout (`ingest-gateway/`)


| Path                               | Purpose                                                 |
| ---------------------------------- | ------------------------------------------------------- |
| `cmd/ingest-gateway/main.go`       | Program entry — wires config, HTTP server, simulation   |
| `internal/config/config.go`        | Reads `DEPLOYMENT_ENV`, `INGEST_BACKEND_URL`, rate caps |
| `internal/handler/handler.go`      | HTTP routes (Go 1.22 method-aware `ServeMux` patterns)  |
| `internal/backend/client.go`       | HTTP client to Node internal API                        |
| `internal/simulation/simulator.go` | Goroutine + `time.Ticker` synthetic emails              |
| `internal/stats/stats.go`          | In-memory counters + per-minute buckets for UI charts   |
| `internal/metrics/prometheus.go`   | Prometheus counters (`triage_mailbox_ingest_*`)         |
| `Dockerfile`                       | Multi-stage build → distroless runtime image            |


**Pattern:** `internal/` **packages** — Go convention to mark code that is not imported by external modules; only this repo’s `main` package uses them.

---

## HTTP API (Go service)


| Method | Path                    | Purpose                               |
| ------ | ----------------------- | ------------------------------------- |
| GET    | `/health/live`          | Process up (Docker liveness)          |
| GET    | `/health/ready`         | Config sanity (backend URL set)       |
| GET    | `/metrics`              | Prometheus text exposition            |
| GET    | `/v1/stats/dashboard`   | JSON stats for React charts           |
| POST   | `/v1/ingest/email`      | Webhook-style email JSON              |
| POST   | `/v1/simulation/start`  | Dev only — `{ "emailsPerMinute": N }` |
| POST   | `/v1/simulation/stop`   | Dev only — stop simulation            |
| GET    | `/v1/simulation/status` | Dev simulation state                  |


**Webhook body example** (send to Go, not to Node directly):

```bash
curl -sS -X POST http://localhost:8080/v1/ingest/email \
  -H "Content-Type: application/json" \
  -d '{"senderName":"Alice","senderEmail":"alice@example.com","subject":"Invoice","body":"Please review"}'
```

The browser **never** calls port 8080 in dev — React uses `GET /metrics/mailbox-ingest` on Node (JWT protected), which proxies to Go.

---

## Environment variables


| Variable                            | Default (dev)         | Meaning                                   |
| ----------------------------------- | --------------------- | ----------------------------------------- |
| `MAILBOX_INGEST_ENABLED`            | `true`                | When false, main sleeps (container no-op) |
| `INGEST_GATEWAY_LISTEN`             | `:8080`               | Go HTTP bind address                      |
| `INGEST_BACKEND_URL`                | `http://backend:3000` | Node API base URL                         |
| `INGEST_INTERNAL_TOKEN`             | in `dev.secrets`      | Shared secret with Node                   |
| `MAILBOX_INGEST_MAX_EVENTS_PER_MIN` | `30`                  | Simulation rate cap                       |
| `DEPLOYMENT_ENV`                    | `dev`                 | Simulation routes forbidden outside dev   |


Node also uses `INGEST_GATEWAY_URL=http://ingest-gateway:8080` for dashboard proxying.

---

## Go patterns explained

### Goroutine + ticker (simulation)

A **goroutine** is a lightweight thread scheduled by the Go runtime. The simulation controller starts one goroutine that loops on `time.Ticker` — each tick builds a synthetic email and calls the same Node API as production webhooks.

This avoids loading the Node event loop with timer logic and keeps simulation failures isolated in the Go container logs.

### `context.Context`

HTTP handlers pass `r.Context()` into backend calls so requests cancel if the client disconnects — standard Go practice for outbound HTTP.

### Prometheus metrics

See the **Prometheus client** row in [Why Go fits this ingest role](#why-go-fits-this-ingest-role). In short: counters like `triage_mailbox_ingest_received_total{source="mailbox_ingest"}` follow the [Prometheus naming convention](https://prometheus.io/docs/concepts/metric_types/); scrape `:8080/metrics` for ops dashboards and alerts. Analyst-facing charts in **#ingest** use JSON from `/v1/stats/dashboard` instead.

### React `#ingest` simulation controls

The **#ingest** tab ([ui_guide_mailbox_ingest.md](ui_guide_mailbox_ingest.md)) exposes dev simulation through Node proxy routes (`POST /metrics/mailbox-ingest/simulation`), not by calling Go from the browser directly. The UI uses a **single toggle button** labeled **Start simulation** or **Stop simulation** (same wording as the Node Dev simulation card). While simulation runs, the **Emails/min** field is disabled; the toggle is grayed during the in-flight HTTP request.

---

## Unified logging (merged.log)

The Go service participates in the same **central logging** pattern as Node and Python: every important event is appended as one **NDJSON** line to `merged.log` on the shared Docker volume `triage-logs`.

| Concept | What it means here |
|---------|-------------------|
| **NDJSON** | Newline-delimited JSON — each log line is a complete JSON object. Tools like **grep**, **lnav**, and this project's `GET /logs/search` read the file line-by-line without a special parser. |
| **MERGED_LOG_PATH** | Environment variable pointing at the file path inside the container (`/var/log/triage/merged.log` in Compose). All services use the same variable name so ops scripts stay consistent. |
| **SERVICE_NAME** | Set to `ingest-gateway` in Docker Compose. Written into every JSON line as `"service":"ingest-gateway"` so analysts can filter mailbox ingest traffic separately from API or Celery noise. |
| **topic** | Logical area inside a service — Go uses topics like `ingest`, `simulation`, `startup`. Matches Node/Python `topic` for cross-service searches (`?topic=ingest`). |
| **stdout mirror** | Go also prints a human-readable line to container stdout (`docker compose logs ingest-gateway`). The **searchable history** for cross-service timelines is still `merged.log`. |

**Implementation:** `ingest-gateway/internal/logger/logger.go` — append-only file I/O with `O_APPEND`, mutex for in-process safety, same field names as `backend/src/lib/logger.js`.

**Examples (admin JWT required, permission `logs.read`):**

```bash
TOKEN="<jwt-from-POST-/auth/login>"

# Only Go mailbox ingest-gateway lines
curl -sS "http://localhost:3000/logs/search?service=ingest-gateway&limit=100" \
  -H "Authorization: Bearer ${TOKEN}"

# Simulation emit failures across services
curl -sS "http://localhost:3000/logs/search?topic=simulation&level=error&limit=50" \
  -H "Authorization: Bearer ${TOKEN}"
```

In the React UI, open **Search unified logs** (`#logs`) and set the **Service** filter to `ingest-gateway`.

Full guide: [ops_guide_central_logging.md](ops_guide_central_logging.md).

---

## Outbound verdict webhooks

After analysis completes, Node can **POST the verdict** back to the mail platform that ingested the message (SEG, Graph adapter, Postfix helper). Ingest accepts optional `externalMessageId` and `callbackUrl`; default webhook target is `VERDICT_CALLBACK_URL`.

See [data_guide_verdict_webhooks.md](data_guide_verdict_webhooks.md) for payload shape, HMAC header, polling API, and the dev **mock-verdict-callback** receiver.

---

## Docker Compose

Service name: `ingest-gateway`. Start with the full stack:

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

