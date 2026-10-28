# Project technology and services — short introduction

This guide is for anyone new to the repository who wants a **plain-language map** of the programming languages, frameworks, databases, and cloud-style services the product uses, and **why** each one appears. It does not replace deep dives; it orients you before you read [arch_guide_system_comprehensive.md](arch_guide_system_comprehensive.md), [arch_guide_system_flowchart.md](arch_guide_system_flowchart.md), or feature-specific guides.

**Security:** documentation uses placeholders only. Real secrets live in gitignored `backend/dev.secrets` and `backend/.env` — see [ops_guide_secrets_management.md](ops_guide_secrets_management.md).

---

## Programming languages and main runtimes

**JavaScript (Node.js)** powers the primary REST API in `backend/`. Node fits the role because most teams already deploy HTTP services in JavaScript, Mongoose integrates cleanly with MongoDB, and the same language can serve the browser-facing API and optional legacy BullMQ worker. Express keeps routing and middleware explicit without heavy framework magic.

**JavaScript (React)** powers the analyst UI in `frontend/`. React’s component model matches a tabbed security workbench (triage, analytics, graph, search, logs). Create React App provides a dev server with proxy to the API on port 3000 while the UI runs on port 3001.

**Python** powers asynchronous scoring in `ai_service/`. Celery, Kafka consumers, rule engines, and LLM clients are mature in Python, so heavy analysis stays **out of the Node process** and can scale on separate containers without blocking HTTP requests.

**Go** powers the **ingest-gateway** in `ingest-gateway/`. A small compiled binary is a good edge service for mailbox webhooks and dev simulation: fast startup and low memory. **Security boundary:** mail platforms and the internet-facing webhook URL talk only to the gateway on port **8080**, not to the main Node API on **3000**. The gateway normalizes each payload and forwards it to a **single internal** Node route (`POST /ingest/internal/mailbox`) using a shared secret header (`X-Ingest-Internal-Token` loaded from Secrets Manager / `dev.secrets`). Node rejects that route unless the token matches, so random callers cannot create reviews by hitting the API directly. Analyst traffic still uses **JWT** login on Node and `POST /reviews`; ingest traffic never needs user passwords on the edge box. In production you can place the gateway in a DMZ while keeping Node and databases on a private network.

**SQL** appears in PostgreSQL schemas, dbt demo models, and Django admin queries. Relational storage fits auth rows, chart statistics, and ingest-client registry data that benefits from indexes and joins.

---

## Core platforms in the application (not cloud vendors)

| Technology | Role in this project | Why we use it |
|------------|----------------------|---------------|
| **Express** | HTTP API composition in `backend/src/http/createApp.js` | Widely understood, minimal, easy to mount many route modules. |
| **Mongoose / MongoDB** | Canonical `Review` documents | Flexible schema for evolving `analysisResult` and agent traces during R&D. |
| **PostgreSQL** | Auth, RBAC, `review_stats_events`, ingest clients | Compact analytics events and relational auth without scanning full Mongo documents. |
| **Redis** | Celery broker, dev simulation toggle | Fast queue handoff between Kafka dispatcher and workers; simple key-value for dev flags. |
| **Kafka / Redpanda** | `email.review.ingested` and related topics | Durable decoupling: API returns quickly while workers catch up or replay after outages. |
| **Celery** | `analyze_review` background jobs | Standard Python task queue with horizontal worker scaling. |
| **Neo4j** | Phishing graph tab | Native graph queries for campaigns, senders, and URL relationships. |
| **Elasticsearch** | “Search past reviews” tab | Full-text search across subject, body, and metadata with pagination. |
| **Django** | Optional admin UI on port 8000 | Built-in CRUD for operators editing `auth_users` without rebuilding React screens. |
| **Docker Compose** | Local full stack | One command brings up databases, mocks, and app containers for demos and CI-like dev. |

---

## External and vendor services (production) and dev substitutes

In **staging and production**, the same code talks to real vendor APIs configured through AWS Secrets Manager and env profiles (`backend/.env.staging`, `backend/.env.prod`). In **local dev** (`DEPLOYMENT_ENV=dev`), Compose runs **HTTP mocks** on fixed ports so you can exercise the same code paths without cloud billing. Details: [data_guide_dev_mock_services.md](data_guide_dev_mock_services.md), [stack_guide_staging_production_services.md](stack_guide_staging_production_services.md).

| Service | What the product uses it for | Advantage | Dev substitute (Compose) |
|---------|------------------------------|-----------|---------------------------|
| **AWS Secrets Manager** | JWT signing keys, DB passwords, ingest tokens at container start | Central rotation and no secrets in git | `mock-secrets-manager` (:4566) |
| **Amazon S3** | PostgreSQL logical backup objects | Durable, cheap object storage for ops snapshots | `mock-s3` (:4568) |
| **Snowflake** (or warehouse HTTP API) | Analytical copies of completed reviews | OLAP reporting separate from operational MongoDB | `mock-snowflake` (:4567) |
| **OpenAI-compatible LLM API** | Commercial single-shot email scoring | Strong models for ambiguous phishing text | `mock-llm` (:8090) |
| **AWS Bedrock / Google Vertex** | Agent triage multi-step LLM with tools | Managed models with enterprise billing and IAM | `mock-cloud-llm` (:8091) |
| **Google OAuth** | Optional passwordless sign-in | Users authenticate with existing Google accounts | Real Google when configured locally, or disabled |
| **Gmail API / Amazon SES / SMTP** | Password-reset and notification email | Production mail delivery | **Mailpit** (:8025 UI) captures SMTP in dev |
| **Customer mail platform HTTPS** | Inbound mailbox webhooks | SEG products POST suspicious messages to us | **ingest-gateway** + simulation |
| **Customer verdict webhook** | Outbound signed verdict POST | Returns final verdict to the mail platform | `mock-verdict-callback` |
| **Managed Kafka, RDS, OpenSearch, Neo4j Aura, ElastiCache** | Production data plane | Managed uptime, backups, and scaling | Local **mongo**, **postgres**, **redis**, **neo4j**, **redpanda**, **elasticsearch** containers |

**Design pattern:** URLs and provider flags (`SECRETS_PROVIDER`, `LLM_BASE_URL`, `SNOWFLAKE_URL`, …) switch between mocks and real endpoints. Application logic is not forked per environment.

---

## Where to go next

| Goal | Document |
|------|----------|
| End-to-end handbook with file paths | [arch_guide_system_comprehensive.md](arch_guide_system_comprehensive.md) |
| Diagrams of containers and data flow | [arch_guide_system_flowchart.md](arch_guide_system_flowchart.md) |
| Feature list with technologies per feature | [arch_guide_features_catalog.md](arch_guide_features_catalog.md) |
| Build and sign in locally | [stack_guide_build_and_run.md](stack_guide_build_and_run.md) |
| Acronyms (JWT, HMAC, SEG, …) | [util_acronym_glossary.md](util_acronym_glossary.md) |

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — WSL, repository root unless noted</p>

```bash
cd ~/suspicious-email-triage
ls docs/tech_guide_project_stack_intro.md
```

</div>
