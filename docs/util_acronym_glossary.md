# Documentation acronym glossary

Short definitions for **acronyms and abbreviations** used across `docs/`. When a term needs more context, follow the linked guide.

**Related:** [docs/README.md](README.md) (documentation index).

---

## Security, identity, and compliance

| Acronym | Meaning |
|---------|---------|
| **JWT** | JSON Web Token — signed bearer token used for analyst login (`Authorization: Bearer …`). See [auth_guide_rbac.md](auth_guide_rbac.md). |
| **RBAC** | Role-Based Access Control — permissions like `reviews.read` attached to roles. |
| **HMAC** | Hash-based Message Authentication Code — shared-secret signature on webhook bodies (`X-Verdict-Signature`). See [data_guide_verdict_webhooks.md](data_guide_verdict_webhooks.md). |
| **OAuth** | Open Authorization — delegated login (e.g. Google Sign-In). See [auth_guide_google_oauth.md](auth_guide_google_oauth.md). |
| **SAML** | Security Assertion Markup Language — enterprise SSO protocol (roadmap). |
| **SSO** | Single Sign-On — one corporate login for many apps. |
| **IdP** | Identity Provider — system that authenticates users (Okta, Azure AD, Google). |
| **MFA** | Multi-Factor Authentication — second factor beyond password. |
| **TLS** | Transport Layer Security — HTTPS encryption in transit. |
| **mTLS** | Mutual TLS — both client and server present certificates. |
| **SPF** | Sender Policy Framework — DNS record listing allowed senders for a domain. |
| **DKIM** | DomainKeys Identified Mail — cryptographic signature on email headers. |
| **DMARC** | Domain-based Message Authentication, Reporting and Conformance — policy for SPF/DKIM failures. |
| **BEC** | Business Email Compromise — fraud targeting wire transfers / executives. |
| **SOC** | Security Operations Center — team monitoring threats and triage queues. |
| **SEG** | Secure Email Gateway — appliance/cloud that filters mail before the inbox (Proofpoint, Mimecast, etc.). |
| **SIEM** | Security Information and Event Management — centralized log search/alerting platform. |

---

## Email and messaging

| Acronym | Meaning |
|---------|---------|
| **SMTP** | Simple Mail Transfer Protocol — sending email between servers. |
| **IMAP** | Internet Message Access Protocol — mailbox access protocol. |
| **MTA** | Mail Transfer Agent — server that routes email (Postfix, Exchange transport). |
| **MIME** | Multipurpose Internet Mail Extensions — attachments and content types in email. |
| **EML** | Email file format storing a full message with headers. |
| **M365** | Microsoft 365 — cloud suite including Exchange/Outlook/Graph. |
| **Graph** | Microsoft Graph API — REST API for M365 mail, users, and subscriptions. |

---

## Application architecture

| Acronym | Meaning |
|---------|---------|
| **API** | Application Programming Interface — HTTP endpoints this product exposes. |
| **REST** | Representational State Transfer — JSON over HTTP style used by the Node backend. |
| **UI** | User Interface — React web app on port 3001 in dev. |
| **SPA** | Single Page Application — React app loaded once; client-side routing/hash tabs. |
| **CRA** | Create React App — toolchain bundling the frontend. |
| **FSM** | Finite State Machine — agent triage orchestration stages. See [data_guide_agent_triage.md](data_guide_agent_triage.md). |
| **NDJSON** | Newline-Delimited JSON — one JSON object per line in `merged.log`. |
| **ETL** | Extract, Transform, Load — moving data to analytics stores (Mongo → Snowflake). |
| **DLQ** | Dead Letter Queue — Kafka topic for poison/unprocessable messages. |

---

## Data stores and infrastructure

| Acronym | Meaning |
|---------|---------|
| **MongoDB** | Document database storing full Review documents. |
| **Postgres / PostgreSQL** | Relational database for auth, stats, ingest client registry. |
| **Redis** | In-memory store — Celery broker and dev simulation state. |
| **Neo4j** | Graph database for phishing campaign relationships. |
| **ES** | Elasticsearch — full-text search index for past reviews. |
| **S3** | Amazon Simple Storage Service — object storage for backups. |
| **AWS** | Amazon Web Services — cloud provider for staging/prod. |
| **WSL** | Windows Subsystem for Linux — run Linux tools on Windows. |
| **K8s** | Kubernetes — container orchestration (Helm charts in `deploy/helm/`). |

---

## Async pipeline and AI

| Acronym | Meaning |
|---------|---------|
| **Kafka** | Distributed event log — Redpanda in dev; topic `email.review.ingested`. |
| **Celery** | Python distributed task queue — runs `analyze_review` workers. |
| **LLM** | Large Language Model — OpenAI/Bedrock/Vertex or dev mocks for scoring. |
| **NLP** | Natural Language Processing — text classification and understanding. |
| **ML** | Machine Learning — statistical models (rules + LLM hybrid here). |
| **AI** | Artificial Intelligence — umbrella term for automated analysis features. |
| **FSM** | See Application architecture (agent workflow). |

---

## Threat intelligence and formats

| Acronym | Meaning |
|---------|---------|
| **VT** | VirusTotal — URL/file reputation service (roadmap enrichment). |
| **STIX** | Structured Threat Information Expression — JSON threat intel format. |
| **TAXII** | Trusted Automated Exchange of Intelligence Information — STIX transport. |
| **MISP** | Malware Information Sharing Platform — threat intel sharing hub. |
| **IoC** | Indicator of Compromise — hash, domain, or URL tied to an attack. |

---

## Analytics and ops

| Acronym | Meaning |
|---------|---------|
| **dbt** | Data build tool — SQL transformations for analytics rollups. |
| **OLAP** | Online Analytical Processing — aggregate reporting (Snowflake). |
| **Prometheus** | Metrics scraper — counters/gauges from Go and Node. |
| **Grafana** | Dashboards for Prometheus metrics (typical pairing). |
| **CI** | Continuous Integration — automated lint/test on push (GitHub Actions). |
| **CD** | Continuous Delivery/Deployment — automated releases (roadmap). |
| **QA** | Quality Assurance — manual or automated testing. |
| **E2E** | End-to-End — full stack test from UI/API through workers. |

---

## File formats and web

| Acronym | Meaning |
|---------|---------|
| **JSON** | JavaScript Object Notation — primary API and log format. |
| **YAML** | YAML Ain't Markup Language — config files (agent workflow policy). |
| **XML** | Extensible Markup Language — used by some AWS/S3 APIs. |
| **HTML** | HyperText Markup Language — email body markup (future parsing). |
| **HTTP** | HyperText Transfer Protocol — web API transport. |
| **HTTPS** | HTTP over TLS — required for production webhooks. |
| **URL** | Uniform Resource Locator — web address. |
| **URI** | Uniform Resource Identifier — broader identifier (includes URLs). |
| **UUID** | Universally Unique Identifier — MongoDB ObjectId-like strings. |

---

## Business and product

| Acronym | Meaning |
|---------|---------|
| **P0–P2** | Priority levels in [roadmap_tbd.md](roadmap_tbd.md) (P0 = critical). |
| **MVP** | Minimum Viable Product — smallest useful feature slice. |
| **SaaS** | Software as a Service — multi-tenant hosted product (roadmap §3.6). |
| **B2B** | Business-to-Business — selling to organizations. |

---

## Quick command

```bash
cd ~/suspicious-email-triage
grep -RhoE '\\b[A-Z]{2,6}\\b' docs/*.md | sort -u | head -40
```

Use this to spot acronyms not yet listed — open a doc PR to extend this glossary.
