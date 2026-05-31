# TBD — Production maturity and feature roadmap

This document lists **possible improvements** for the Suspicious Email Triage project, written for teams with **modest budget and equipment** (small team, Docker Compose dev, single-region cloud, managed databases). Items are grouped by theme. Nothing here is a commitment — it is a backlog of sensible next steps.

**Related:** [architecture.md](architecture.md), [production_setup_guide.md](production_setup_guide.md), [implemented_beyond_requirements.md](implemented_beyond_requirements.md).

---

## How to read this list

| Priority hint | Meaning |
|---------------|---------|
| **P0** | Security, data loss, or compliance risk if ignored in real production |
| **P1** | Expected in a mature SaaS / internal product |
| **P2** | Valuable differentiators or efficiency gains when budget allows |

Assumptions: you keep the **Node API + Kafka/Celery + Mongo/Postgres/Neo4j** shape unless a row explicitly suggests replacing a component.

---

## 1. Production operations (P0–P1)

### Secrets and configuration

- **P0:** Move all secrets (`JWT_SECRET`, `NEO4J_PASSWORD`, `GRAPH_INTERNAL_TOKEN`, OAuth client secrets) to a secrets manager (AWS Secrets Manager, Azure Key Vault, HashiCorp Vault) — never plain env files on servers.
- **P0:** Separate **dev / staging / prod** env profiles with automated promotion checks (no `DEBUG=true` in prod).
- **P1:** Config validation on startup (fail fast if required vars missing) — extend patterns from `backend/src/config/runtime.js`.

### Deployment and availability

- **P0:** Health checks and readiness probes for `backend`, `ai-celery`, `ai-kafka-dispatch`, Neo4j, Kafka, Mongo, Postgres.
- **P1:** Run API and workers with **multiple replicas** behind a load balancer; sticky sessions not required (stateless JWT API).
- **P1:** Managed **MongoDB Atlas**, **RDS/Cloud SQL Postgres**, **Neo4j Aura** or self-hosted Neo4j cluster with backups — avoid single Docker volumes in prod.
- **P2:** Blue/green or rolling deploys with migration hooks for Postgres schema and Neo4j index constraints.

### Observability

- **P0:** Structured logs shipped to a central store (OpenSearch, Datadog, CloudWatch) — build on existing JSON log lines in `backend/src/lib/logger.js`.
- **P1:** Metrics: request latency, queue depth, Celery task failures, LLM call latency, Neo4j sync errors (Prometheus + Grafana or vendor APM).
- **P1:** Alerting on failed ingest, DLQ growth (`email.review.ingested.dlq`), and graph sync degradation.
- **P2:** Distributed tracing (OpenTelemetry) across API → Kafka → Celery → LLM.

### Backup and disaster recovery

- **P0:** Automated backups for Mongo reviews, Postgres stats, Neo4j graph, and Kafka retention policy documented.
- **P1:** Restore drills quarterly; RPO/RTO targets written down.

---

## 2. Security and compliance (P0–P1)

- **P0:** HTTPS everywhere; HSTS; secure cookies if moving to cookie-based auth.
- **P0:** Rate limiting on `/auth/login`, `/auth/forgot-password`, and review creation.
- **P0:** Audit log for analyst actions (overrides, admin user changes) in append-only storage — extend override model in Mongo.
- **P1:** SSO (SAML/OIDC) for enterprise customers alongside local auth.
- **P1:** Field-level encryption for sensitive email body storage if regulatory scope requires it.
- **P1:** Periodic dependency scanning (Dependabot, Snyk) and container image scanning in CI.
- **P2:** SOC2-style access reviews for admin roles; data retention policies per tenant.

---

## 3. Email triage product features (P1–P2)

Features users typically expect from **security awareness / phishing triage** software:

- **P1:** **Ingest from mailbox** — Microsoft 365 / Gmail API pull or SMTP inbound relay, not paste-only UI.
- **P1:** **Attachment analysis** — hash lookup (VirusTotal), sandbox hook, block executable types.
- **P1:** **Header authentication display** — SPF/DKIM/DMARC results surfaced in UI (parse `Authentication-Results`).
- **P1:** **Allow/block lists** — tenant domains, VIP impersonation rules.
- **P1:** **Case management** — assign review to analyst, status workflow (open/escalated/closed), comments thread.
- **P1:** **Export** — PDF/CSV report for SOC handoff.
- **P2:** **User-reported phish button** integration (browser extension or mail client add-in).
- **P2:** **Multi-tenant** isolation — org id on every Mongo document and graph node.
- **P2:** **Playbooks** — automated actions (quarantine sender, notify user) after verdict thresholds.

---

## 4. Graph and intelligence (P1–P2)

Building on the current **Neo4j** model ([neo4j_phishing_graph_guide.md](neo4j_phishing_graph_guide.md)):

- **P1:** **STIX/TAXII** export of campaigns and indicators for SIEM/SOAR.
- **P1:** **Enrichment nodes** — VirusTotal, WHOIS, passive DNS as linked nodes with timestamps.
- **P1:** **Graph analytics** — PageRank on domains, community detection for campaign clustering (Neo4j GDS library).
- **P2:** **Time-decay** — expire stale relationships; snapshot graphs for historical reports.
- **P2:** **Cross-tenant threat intel feed** (opt-in anonymized indicators).

---

## 5. LLM and scoring (P1–P2)

See [mock_commercial_llm_guide.md](mock_commercial_llm_guide.md):

- **P1:** **Prompt versioning** — store prompt template id + hash on each analysis result for reproducibility.
- **P1:** **Cost controls** — token budgets per tenant; circuit breaker when LLM provider errors spike.
- **P1:** **Human-in-the-loop feedback** — analyst thumbs up/down feeds fine-tuning or rule tuning.
- **P2:** **Ensemble scoring** — rules + LLM + external API (e.g. commercial phishing API) with weighted merge.
- **P2:** **On-prem LLM** option (Ollama/vLLM) for air-gapped customers.

---

## 6. Frontend and UX (P1–P2)

- **P1:** Accessible graph visualization (keyboard nav, ARIA) — current SVG circle layout is demo-grade.
- **P1:** **Dark mode** and responsive layout polish for SOC floor displays.
- **P1:** **Notification** when long-running analysis completes (WebSocket or SSE instead of polling only).
- **P2:** **Bulk import** of .eml files; drag-and-drop headers parser.

---

## 7. Engineering quality (P1)

Low-cost improvements that pay off in maintainability:

- **P1:** Expand CI to build **all** Docker images (`ai-celery`, `mock-llm`, `neo4j` stack smoke test) — current CI validates django-admin + lint/test scripts.
- **P1:** Contract tests for `/reviews` and `/graph` OpenAPI schema.
- **P1:** Load tests on Kafka ingest path (k6 or Locust) with SLO targets.
- **P1:** Feature flags service instead of env-only toggles for gradual rollout.
- **P2:** Monorepo release versioning and changelog automation.

---

## 8. Budget-conscious stack options

If you must stay on minimal spend:

| Need | Low-cost option |
|------|-----------------|
| Hosting | Single VPS + Docker Compose for staging; one managed DB |
| Kafka | Keep Redpanda single node dev; prod → Redpanda Cloud or Confluent basic |
| Neo4j | Community single instance + nightly backup before Aura |
| LLM | Mock in dev; prod → one commercial model with strict token caps |
| Monitoring | Grafana Cloud free tier + Loki, or self-hosted Prometheus |

---

## Summary

Maturity path in one sentence: **harden secrets and observability (P0), deploy managed data stores and multi-instance workers (P1), then add mailbox ingest, case management, and threat-intel exports (P1–P2)** — while keeping the current modular split (Node API, async Celery, graph sidecar) that already supports independent scaling.

When you pick items to implement, update [implemented_beyond_requirements.md](implemented_beyond_requirements.md) and link new runbooks from [README.md](README.md).
