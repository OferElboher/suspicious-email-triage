# Features and functions catalog

This document lists **everything the Suspicious Email Triage project implements today** — APIs, workers, UI screens, operations tooling, and developer utilities. Each entry uses the same shape so you can scan by title, read what it does, and see which **technologies** (languages, databases, libraries, patterns) power it.

If you are new to a topic (Kafka, Neo4j, JWT, etc.), follow the linked guides in [docs/README.md](README.md) for step-by-step narratives.

**Related:** [arch_guide_overview.md](arch_guide_overview.md), [arch_guide_system_comprehensive.md](arch_guide_system_comprehensive.md), [roadmap_tbd.md](roadmap_tbd.md), [roadmap_implemented_beyond_requirements.md](roadmap_implemented_beyond_requirements.md).

---

## Authentication and users

- **JWT email/password login**
  - Validates credentials against PostgreSQL `auth_users`, returns a signed bearer token with roles, permissions, and UI theme.
  - Express (Node.js), PostgreSQL, bcrypt, `jsonwebtoken`, REST.

- **JWT middleware and RBAC**
  - Every protected route checks the token and optional permission keys (`reviews.read`, `graph.read`, `metrics.read`, etc.).
  - Express middleware, PostgreSQL role/permission tables, fail-closed pattern.

- **Role and permission seeding**
  - On API startup, ensures roles (`admin`, `analyst`, `manager`, `developer`, `viewer`) and permission mappings exist.
  - Node.js startup hooks, PostgreSQL DDL/DML in `authPg.js`.

- **Bootstrap admin user**
  - Creates the first admin when `auth_users` is empty using bootstrap email/password from secrets bundle.
  - PostgreSQL, env/secrets injection, Docker entrypoint.

- **Google OAuth sign-in**
  - Authorization-code flow with CSRF state; issues JWT and redirects SPA with `?googleToken=`.
  - Google OAuth 2.0, Express, JWT, React AuthContext.

- **Forgot / reset password**
  - Time-limited reset tokens in PostgreSQL; generic API responses to prevent email enumeration.
  - PostgreSQL, crypto hashing, bcrypt, REST.

- **Password reset email delivery**
  - Sends reset links via Mailpit (dev default), Gmail API (OAuth), or external SMTP depending on secrets configuration.
  - nodemailer, Gmail REST API, Mailpit, secrets bundle.

- **User profile and theme preferences**
  - `GET /auth/me` and `GET/PUT /auth/preferences` persist per-user UI theme (17 CSS themes).
  - PostgreSQL, Express, shared theme constants (Node + React).

- **Django admin user CRUD**
  - Separate Django service on port 8000 for creating/editing users and role assignments (SQLite for Django sessions only).
  - Django 5 ORM (unmanaged models), PostgreSQL `triage` DB, bcrypt passwords.

---

## Review ingestion and analyst workflow

- **Create review (`POST /reviews`)**
  - Persists email payload in MongoDB, extracts links, publishes Kafka ingest event, schedules Neo4j + Elasticsearch sync.
  - Express, Mongoose/MongoDB, KafkaJS, side-effect schedulers.

- **Paginated review list**
  - `GET /reviews` with shared page size, optional simulation filter, effective verdict in JSON.
  - MongoDB, shared `REVIEW_PAGE_SIZE` config, React dashboard.

- **Review detail and polling**
  - `GET /reviews/:id` plus React hook polling every 1.5s until `completed` or `failed`.
  - MongoDB, React hooks, REST.

- **Analyst override**
  - `POST /reviews/:id/override` stores manual verdict/action/reason; re-syncs graph and search index.
  - MongoDB audit fields, effective-verdict pattern, Neo4j + ES background sync.

- **Date jump pagination**
  - `GET /reviews/page-for-date` finds the list page containing the first review on a calendar day (UTC).
  - MongoDB date queries, React date picker.

- **Link extraction**
  - Parses `http(s)://` URLs from body text at ingest for rules, graph, and search.
  - Node.js regex utility.

- **Effective verdict resolution**
  - Analyst override wins over automated `analysisResult` for UI, Neo4j, and Elasticsearch.
  - Shared Node + React pure functions.

- **Test ingest shortcut (`POST /test`)**
  - Authenticated minimal review creation for demos and QA.
  - Express, MongoDB, Kafka pipeline.

---

## Async analysis pipeline

- **Kafka review-ingest producer**
  - Publishes `{ reviewId, at }` to `email.review.ingested` with reviewId as partition key.
  - KafkaJS, Redpanda (Kafka-compatible API).

- **Python Kafka dispatcher**
  - Long-lived consumer reads ingest topic and dispatches `analyze_review` Celery tasks.
  - `kafka-python`, Celery, Redis broker.

- **Kafka DLQ routing**
  - Invalid payloads go to dead-letter topic with error metadata for reliability demos.
  - Kafka producer, Python `kafka_patterns/reliability.py`.

- **Celery `analyze_review` task**
  - Loads Mongo review, runs rules + optional LLM, merges results, writes status, records stats, triggers graph sync callback.
  - Celery, Redis, MongoDB, PostgreSQL, HTTP callback to Node.

- **Deterministic rule engine**
  - Heuristics for phishing URLs, credential requests, urgency + links; cannot be weakened by LLM merge.
  - Python + Node mirrored logic.

- **LLM analysis (Ollama / mock commercial / disabled)**
  - Structured JSON verdict from local Ollama, OpenAI-compatible mock server, or stub when `DISABLE_LLM=true`.
  - Python `requests`, Node `fetch`, mock HTTP server on port 8090.

- **Hybrid merge policy**
  - Rules authoritative; LLM cannot downgrade suspicious/phishing to benign.
  - Python `merge.py`, Node worker merge.

- **Legacy BullMQ worker (optional profile)**
  - Node Redis queue consumer for fallback demos (`--profile legacy-bullmq`).
  - BullMQ, IORedis, MongoDB.

- **PostgreSQL statistics events**
  - Narrow `review_stats_events` table for charts — avoids scanning Mongo for analytics.
  - PostgreSQL, Node + Python writers.

---

## Neo4j phishing relationship graph

- **Graph sync on create/override/analysis**
  - Upserts Sender, Review, Url, Domain nodes and relationships; campaign detection after risky verdicts.
  - Neo4j Cypher MERGE, MongoDB, Celery HTTP internal callback.

- **Campaign detection**
  - Groups ≥2 risky reviews sharing a domain into `Campaign` nodes with `PART_OF_CAMPAIGN` edges.
  - Neo4j Cypher, effective verdict filter.

- **Campaign list API**
  - `GET /graph/campaigns` sorted by linked review count.
  - Neo4j read queries, Express, JWT `graph.read`.

- **Campaign subgraph API**
  - `GET /graph/campaign-subgraph?indicator=` returns connected nodes/edges; orphan nodes filtered; edges built from `(a,rel,b)` rows.
  - Neo4j Cypher, `edgesFromRelTripleRows`, `filterConnectedSubgraph`.

- **Review neighborhood API**
  - Bounded-depth subgraph around one review for drill-down.
  - Neo4j variable-length path queries.

- **Internal graph sync route**
  - `POST /graph/internal/sync/:id` with `X-Graph-Internal-Token` (no JWT) for Celery workers.
  - Express mount order, shared secret from secrets bundle.

- **Phishing graph UI**
  - React tab: campaign list, one subgraph at a time, pan/zoom/resize SVG, date jump, orphan-safe display via `hasDisplayableGraph`.
  - React, SVG, custom `graphLayout.js`, REST.

- **Graph dev reset**
  - Clears Neo4j during `POST /dev/reset-local-state`.
  - Neo4j Cypher DETACH DELETE, dev-only routes.

---

## Elasticsearch full-text search

- **Review index and mapping**
  - Idempotent index creation for subject, body, sender, links, verdict, status.
  - Elasticsearch 8, `@elastic/elasticsearch` Node client.

- **Background indexing**
  - Upsert on review create, override, and post-analysis sync.
  - Node async tasks, Elasticsearch bulk/index API.

- **Search API (`GET /search/reviews?q=`)**
  - `multi_match` query across indexed fields; empty query returns recent documents.
  - Elasticsearch, Express, JWT.

- **Search admin panel**
  - React panel for index status and dev-only clear-index action.
  - React, REST, RBAC `dev.reset`.

---

## Snowflake analytics warehouse

- **MongoDB → Snowflake ETL export**
  - Exports completed reviews (verdicts, findings, overrides, processing metrics) to analytical tables after Celery analysis and analyst overrides.
  - Node ETL mappers (`reviewToSnowflakeRow.js`), fire-and-forget scheduler (`snowflakeExport.js`), MongoDB source of truth unchanged.

- **Mock AWS Snowflake service**
  - In-memory HTTP warehouse on port 4567 — no real cloud storage; deterministic mock confidence scores for demos.
  - Node HTTP server (`infra/mock-aws-snowflake`), Docker Compose `mock-snowflake` service.

- **Analytical query APIs**
  - Verdict distribution, phishing trends, override rate, processing stats, model performance — `metrics.read` permission.
  - Express `/analytics/*`, mock aggregate endpoints.

- **Dev operations**
  - Batch backfill (`POST /analytics/snowflake/export-batch`), clear mock tables on `POST /dev/reset-local-state`.
  - RBAC `dev.reset`, developer role.

**Guide:** [data_guide_snowflake_analytics.md](data_guide_snowflake_analytics.md)

---

## Operations, metrics, and logging

- **Health probes (`/health/live`, `/health/ready`, `/health`)**
  - Liveness without I/O; readiness checks Mongo, Postgres, Redis, Neo4j; Docker HEALTHCHECK uses ready endpoint.
  - Express, multi-database ping helpers, Docker Compose.

- **Prometheus metrics (`GET /ops/prometheus`)**
  - In-process counters: HTTP requests, 5xx, reviews created, graph sync failures, uptime.
  - Node metrics registry, Prometheus text exposition format.

- **Alert evaluation (`GET /ops/alerts`)**
  - JSON alerts from readiness + configurable thresholds (`metrics.read` permission).
  - Express, env-tuned thresholds.

- **Analytics charts API**
  - Timeseries and status breakdown from PostgreSQL stats events.
  - PostgreSQL `date_trunc`, Express, React Recharts UI.

- **Central merged logging**
  - JSON-lines `merged.log` shared across containers via Docker volume.
  - Node logger, Python logutil, append-only file I/O.

- **Log search and summary APIs**
  - Keyword/topic/time filter and aggregated counts for SOC-style triage.
  - Node readline, Express, RBAC `logs.read`.

---

## Secrets management

- **Secrets provider abstraction**
  - Loads credentials from file, mock AWS Secrets Manager, or future real AWS based on `SECRETS_PROVIDER`.
  - Node `secretsProvider.js`, Python `secrets_provider.py`, dotenv-style bundles.

- **Mock AWS Secrets Manager service**
  - HTTP `GetSecretValue`-compatible API serving gitignored `*.secrets` files at container start.
  - Node HTTP server, Docker Compose service on port 4566.

- **Committed CI fake secrets**
  - `backend/ci.secrets` with `ci-fake-*` values only — Jest/pytest never touch real credentials.
  - Git guardrails, `SECRETS_PROVIDER=file` in test mode.

- **Rotation runbook**
  - Documented procedures for JWT, Postgres, Neo4j, OAuth, graph internal token without code changes.
  - [ops_guide_secrets_management.md](ops_guide_secrets_management.md).

---

## Developer tools and local stack

- **Docker Compose full stack**
  - MongoDB, PostgreSQL, Redis, Redpanda, Neo4j, Elasticsearch, Mailpit, mock-secrets-manager, backend, django-admin, Celery, dispatcher, mock-LLM.
  - Docker Compose, named volumes, healthchecks.

- **Dev simulation loop**
  - Configurable synthetic review ingest rate for load demos (`/dev/simulation`).
  - Node timer, Redis state, MongoDB `dev_simulation` source tag.

- **Local state reset**
  - Clears Mongo reviews, Postgres stats, Redis, Kafka topics, Neo4j, disables simulation.
  - Multi-store admin route, RBAC `dev.reset`.

- **Setup and configuration scripts**
  - Bootstrap admin email, SMTP/Mailpit, Google OAuth, ensure dev secrets, build images.
  - Bash, Node helper scripts, gitignored `dev.secrets`.

---

## CI, quality, and guardrails

- **GitHub Actions CI**
  - Docker image builds, Django settings validation, lint-all, test-all on push/PR to `main`.
  - GitHub Actions, Docker, Husky hooks.

- **Repo guardrail integration tests**
  - Asserts docs omit private values, auth on routes, secrets layer wired, graph UI controls present.
  - pytest, static file analysis.

- **Unit and integration test suites**
  - Backend Jest, frontend CRA tests, ai_service pytest, optional live-stack integration tests.
  - Jest, React Testing Library, pytest, supertest.

---

## Orchestration demo (Prefect / dbt)

- **Prefect stats health flow**
  - Optional flow counting recent PostgreSQL stats events; degrades gracefully without Prefect installed.
  - Python Prefect decorators (optional), PostgreSQL.

- **dbt daily stats model**
  - SQL view aggregating `review_stats_events` by day for analytics demos.
  - dbt, PostgreSQL, Jinja SQL.

---

## How to keep this catalog accurate

When you add a feature, append a bullet here and link the detailed guide from [docs/README.md](README.md). Prefer **variable names** over secret values in all documentation.

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — WSL, repository root — list all markdown guides linked from the doc index</p>

```bash
cd ~/suspicious-email-triage
grep -E '^- \\[' docs/README.md | head -20
```

</div>
