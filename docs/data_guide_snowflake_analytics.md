# Snowflake analytics warehouse guide

This guide explains how the Suspicious Email Triage project exports **completed review data** from **MongoDB** (operational database) into a **Snowflake-style analytical warehouse** for reporting dashboards — and how the **mock AWS Snowflake** service lets you run everything locally without a paid Snowflake account.

**Related:** [arch_guide_worker_pipeline.md](arch_guide_worker_pipeline.md), [ops_guide_secrets_management.md](ops_guide_secrets_management.md), [roadmap_tbd.md](roadmap_tbd.md), [tech_env_configuration.md](tech_env_configuration.md).

---

## Why MongoDB and Snowflake together?

| Store | Type | Role in this project |
|-------|------|----------------------|
| **MongoDB** | Document (NoSQL OLTP) | Live review payloads, analyst overrides, async status — optimized for read/write of full email documents |
| **Snowflake** | Cloud analytical warehouse (OLAP) | Denormalized tables for **trends**, **verdict distributions**, **override rates**, and **processing-time statistics** over long time ranges |

MongoDB stays the **source of truth** for triage operations. Snowflake receives **exported snapshots** after analysis completes (same fire-and-forget pattern as Elasticsearch indexing and Neo4j graph sync).

In **development**, the `mock-snowflake` Docker container stores rows **in memory only** — nothing is written to AWS or a real Snowflake account.

---

## Architecture pattern

```text
POST /reviews → MongoDB (pending)
     → Kafka → Celery analyze_review → MongoDB (completed)
     → POST /graph/internal/sync/:id (worker callback)
         → scheduleSnowflakeExport(reviewId)
             → HTTP POST mock-snowflake /v1/data/insert
                 → REVIEWS_ANALYTICS, PROCESSING_METRICS, OVERRIDE_EVENTS tables
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
