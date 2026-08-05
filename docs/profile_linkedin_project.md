# LinkedIn — Suspicious Email Triage Platform (project description)

Copy the text below into your LinkedIn **Projects** or **Experience** section.

---

## Suspicious Email Triage Platform

Full-stack SOC-style application for ingesting suspicious emails, running async AI/rule analysis, and giving analysts a review queue, graph, search, and live operational dashboards.

• **End-to-end flow:** ingest → Redpanda (Kafka) event → Celery workers (rules + optional LLM/agent FSM) → analyst review & override → outbound HMAC verdict webhooks to mail platforms → Neo4j campaign graph + Elasticsearch search + PostgreSQL analytics; React UI polls status until complete

• **Stack:** React (SPA, hash routing, Recharts, SVG gauges) · Node.js / Express (REST API, JWT/RBAC) · Go ingest-gateway (goroutines, Prometheus, distroless Docker) · Python (Celery, Kafka consumer) · Django (admin user CRUD) · MongoDB · PostgreSQL · Redis · Neo4j · Elasticsearch · Docker Compose

• **Mailbox ingest & verdict return:** Extended the platform with a Go **ingest-gateway** microservice that accepts webhook-style email payloads and feeds the existing Kafka → Celery → LLM agent pipeline. Built a live **#ingest** React dashboard with Recharts metrics, configurable dev simulation, and **per-platform verdict webhook registration** (Postgres `ingest_clients`, self-service `PUT /ingest/register/:clientId`, JWT admin UI form, mock receiver on :4569)

• **Integrations — dev:** mock LLM · mock Snowflake · mock AWS Secrets Manager · mock S3 · mock verdict callback · Mailpit

• **Integrations — staging/prod path:** AWS Secrets Manager · OpenAI-compatible LLM APIs · Snowflake · Amazon SES · S3 backups · OpenSearch · Helm/Kubernetes (documented)

• **Highlights:** JWT/RBAC · Google OAuth · forgot/reset password (Mailpit dev / SES prod) · live flow dashboard (gauges/clocks) · phishing graph · ES search with pagination · dev simulation · merged logging + log search API · Prometheus-style metrics & health probes · Prefect/dbt demo · per-tenant ingest client registry · 40+ linked docs in `/docs`

• **Engineering:** ESLint · Jest/pytest · pre-push git hooks · integration guardrails · dev/staging/prod env profiles · GitHub Actions CI/CD · S3 backup ops API

• **Repo:** https://github.com/OferElboher/suspicious-email-triage

---

**Related docs:** [data_guide_verdict_webhooks.md](data_guide_verdict_webhooks.md) · [data_guide_mailbox_ingest_gateway.md](data_guide_mailbox_ingest_gateway.md)
