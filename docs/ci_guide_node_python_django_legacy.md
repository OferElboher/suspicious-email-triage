# Node.js, React, Python, and Django in this repository

This document exists because the project is a little broader than a single framework. The main browser-facing path is Node.js + React, the async scoring path is Python + Celery, and there is also a Django project tree in `backend/config`, `backend/core`, and `backend/health`.

Rather than treating that as a contradiction, think of it as a repository that can support more than one backend style while the current UI uses the Node API.

## What runs the main product path today

At the time this document was written, the **runtime application** is composed of:

- **Node.js + Express** in `backend/` — HTTP API, persistence orchestration, Kafka ingest producer, logging, metrics, and development simulation loop.
- **React** in `frontend/` — Analyst UI, polling for async results, analytics charts, optional dev simulation controls.
- **Python** in `ai_service/` — Kafka dispatcher process plus Celery workers that perform the heavy “scoring” pipeline and write results back to MongoDB and status statistics to PostgreSQL.

MongoDB stores reviews. PostgreSQL stores chart statistics. Redis is used as a Celery broker. Kafka (Redpanda in local docker) carries “review ingested” events.

## Where Django fits

There is a real Django tree in the repository:

- `backend/config/` — Django project configuration and settings.
- `backend/core/` — Django core app, Kafka helpers, Celery tasks, and tests.
- `backend/health/` — a small Django health app.
- `backend/manage.py` — Django command entrypoint.

The current React UI still talks to the Node/Express API in `backend/src/`. The Django code should therefore be read as a coexisting Python/Django service area and compatibility/migration surface, not as the primary browser-facing API for the current UI.

### Why keep both?

Keeping both paths can be useful during gradual architecture work:

1. Node/Express stays a simple HTTP edge for the React application.
2. Python/Celery keeps heavier scoring work outside the Node process.
3. Django remains available for teams that want Django-style settings, management commands, or Python web endpoints.

## “Combination model” in plain language

Think of the system as **three cooperating programs**:

1. The **website** talks to the **Node API** over HTTP.
2. The **Node API** writes to MongoDB, records a PostgreSQL statistics event, and emits a **Kafka event** saying “new review.”
3. The **Python dispatcher** hears the Kafka event and schedules a **Celery task**.
4. The **Celery worker** reads the MongoDB record, computes results, saves the completed analysis, and records PostgreSQL status statistics.

That is the “combination”: not everything in one process, but a soft polyglot split with clear boundaries. Node handles the current browser-facing ingest path; Python/Celery handles scoring; Django code lives beside those pieces and can be exercised where its settings, commands, or apps are needed.

## Folder map (by technology)

### Node.js (`backend/src/`)

- `backend/src/server.js` — process entry; connects Mongo; starts HTTP listener; hydrates dev simulation loop.
- `backend/src/http/createApp.js` — Express app wiring (routes, middleware).
- `backend/src/api/*` — route modules (reviews, metrics).
- `backend/src/kafka/*` — Kafka producer for ingest events.
- `backend/src/worker/*` — optional BullMQ worker path (legacy/alternate).

### React (`frontend/`)

- `frontend/src/TriageApp.jsx` — main UI shell and navigation.
- `frontend/src/views/*` — larger screens (analytics, simulation panel).

### Python async service (`ai_service/`)

- `ai_service/kafka_dispatcher.py` — consumes Kafka messages and dispatches Celery tasks.
- `ai_service/app/tasks.py` — Celery task implementation for analysis.
- `ai_service/app/*` — supporting modules (Mongo access, rules, optional LLM client).

## Practical guidance for contributors

- If you are implementing a feature, first decide whether it belongs in **HTTP ingestion** (Node), **async scoring** (Python/Celery), **Django service support**, or **presentation** (React).
- If you are fixing CI, keep the checks explicit: Node/React checks should run for the main UI/API path, Python/Celery checks should run for `ai_service`, and Django checks should run only when the Django dependency set is installed.
---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — WSL, repository root unless noted</p>

```bash
cd ~/suspicious-email-triage
bash scripts/lint-all.sh
```

</div>

