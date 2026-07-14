# Snowflake analytics warehouse guide

This guide explains how the Suspicious Email Triage project exports **completed review data** from **MongoDB** (operational database) into a **Snowflake-style analytical warehouse** for reporting dashboards — and how the **mock AWS Snowflake** service lets you run everything locally without a paid Snowflake account.

**Related:** [arch_guide_worker_pipeline.md](arch_guide_worker_pipeline.md), [ops_guide_secrets_management.md](ops_guide_secrets_management.md), [roadmap_tbd.md](roadmap_tbd.md), [tech_env_configuration.md](tech_env_configuration.md).

---

## Why MongoDB and Snowflake together?

Think of two different jobs:

| Job | Question it answers | Best store type |
|-----|---------------------|-----------------|
| **Run triage today** | “Show me this email’s body, verdict, override, and status right now.” | **Operational** database (OLTP) |
| **Report over months** | “What was our phishing rate last quarter? How often do analysts override the model?” | **Analytical** warehouse (OLAP) |

### MongoDB = source of truth for operations

**MongoDB** holds the **full review document** — subject, body, links, `analysisResult`, analyst override, async `status` (`pending` → `completed`). When an analyst opens a review in the dashboard, **MongoDB is always the authority**. If Snowflake, Elasticsearch, or Neo4j are empty or stale, triage still works as long as Mongo has the document.

That is what **“source of truth”** means here: other systems get **copies** or **projections** derived from Mongo; they do not replace Mongo for day-to-day case work.

### Snowflake = reporting warehouse (derived data)

**Snowflake** (or our dev **`mock-snowflake`** container) holds **flat, denormalized rows** optimized for aggregates — verdict histograms, override rates, processing-time percentiles, daily phishing trends. Those tables are built **after** a review is `completed`, not instead of storing the review in Mongo.

In **development**, `mock-snowflake` keeps rows **in memory only** — no AWS account and no bill. In **staging/production**, the same export code targets a real Snowflake account or compatible warehouse API.

### “Fire-and-forget” — same pattern as graph sync and search

When Celery finishes scoring an email, the Python worker does **not** wait for Neo4j, Elasticsearch, and Snowflake to all succeed. Instead:

1. Celery writes the final verdict to **MongoDB** (this step **must** succeed for the product to work).
2. Celery calls Node **`POST /graph/internal/sync/:id`** with a service token.
3. Node runs **graph sync first** (Neo4j nodes/edges for campaigns), then schedules two **background** jobs:
   - **`scheduleSearchIndex(reviewId)`** → Elasticsearch full-text index
   - **`scheduleSnowflakeExport(reviewId)`** → Snowflake analytical tables

**Fire-and-forget** means: the HTTP handler returns without blocking on those background exports. If Elasticsearch is down, search may lag; if Snowflake export fails, reporting charts may lag — but the review is already **completed in Mongo** and the analyst sees the verdict. Failures are logged (`logger.warn`) and can be retried via manual export APIs.

Implementation references:

| Side effect | Scheduler function | Module |
|-------------|-------------------|--------|
| Neo4j graph | synchronous in same request | `graphSyncService.js` via `graphInternal.js` |
| Elasticsearch | `scheduleSearchIndex` | `reviewSearchSync.js` |
| Snowflake | `scheduleSnowflakeExport` | `snowflakeExport.js` |

Analyst **override** (`POST /reviews/:id/override`) also calls `scheduleSnowflakeExport` so warehouse rows reflect the human verdict.

---

### Demo scenario — one email from queue to warehouse

**Setup:** Docker dev stack running (`backend`, `ai-celery`, `mock-snowflake`, Neo4j, Elasticsearch optional).

1. **Analyst submits** a suspicious email via the dashboard → `POST /reviews`.
2. **MongoDB** inserts a document: `{ status: "pending", subject: "...", body: "..." }`. API responds immediately.
3. **Kafka → Celery** runs `analyze_review`. Worker sets `{ status: "completed", analysisResult: { verdict: "likely_phishing", ... } }` in **MongoDB** — this is the operational record analysts rely on.
4. **Celery** POSTs to **`/graph/internal/sync/:id`**. Node upserts Sender/Url/Review nodes in **Neo4j** (campaign detection may link this email to others).
5. In the same handler, Node calls **`scheduleSearchIndex`** (Elasticsearch gets searchable subject/sender fields) and **`scheduleSnowflakeExport`** (background).
6. **`scheduleSnowflakeExport`** reads the Mongo document again, maps it via `reviewToSnowflakeRow.js`, and POSTs rows to **`mock-snowflake`** tables `REVIEWS_ANALYTICS`, `PROCESSING_METRICS`, and optionally `OVERRIDE_EVENTS`.
7. **Manager opens Analytics** → `GET /analytics/phishing-trends` reads from the warehouse — **not** by scanning all Mongo documents.

**What if step 6 fails?** The review remains completed in Mongo; the analyst’s verdict is unchanged. Ops can run `POST /analytics/snowflake/export/:id` to backfill one review, or `POST /analytics/snowflake/export-batch` for dev backfill.

**What Mongo is not used for here:** long-range BI queries across millions of rows — that is Snowflake’s role. Mongo stays optimized for document CRUD; the warehouse stays optimized for `GROUP BY` and time-range reports.

---

## Architecture pattern

```text
POST /reviews → MongoDB (pending)
     → Kafka → Celery analyze_review → MongoDB (completed)   ← source of truth
     → POST /graph/internal/sync/:id (Celery callback)
         → Neo4j graph sync (awaited in handler)
         → scheduleSearchIndex(reviewId)      → Elasticsearch (background)
         → scheduleSnowflakeExport(reviewId)  → mock-snowflake / Snowflake (background)
```

**Technologies involved:**

- **ETL mapping:** `backend/src/analytics/reviewToSnowflakeRow.js` transforms Mongoose documents into flat analytical columns.
- **Export orchestration:** `backend/src/analytics/snowflakeExport.js` (mirrors `reviewSearchSync.js`).
- **HTTP client:** `backend/src/analytics/snowflakeClient.js` — points at `SNOWFLAKE_URL` (mock in dev).
- **Mock warehouse:** `infra/mock-aws-snowflake/server.js` — in-memory tables + aggregate query endpoints.

---

## Analytical tables (mock schema)

| Table | Purpose |
|-------|---------|
| `REVIEWS_ANALYTICS` | One row per completed review: verdicts, findings counts, override flags, confidence proxy |
| `PROCESSING_METRICS` | Processing duration (`updatedAt − createdAt`) per review |
| `OVERRIDE_EVENTS` | Rows when an analyst changed the automated verdict |

Column mapping logic lives in `reviewToSnowflakeRow.js`. **Confidence scores** in dev are deterministic hashes of `review_id` (mock model output); production would store real LLM/rule-engine scores on the Mongo document.

---

## Docker: start mock Snowflake

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d mock-snowflake backend
curl -s http://localhost:4567/health | python3 -m json.tool
```

**Expected:** `{ "status": "ok", "service": "mock-aws-snowflake" }`

---

## Environment variables

Configure in committed `backend/.env.dev` (non-secret URLs only):

| Variable | Purpose |
|----------|---------|
| `SNOWFLAKE_ENABLED` | When `false`, export and analytics APIs are skipped |
| `SNOWFLAKE_URL` | Mock base URL — `http://mock-snowflake:4567` inside Compose; `http://localhost:4567` from host curl |

Real production values (account, warehouse, role, private key) belong in gitignored `*.secrets` — never in documentation.

---

## REST API (Node backend)

All routes require JWT. Reporting routes need **`metrics.read`** (manager/admin roles).

| Method | Path | Description |
|--------|------|-------------|
| GET | `/analytics/snowflake/status` | Warehouse connectivity and row counts |
| GET | `/analytics/verdict-distribution?from=&to=` | Verdict histogram for time range |
| GET | `/analytics/override-rate?from=&to=` | Analyst override rate |
| GET | `/analytics/processing-stats?from=&to=` | Average and p95 processing ms |
| GET | `/analytics/phishing-trends?from=&to=` | Daily risky verdict counts |
| GET | `/analytics/model-performance?from=&to=` | Override rate + average confidence |
| POST | `/analytics/snowflake/export/:id` | Manual export of one review |
| POST | `/analytics/snowflake/export-batch` | Backfill completed reviews (developer) |
| DELETE | `/analytics/snowflake/data` | Clear mock tables (developer) |

### Example

```bash
TOKEN="<jwt-from-POST-/auth/login>"

curl -s -H "Authorization: Bearer ${TOKEN}" \
  http://localhost:3000/analytics/snowflake/status | python3 -m json.tool

curl -s -H "Authorization: Bearer ${TOKEN}" \
  "http://localhost:3000/analytics/phishing-trends?from=2026-06-01T00:00:00Z" | python3 -m json.tool
```

---

## When export runs automatically

| Event | Trigger |
|-------|---------|
| Celery completes analysis | `POST /graph/internal/sync/:id` → `scheduleSnowflakeExport` |
| Analyst override saved | `POST /reviews/:id/override` → `scheduleSnowflakeExport` |

Only reviews with `status: completed` and an `analysisResult.verdict` are exported.

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — WSL, repository root unless noted</p>

```bash
cd ~/suspicious-email-triage
npm test --prefix backend -- --testPathPattern=snowflakeAnalytics --watchAll=false
```

</div>
