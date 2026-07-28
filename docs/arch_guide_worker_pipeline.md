# Worker architecture and execution model

Email analysis is intentionally slower than saving a web form, so the system **separates accepting a request from processing it**. When an analyst clicks **Queue analysis**, the browser receives a fast HTTP response while scoring runs in background workers. That pattern keeps the UI responsive and lets operators scale workers independently of the API.

**Related:** [data_guide_kafka_events.md](data_guide_kafka_events.md), [arch_guide_system_comprehensive.md](arch_guide_system_comprehensive.md), [data_guide_mailbox_ingest_gateway.md](data_guide_mailbox_ingest_gateway.md), [roadmap_tbd.md](roadmap_tbd.md).

---

## Default production-style path (email reviews)

Reviews enter the pipeline through **one of three paths** (same Kafka/Celery steps after MongoDB create):

| Path | Entry | Auth |
|------|-------|------|
| Manual UI or **`POST /reviews`** | Node `:3000` | JWT (`reviews.write`) |
| **Mailbox ingest** | Go `:8080` → Node `/ingest/internal/mailbox` | `X-Ingest-Internal-Token` |
| Dev simulation | Node `/dev/simulation` or Go **#ingest** ticker | Dev permissions |

Details: [data_guide_mailbox_ingest_gateway.md — Three ways to get email into triage](data_guide_mailbox_ingest_gateway.md#three-ways-to-get-email-into-triage).

Typical flow after a review document exists (`status=pending`):

```text
MongoDB Review (pending)
         → Kafka topic email.review.ingested
         → Python ai-kafka-dispatch (consumer)
         → Celery task analyze_review (Redis broker)
         → Python ai-celery worker
         → MongoDB (analysisResult, status=completed)
         → PostgreSQL (review_stats_events for charts)
         → Node internal graph sync → Neo4j (verdict + campaigns)
         → Elasticsearch re-index (background, full-text search)
         → Snowflake export (background, analytics warehouse)
```

Analyst **`POST /reviews`** (or the UI modal) follows the same async path from Kafka onward:

```text
React UI or curl → Node Express API → MongoDB (Review document, status=pending)
                 → (continues as above)
```

| Step | Technology | What it does |
|------|------------|--------------|
| 1 | **Express** + **MongoDB** | Persists the raw review and returns immediately |
| 2 | **Kafka / Redpanda** | Durable event bus — survives brief API restarts |
| 3 | **kafka_dispatcher.py** | Validates JSON, calls `analyze_review.delay(reviewId)`, sends bad messages to DLQ |
| 4 | **Celery** + **Redis** | Task queue — workers pull jobs asynchronously |
| 5 | **analyze_review** (`ai_service/app/tasks.py`) | Rule engine + LLM stub/merge, writes final verdict |
| 6 | **graph_sync.py** | HTTP callback to Node `POST /graph/internal/sync/:id` |
| 7 | **graphInternal.js** | Neo4j sync (awaited) + **`scheduleSearchIndex`** + **`scheduleSnowflakeExport`** (background) |
| 8 | **Elasticsearch** (optional) | Keyword search index — fire-and-forget |
| 9 | **Snowflake export** (optional) | Analytical rows for reporting APIs — fire-and-forget |

After step 5, **MongoDB remains the source of truth** for case work. Steps 7–9 are derived copies for graph, search, and BI — failures are logged but do not roll back the completed verdict. See [data_guide_snowflake_analytics.md](data_guide_snowflake_analytics.md).

**Yes — reviews arriving via Kafka are always handled asynchronously by Celery.** The API never blocks on LLM or rule-engine scoring. If Celery is down, reviews stay `pending` until a worker picks them up (or you enable the optional BullMQ fallback — see below).

---

## Celery tasks in this repository

| Task name | Module | Trigger | Purpose |
|-----------|--------|---------|---------|
| **`analyze_review`** | `ai_service/app/tasks.py` | Kafka dispatcher after review create (`POST /reviews`, mailbox ingest, etc.) | **Production email scoring** — rule engine, LLM/agent, merge, Mongo update, stats, Neo4j sync |
| `ping` | `backend/core/tasks.py` | Manual / health demos | Django legacy smoke test |
| `add` | `backend/core/tasks.py` | Django Kafka consumer on topic `ai_tasks` | Demo arithmetic task for the Django `/api/submit` pipeline |

The **email triage product** depends on **`analyze_review` only**. The Django `add` task illustrates the same *enqueue now, process later* pattern but is **not** wired to `/reviews`.

---

## Optional fallback: Node BullMQ worker

When `USE_BULLMQ_ENQUEUE=true`, the Node API can enqueue the same scoring work to a **BullMQ** queue processed by `backend/src/worker/processReviewJob.js`. This duplicates logic in Node for local experiments. **Default Docker Compose uses Kafka + Celery**, not BullMQ.

---

## Legacy Django demo pipeline

`POST /api/submit` (Django) publishes JSON to Kafka topic **`ai_tasks`**. A Django-side consumer forwards messages to Celery task **`add`**. This demonstrates distributed processing but does **not** analyze email reviews. Any HTTP verb (`GET`, `PUT`, …) may enqueue work — see `backend/core/views.py`.

---

## Local dev reset

Development mode includes `POST /dev/reset-local-state` which stops simulation, clears MongoDB reviews, truncates PostgreSQL statistics, flushes Redis, recreates the Kafka ingest topic, and clears Neo4j. Use `POST /dev/prune-graph` to delete orphan graph nodes without wiping campaigns.

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — WSL, repository root unless noted</p>

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml logs -f --tail=50 ai-celery ai-kafka-dispatch
```

</div>
