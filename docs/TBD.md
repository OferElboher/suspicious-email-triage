# TBD — Product roadmap, requirements, and budget guide

This document explains **what could be built next**, **why it matters to managers and users**, **what each feature demands technically**, and **whether you can try it for free** (mock/local) or **must pay** (cloud services, licenses, AWS, etc.).

Nothing here is a commitment to build. Use it for planning discussions and prioritization.

**Related:** [architecture.md](architecture.md), [production_setup_guide.md](production_setup_guide.md), [implemented_beyond_requirements.md](implemented_beyond_requirements.md).

---

## How to read this document

| Label | Meaning for managers |
|-------|----------------------|
| **User value** | What the analyst, SOC lead, or employee experiences |
| **Exact demand** | Concrete acceptance criteria — what “done” looks like |
| **Tech pattern** | Libraries, services, or architecture used |
| **Free path** | How to demo or pilot **without spending money** (local Docker, mocks, free tiers) |
| **Priority** | P0 = safety/risk, P1 = expected in mature product, P2 = nice differentiator |

At the bottom, features that **cannot** be done for free are listed under **Requires paid infrastructure or licenses**.

---

## 1. Production reliability and operations

### 1.1 Secrets management (P0)

**User value:** Passwords and API keys are not leaked when a laptop or repo is compromised.

**Exact demand:**

- No production secret in git or plain `.env` on servers.
- Rotation procedure documented for JWT signing key, Neo4j password, OAuth client secret.
- CI uses ephemeral fake secrets only.

**Tech pattern:** AWS Secrets Manager, Azure Key Vault, or HashiCorp Vault; injected at container start.

**Free path:** Keep using `backend/.env.dev` locally; use GitHub Actions secrets for staging CI only.

---

### 1.2 Health checks and uptime (P0) — **implemented (free dev path)**

**User value:** The app recovers automatically when a container crashes; load balancers stop sending traffic to broken instances.

**Exact demand:**

- `/health` returns 200 when Mongo + Postgres reachable (optional Neo4j).
- Kubernetes/Docker Compose `healthcheck` blocks traffic until ready.
- Runbook: “API up but graph empty” vs “API down”.

**Tech pattern:** HTTP probes, Docker `HEALTHCHECK`, optional `@godaddy/terminus` graceful shutdown in Node.

**Implemented (dev/staging free path):**

- `GET /health/live` — liveness (process up, no dependency I/O)
- `GET /health/ready` — readiness (Mongo, Postgres, Redis, Neo4j checks)
- `GET /health` — backward-compatible summary
- Docker Compose `healthcheck` on `backend` service (`infra/docker/docker-compose.yml`)
- Kubernetes liveness/readiness probes in Helm chart (`deploy/helm/triage/templates/backend-deployment.yaml`)

**Guide:** [health_checks_and_uptime_guide.md](health_checks_and_uptime_guide.md)

**Remaining (paid / later):** PagerDuty/on-call integration, external uptime monitors (Pingdom, etc.).

---

### 1.3 Central logging and search (P0–P1) — **implemented (free dev path)**

**User value:** SOC lead searches all services in one place (“show failed graph sync last hour”).

**Exact demand:**

- JSON logs from backend, Celery, dispatcher land in one searchable index.
- Retention policy (e.g. 30 days dev, 1 year prod).

**Tech pattern:** OpenSearch, Grafana Loki, Datadog Logs, CloudWatch Logs; ship `merged.log` or stdout.

**Implemented (dev free path):**

- Unified JSON-lines `merged.log` (see logger module)
- `GET /logs/search` — keyword/topic/time filter (`logs.read` permission)
- `GET /ops/logs/summary` — topic/level counts for dashboards

**Guides:** [central_logging_guide.md](central_logging_guide.md), [dbeaver_auth_tables_and_unified_log_viewing.md](dbeaver_auth_tables_and_unified_log_viewing.md)

**Remaining (paid / later):** OpenSearch/Loki cluster, retention policies in cloud, log shipping sidecars in K8s.

---

### 1.4 Metrics and alerting (P1) — **implemented (free dev path)**

**User value:** Team gets paged when queue backlog grows or LLM errors spike.

**Exact demand:**

- Dashboards: reviews/min, Celery failure rate, p95 API latency, Neo4j sync errors.
- Alert when DLQ topic `email.review.ingested.dlq` receives messages.

**Tech pattern:** Prometheus + Grafana, or Datadog/New Relic APM.

**Implemented (dev free path):**

- In-process counters (`backend/src/lib/appMetrics.js`) — HTTP requests, 5xx, reviews created, graph sync failures
- `GET /ops/prometheus` — Prometheus text scrape (no auth, standard pattern)
- `GET /ops/alerts` — JSON alert evaluation from readiness + thresholds (`metrics.read`)
- Env tuning: `ALERT_MAX_GRAPH_SYNC_FAILURES`, `ALERT_MAX_HTTP_ERRORS`

**Guide:** [metrics_and_alerting_guide.md](metrics_and_alerting_guide.md)

**Remaining (paid / later):** Grafana dashboards, DLQ Kafka alert rules, p95 latency histograms, PagerDuty routing.

---

### 1.5 Backups and restore (P0)

**User value:** Ransomware or bad deploy does not permanently lose reviews and graph intelligence.

**Exact demand:**

- Daily backup Mongo, Postgres, Neo4j volume; documented restore tested quarterly.
- RPO/RTO written (e.g. RPO 24h, RTO 4h).

**Tech pattern:** `mongodump`, `pg_dump`, Neo4j `neo4j-admin dump`, S3/GCS storage.

**Free path:** Manual dump scripts on WSL cron to a local folder — sufficient for dev/staging pilots.

---

## 2. Security and compliance

### 2.1 HTTPS and rate limiting (P0)

**User value:** Credentials encrypted in transit; brute-force login slowed.

**Exact demand:**

- TLS on all public endpoints.
- Rate limit `/auth/login` and `/auth/forgot-password` (e.g. 10/min/IP).

**Tech pattern:** Reverse proxy (nginx, Caddy, AWS ALB), `express-rate-limit`.

**Free path:** Local HTTP OK for dev; use **Caddy** with automatic TLS on a cheap VPS for staging.

---

### 2.2 Audit trail for analyst actions (P0)

**User value:** Compliance officer proves who changed a verdict and when.

**Exact demand:**

- Every override stores analyst id, timestamp, reason (partially exists in Mongo `override`).
- Immutable append-only export for audits.

**Tech pattern:** Extend Mongo schema; optional WORM storage or SIEM forward.

**Free path:** Current override fields + Postgres/Mongo queries — no extra vendor.

---

### 2.3 SSO for enterprise (P1)

**User value:** Employees sign in with company Microsoft/Google account.

**Exact demand:**

- SAML 2.0 or OIDC login; map IdP groups to roles (`analyst`, `admin`).

**Tech pattern:** Passport.js, Auth0, Okta, Azure AD.

**Free path:** **Sign in with Google** already implemented for dev — see [google_oauth_email_and_signin.md](google_oauth_email_and_signin.md). Full SAML usually needs IdP tenant (often already paid by company).

---

## 3. Email triage product features

### 3.1 Mailbox ingest (P1)

**User value:** Analysts stop copy-pasting emails; system pulls from shared mailbox automatically.

**Exact demand:**

- Connect Microsoft 365 or Gmail shared mailbox.
- New messages create `Review` documents with headers preserved.
- Duplicate detection by Message-ID.

**Tech pattern:** Microsoft Graph API, Gmail API, or SMTP inbound (Postfix → webhook).

**Free path:** Continue paste-in UI for dev; Gmail API free quota for small pilot (Google Cloud project, no App Password if OAuth).

---

### 3.2 Attachment analysis (P1)

**User value:** Malware in attachments flagged before analyst opens them.

**Exact demand:**

- Extract attachments from .eml; hash SHA256; block `.exe`, `.js`, `.vbs` by policy.
- Optional sandbox queue for unknown types.

**Tech pattern:** `mailparser`, ClamAV (self-hosted), VirusTotal API.

**Free path:** **ClamAV in Docker** (open source); rule-based block list — no VirusTotal API key required for basic demo.

---

### 3.3 SPF / DKIM / DMARC display (P1)

**User value:** Analyst sees at a glance if the sender domain authenticated.

**Exact demand:**

- Parse `Authentication-Results` and `Received-SPF` headers.
- Show pass/fail/neutral badges in triage UI.

**Tech pattern:** Header parsing in Node; optional DNS lookups for DMARC record.

**Free path:** Parse headers from pasted email text — no external API.

---

### 3.4 Case management workflow (P1)

**User value:** Team assigns reviews, tracks status, discusses in comments.

**Exact demand:**

- States: `open`, `investigating`, `escalated`, `closed`.
- Assignee field; comment thread per review; filter dashboard by assignee.

**Tech pattern:** Mongo schema extension; optional Postgres for audit events.

**Free path:** Full implementation possible on existing Mongo/Postgres — **no paid service required**.

---

### 3.5 Export for SOC handoff (P1)

**User value:** One-click PDF/CSV for ticketing system or management.

**Exact demand:**

- Export includes verdict, findings, links, graph campaign id, analyst overrides.

**Tech pattern:** PDFKit / puppeteer, CSV from Mongo query.

**Free path:** CSV export only first — pure code, no license.

---

### 3.6 Multi-tenant SaaS (P2)

**User value:** One deployment serves many customer organizations with isolated data.

**Exact demand:**

- `orgId` on all Mongo documents and Neo4j nodes; JWT includes org; queries always filter by org.

**Tech pattern:** Row-level isolation, separate Neo4j graphs or property-level tenant id.

**Free path:** Single-tenant dev stack unchanged; implement tenant id in code without new vendors.

---

## 4. Graph and threat intelligence

### 4.1 Campaign graph (implemented)

**User value:** See related phishing emails sharing domains/URLs.

**Status:** Shipped — [neo4j_phishing_graph_guide.md](neo4j_phishing_graph_guide.md), UI tab `#graph`.

**Free path:** Neo4j Community in Docker — **already free**.

---

### 4.2 STIX/TAXII export (P1)

**User value:** Indicators feed Splunk, Sentinel, or MISP automatically.

**Exact demand:**

- Export Campaign + Domain nodes as STIX 2.1 bundle.
- Optional TAXII server endpoint for subscribers.

**Tech pattern:** STIX Python library, TAXII 2.1 server.

**Free path:** Generate STIX JSON file download — no hosting cost.

---

### 4.3 Threat enrichment (VirusTotal, WHOIS) (P1)

**User value:** Graph shows “this domain was seen in VT as malicious.”

**Exact demand:**

- On new domain node, async enrichment job; store result as linked node or properties.

**Tech pattern:** Celery task + external REST APIs.

**Free path:** **Mock enrichment** in dev (hard-coded JSON); VT free tier has strict daily limits.

---

### 4.4 Graph analytics (PageRank, communities) (P2)

**User value:** Automatically rank “most dangerous” domains in a campaign wave.

**Exact demand:**

- Run GDS algorithms on Neo4j; surface top 10 domains in UI.

**Tech pattern:** Neo4j Graph Data Science library.

**Free path:** GDS free on Community for small graphs locally; large prod graphs may need **Neo4j AuraDS (paid)**.

---

## 5. LLM and scoring

### 5.1 Mock commercial LLM (implemented)

**User value:** Demo OpenAI-shaped integration at zero API cost.

**Status:** Shipped — [mock_commercial_llm_guide.md](mock_commercial_llm_guide.md).

**Free path:** **Already free** (`mock-llm` container).

---

### 5.2 Production commercial LLM (P1)

**User value:** Higher accuracy than rules-only or local Ollama.

**Exact demand:**

- Configurable provider; token/cost caps; store model id on each result.

**Tech pattern:** OpenAI/Anthropic API; existing `llm_client.py` factory.

**Free path:** Not for production volume — use mock in dev/CI; small OpenAI free trial credits only for demos.

---

### 5.3 Analyst feedback loop (P1)

**User value:** Model improves from thumbs up/down on verdicts.

**Exact demand:**

- UI buttons on completed review; store feedback; export dataset for tuning.

**Tech pattern:** Mongo collection; optional fine-tuning pipeline.

**Free path:** Store feedback in Mongo — no ML vendor until you choose to fine-tune (paid GPU or API).

---

## 6. Frontend and UX

### 6.1 Accessible graph visualization (P1)

**User value:** Keyboard and screen-reader users can navigate the phishing graph.

**Exact demand:** WCAG 2.1 AA for graph tab; focusable nodes; text alternatives.

**Tech pattern:** Improved SVG + ARIA, or library like vis-network.

**Free path:** Code-only — no paid tools.

---

### 6.2 Real-time completion notifications (P1)

**User value:** Analyst notified when long analysis finishes without polling.

**Exact demand:** WebSocket or SSE push when review status → `completed`.

**Tech pattern:** Socket.io, SSE endpoint, or Redis pub/sub.

**Free path:** SSE from Node — no third-party service.

---

## 7. Engineering quality

### 7.1 CI builds all images (P1)

**Exact demand:** GitHub Actions builds `backend`, `django-admin`, `ai-celery`, fails on Dockerfile break.

**Free path:** GitHub Actions free minutes for public/small private repos.

**Status:** CI runs lint/test + django settings + backend build — extend to ai-celery image.

---

### 7.2 Contract / load tests (P1–P2)

**Exact demand:** OpenAPI schema tests; k6 load test on `POST /reviews`.

**Free path:** k6 open source locally.

---

## Summary for managers

**Already delivered (free to run locally):** async triage pipeline, RBAC, analytics charts, Neo4j phishing graph, mock LLM, Mailpit email, Google OAuth options.

**Next low-cost wins (mostly code, no new vendors):** audit trail polish, case management, CSV export, SPF/DKIM display, CI hardening.

**Needs budget conversation:** managed Mongo/Postgres/Neo4j in cloud, 24/7 monitoring SaaS, commercial LLM at scale, VirusTotal enterprise, multi-region HA, SAML enterprise IdP.

---

## Requires paid infrastructure or licenses

These items **cannot** be fully replicated in production **for free** (mock/local only gets you a demo, not real prod):

| Feature / need | Why it costs money | Typical paid option | Free demo substitute |
|----------------|-------------------|---------------------|----------------------|
| **Managed MongoDB (Atlas M10+)** | HA, backups, support | MongoDB Atlas | Local `mongo` container |
| **Managed PostgreSQL (RDS, Cloud SQL)** | HA, automated backup | AWS RDS, Azure Database | Local `postgres` container |
| **Neo4j Aura (hosted)** | Ops-free graph DB, scaling | Neo4j AuraDB | Neo4j Community Docker |
| **Neo4j GDS at large scale** | Memory/license for big graphs | AuraDS / Enterprise | GDS on small local graph |
| **Commercial LLM at volume** | Per-token API pricing | OpenAI, Anthropic, Azure OpenAI | `mock-llm` or Ollama local |
| **VirusTotal intelligence (high volume)** | API rate limits on free tier | VT Enterprise | Mock JSON enrichment |
| **Email sandbox (detonation)** | Malware execution environment | Any.Run, Joe Sandbox, CAPE | Block executables by extension only |
| **Microsoft 365 / Gmail enterprise ingest** | Often requires paid tenant + admin consent | M365 E3+, Google Workspace | Paste email in UI |
| **SSO SAML (enterprise IdP)** | Company IdP contract | Okta, Azure AD P1 | Google OAuth dev login |
| **24/7 on-call monitoring SaaS** | Paging + retention | PagerDuty, Datadog APM | Local Grafana + manual checks |
| **Multi-AZ Kubernetes cluster** | Control plane + nodes | EKS, GKE, AKS | Single VPS Docker Compose |
| **Kafka managed (Confluent Cloud)** | Throughput + SLA | Confluent, Redpanda Cloud | Local Redpanda container |
| **WAF + DDoS protection** | Edge security | Cloudflare Pro, AWS WAF | None in local dev |
| **SOC2 audit tooling** | Compliance platform | Vanta, Drata | Spreadsheet + policies (manual) |
| **SMS / voice MFA** | Per-message fees | Twilio | Email-only reset (Mailpit dev) |

When planning budget, treat **P0 security and backups** on managed databases as the first paid line item before feature expansion.

---

When you implement an item, document it in [implemented_beyond_requirements.md](implemented_beyond_requirements.md) and link runbooks from [README.md](README.md).
