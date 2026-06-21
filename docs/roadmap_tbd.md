# TBD — Product roadmap, requirements, and budget guide

This document explains **what could be built next**, **why it matters to managers and users**, **what each feature demands technically**, and **whether you can try it for free** (mock/local) or **must pay** (cloud services, licenses, AWS, etc.).

Nothing here is a commitment to build. Use it for planning discussions and prioritization.

**Related:** [arch_guide_overview.md](arch_guide_overview.md), [stack_guide_production.md](stack_guide_production.md), [roadmap_implemented_beyond_requirements.md](roadmap_implemented_beyond_requirements.md).

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

### 1.1 Secrets management (P0) — **implemented (free dev path)**

**User value:** Passwords and API keys are not leaked when a laptop or repo is compromised.

**Exact demand:**

- No production secret in git or plain `.env` on servers.
- Rotation procedure documented for JWT signing key, Neo4j password, OAuth client secret.
- CI uses ephemeral fake secrets only.

**Tech pattern:** AWS Secrets Manager, Azure Key Vault, or HashiCorp Vault; injected at container start.

**Implemented (dev/staging free path):**

- Committed profiles `backend/.env.dev`, `.env.staging`, `.env.prod` — **non-sensitive metadata only**
- Gitignored `backend/dev.secrets`, `staging.secrets`, `prod.secrets` — real credentials
- Committed `backend/ci.secrets` — **fake credentials for CI only**
- Mock AWS Secrets Manager service (`mock-secrets-manager` in Docker Compose, port 4566)
- Secrets-provider abstraction: `backend/src/secrets/secretsProvider.js`, `ai_service/app/secrets_provider.py`
- Container entrypoint: `scripts/docker-entrypoint-with-secrets.sh` + `backend/scripts/preload-secrets.js`
- Rotation runbook: [ops_guide_secrets_management.md](ops_guide_secrets_management.md)

**Remaining (paid / later):** Real AWS Secrets Manager SDK (SigV4), External Secrets Operator in EKS, automatic rotation Lambdas.

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

**Guide:** [ops_guide_health_uptime.md](ops_guide_health_uptime.md)

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
- `GET /logs/search` — keyword/topic/time/**level**/service/**regex** filters (`logs.read` permission)
- `GET /ops/logs/summary` — topic/level counts for dashboards
- React **Search unified logs** panel in Triage workspace (admin / `logs.read`)

**Guides:** [ops_guide_central_logging.md](ops_guide_central_logging.md), [tech_postgresql_dbeaver_auth_logs.md](tech_postgresql_dbeaver_auth_logs.md)

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

**Guide:** [ops_guide_metrics_alerting.md](ops_guide_metrics_alerting.md)

**Remaining (paid / later):** Grafana dashboards, DLQ Kafka alert rules, p95 latency histograms, PagerDuty routing.

---

### 1.6 Review full-text search (Elasticsearch) — **implemented (free dev path)**

**User value:** Analysts search past reviews by keywords in subject, body, sender, or links without writing Mongo queries.

**Exact demand:**

- Index updates when reviews are created, overridden, and after async analysis completes.
- Authenticated search API; admin/developer can clear the dev index.
- Laptop-friendly single-node ES (256 MB heap) in Docker Compose.

**Tech pattern:** Elasticsearch 8 + `@elastic/elasticsearch` Node client; index `triage-reviews`; `multi_match` queries.

**Implemented (dev free path):**

- Docker service `elasticsearch` in `infra/docker/docker-compose.yml` (`ES_JAVA_OPTS=-Xms256m -Xmx256m`)
- Env: `ELASTICSEARCH_ENABLED`, `ELASTICSEARCH_URL`, `ELASTICSEARCH_REVIEWS_INDEX`
- `GET /search/status`, `GET /search/reviews?q=`, `DELETE /search/index`
- Background indexing via `scheduleSearchIndex` (create, override, Celery internal graph sync)
- UI **Search past reviews** panel (keyword + verdict/status/sender/date/regex filters)
- UI **Search index** panel with **Clear search index** for `dev.reset` + admin/developer (`SearchIndexPanel.jsx`)

**Guide:** [search_guide_elasticsearch_reviews.md](search_guide_elasticsearch_reviews.md)

**Remaining (paid / later):** Managed Elastic/OpenSearch cluster, TLS and auth, index lifecycle management, cross-tenant index isolation.

---

### 1.7 Snowflake analytics warehouse — **implemented (free dev path)**

**User value:** SOC managers and data analysts run **trend reports** (phishing volume, verdict mix, override rates, processing latency) over months of reviews without scanning MongoDB documents row-by-row.

**Exact demand:**

- Export completed reviews with AI verdicts, findings, confidence proxy, processing metrics, and analyst overrides.
- Analytical tables optimized for reporting (denormalized OLAP), not transactional email storage.
- Query APIs for verdict distribution, phishing trends, override rate, model performance, processing p95.
- MongoDB remains operational; Snowflake (mock in dev) is the reporting warehouse.

**Tech pattern:** ETL export after Celery completion; HTTP client to mock Snowflake SQL API; tables `REVIEWS_ANALYTICS`, `PROCESSING_METRICS`, `OVERRIDE_EVENTS`.

**Implemented (dev free path):**

- Docker service `mock-snowflake` (`infra/mock-aws-snowflake`, port 4567)
- Env: `SNOWFLAKE_ENABLED`, `SNOWFLAKE_URL`
- Auto-export via `scheduleSnowflakeExport` on graph internal sync and analyst override
- REST: `/analytics/snowflake/status`, `/analytics/verdict-distribution`, `/analytics/phishing-trends`, etc.
- Dev batch export and clear on reset

**Guide:** [data_guide_snowflake_analytics.md](data_guide_snowflake_analytics.md)

**Remaining (paid / later):** Real Snowflake account, Snowpipe streaming ingest, dbt models in cloud, BI tool connectors (Looker, Tableau).

---

### 1.5 Backups and restore (P0) — **partial (dev Docker volumes)**

**User value:** Ransomware or bad deploy does not permanently lose reviews and graph intelligence.

**Exact demand:**

- Daily backup Mongo, Postgres, Neo4j volume; documented restore tested quarterly.
- RPO/RTO written (e.g. RPO 24h, RTO 4h).

**Tech pattern:** `mongodump`, `pg_dump`, Neo4j `neo4j-admin dump`, S3/GCS storage; Docker **named volumes** for dev persistence.

**Implemented (dev free path):**

- `mongo-data`, `postgres-data`, and `neo4j-data` named volumes in `infra/docker/docker-compose.yml` so `docker compose up --build` does **not** wipe review/graph data
- Auth password hashes live in Postgres — **persisted volumes mean rebuild alone does not reset passwords**; dev recovery is implemented via `POST /auth/dev/bootstrap-reset`, sign-in UI **Reset dev bootstrap password**, and `bash scripts/bootstrap-auth-admin.sh --reset-password` (`resetBootstrapAdminForDev` in `authPg.js`)

**Guides:** [stack_guide_build_and_run.md](stack_guide_build_and_run.md), [auth_guide_dev_admin_credentials.md](auth_guide_dev_admin_credentials.md), [auth_guide_dev_auth_recovery.md](auth_guide_dev_auth_recovery.md)

**Remaining (paid / later):** Scheduled cloud backups, restore drills, off-site storage.

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

### 2.2 Audit trail for analyst actions (P0) — **partial (dev path)**

**User value:** Compliance officer proves who changed a verdict and when.

**Exact demand:**

- Every override stores analyst id, timestamp, reason (partially exists in Mongo `override`).
- Immutable append-only export for audits.

**Tech pattern:** Extend Mongo schema; optional WORM storage or SIEM forward.

**Implemented (dev free path):**

- **Override verdict** dropdown + notes in Triage workspace (`POST /reviews/:id/override`)
- **Effective verdict** helper (`backend/src/lib/effectiveVerdict.js`) — override wins over `analysisResult` in Recent reviews, Result panel, and Neo4j graph sync
- Mongo `override` stores `analystEmail`, `timestamp`, `reason`, `verdict`, `recommendedAction`

**Guide:** [graph_test_manual_phishing_identification.md](graph_test_manual_phishing_identification.md) (override + campaign section)

**Remaining (paid / later):** Immutable audit export, SIEM forwarding, compliance dashboards.

---

### 2.3 SSO for enterprise (P1)

**User value:** Employees sign in with company Microsoft/Google account.

**Exact demand:**

- SAML 2.0 or OIDC login; map IdP groups to roles (`analyst`, `admin`).

**Tech pattern:** Passport.js, Auth0, Okta, Azure AD.

**Free path:** **Sign in with Google** already implemented for dev — see [auth_guide_google_oauth.md](auth_guide_google_oauth.md). Full SAML usually needs IdP tenant (often already paid by company).

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

**Status:** Shipped — [graph_guide_neo4j_phishing.md](graph_guide_neo4j_phishing.md), UI tab `#graph`.

**Implemented UX (2026):**

- Graph canvas renders **only when campaigns exist** (fixes overload + “graph visible but no campaigns” confusion).
- Campaigns ordered **largest → smallest** by linked review count.
- **One campaign per view** with Prev/Next controls; **zoom** and **hover tooltips** on nodes/edges.
- API: `GET /graph/campaign-subgraph?indicator=…` (per-campaign Cypher in `graphQueries.js`).

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

**Status:** Shipped — [data_guide_mock_llm.md](data_guide_mock_llm.md).

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

### 6.1 Accessible graph visualization (P1 — partial)

**User value:** Keyboard and screen-reader users can navigate the phishing graph; analysts can pan/zoom/resize dense campaign views.

**Exact demand:** WCAG 2.1 AA for graph tab; focusable nodes; text alternatives.

**Implemented (dev free path):**

- Per-campaign SVG with `role="img"`, native `<title>` on nodes/edges, mouse hover detail box
- **Pan** (drag background), **zoom** toolbar, **resize** (bottom + right edges)
- **First / Last / Prev / Next** campaign navigation; **Jump to date** by Neo4j `updatedAt`
- **Connected subgraph only** — orphan Url/Domain nodes and **secondary disconnected components** filtered (`filterToPrimaryComponent` in `connectedGraphFilter.js`); **duplicate UI ids** collapsed when legacy Neo4j rows share the same email/URL/domain key (`dedupeNodesById`)
- Dev route `POST /dev/prune-graph` **merges** duplicate Sender/Url/Domain Neo4j nodes then **DETACH DELETE**s zero-degree orphans (`graphMaintenance.js`)
- Bootstrap **admin** or **developer** may call dev reset/prune/simulation routes (permission + role gate in `devRoutes.js`)
- **Dev simulation UI (2026):** left-aligned **Start simulation** / **Stop simulation** single-button control; rate persisted in Redis across stop/start — [stack_guide_dev_simulation.md](stack_guide_dev_simulation.md)
- Automated manual test: `bash scripts/run-manual-phishing-campaign-test.sh EMAIL PASSWORD`
- `GET /reviews/page-for-date` for Recent reviews date jump

**Remaining:** Full keyboard traversal of individual SVG nodes (P1).

**Tech pattern:** Plain SVG + React pointer events (no D3); Neo4j driver v5 `startNodeElementId` edge mapping.

**Free path:** Code-only — no paid tools.

**Guide:** [graph_guide_neo4j_phishing.md](graph_guide_neo4j_phishing.md)

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

## 8. Semantic search, LangChain, vector databases, and AI agents (P2)

**User value:** Analysts find **semantically similar** past phishing messages (not just keyword match) and can run a **guided multi-step investigation** (retrieve context → check graph campaign → summarize) without replacing human override audit trails.

**Exact demand (MVP):**

1. When a review reaches `completed`, embed `subject + body` (e.g. `sentence-transformers/all-MiniLM-L6-v2` via Celery).
2. Store `{ reviewId, embedding, verdict }` in a **vector database** (Qdrant or Chroma in Docker — a specialized NoSQL index for approximate nearest-neighbor search).
3. `GET /reviews/:id/similar?k=5` returns Mongo ids + similarity scores.
4. React **Similar reviews** panel links into Recent reviews and Phishing graph.

**Exact demand (agent phase 2):**

- **LangChain** (or LangGraph) orchestrates a tool-calling loop: `search_similar_reviews`, `get_graph_campaign`, `fetch_rule_findings`.
- LLM via existing `mock_commercial` or Ollama; analyst **override** remains the compliance source of truth.

**Tech pattern:**

| Piece | Technology | Meaning |
|-------|------------|---------|
| Embeddings | HuggingFace / OpenAI-compatible API | Fixed-size numeric vector representing text meaning |
| Vector DB | Qdrant, Chroma, Pinecone (prod) | Stores vectors + metadata; fast similarity search |
| Orchestration | LangChain `Embeddings`, `VectorStoreRetriever`, agents | Chains steps and tool calls without bespoke glue code |
| Agents | ReAct / tool-calling pattern | LLM decides which API to call next until task completes |

**Free path:** Qdrant/Chroma Docker container, local embeddings, LangChain OSS, mock LLM — no cloud spend for demos.

**Widen / deepen:** Hybrid vector + Neo4j traversal; embed SOC runbooks; multi-agent supervisor; managed Pinecone/Weaviate in production.

**Security:** Redact secrets before embedding; enforce `reviews.read` RBAC on similar-results API.

**Priority:** P2 — differentiator after core triage, graph, and search are stable.

---

## 9. Wide-column store for immutable audit timeline (P2)

**User value:** Compliance officers query **years** of analyst actions (overrides, logins, exports) by time range and user without scanning Mongo collections or Postgres row-by-row.

**Context — NoSQL types already in this project:**

| Type | Product | Role here |
|------|---------|-----------|
| Document | MongoDB | Full review documents |
| Relational | PostgreSQL | Auth, statistics events |
| Graph | Neo4j | Phishing campaigns |
| Key-value | Redis | Queues, cache |
| Search | Elasticsearch | Review full-text search |
| Analytics warehouse | Snowflake (mock dev) | OLAP reporting export from MongoDB |

**Gap:** **Wide-column / column-family** stores (Apache Cassandra, ScyllaDB) — optimized for append-only, time-partitioned writes at very high volume. Not used yet.

**Exact demand:**

- Append-only **audit events** (`analystEmail`, `action`, `reviewId`, `timestamp`, `payload hash`) written on override, export, login.
- Query API: “all actions for user X between T1 and T2” with predictable latency.
- TTL or compaction policy for dev (30 days) vs prod (years).

**Tech pattern:** Cassandra/Scylla table partitioned by `(org_id, yyyy_mm)` + clustering on `timestamp`; optional Kafka sink from existing event bus.

**Free path:** ScyllaDB or Cassandra single-node Docker; no managed cloud required for POC.

**Paid path:** Managed Astra DB, Amazon Keyspaces — when HA and multi-region retention are required.

**Priority:** P2 — after Mongo/Postgres audit fields prove the workflow ([section 2.2](#22-audit-trail-for-analyst-actions-p0--partial-dev-path)).

---

## Summary for managers

**Already delivered (free to run locally):** async triage pipeline, RBAC, analytics charts, Neo4j phishing graph, Elasticsearch review search (optional), Snowflake analytics export (mock), mock LLM, Mailpit email, Google OAuth options.

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
| **Snowflake (hosted warehouse)** | Per-second compute + storage | Snowflake Enterprise | `mock-snowflake` in-memory Docker |

When planning budget, treat **P0 security and backups** on managed databases as the first paid line item before feature expansion.

---

When you implement an item, document it in [roadmap_implemented_beyond_requirements.md](roadmap_implemented_beyond_requirements.md) and link runbooks from [README.md](README.md).

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — WSL, repository root unless noted</p>

```bash
cd ~/suspicious-email-triage
bash scripts/lint-all.sh
```

</div>

