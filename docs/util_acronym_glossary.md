# Documentation acronym glossary

Plain-language definitions for **acronyms and abbreviations** used across `docs/`. Each entry explains what the term means in general and how it shows up in this project.

**Related:** [docs/README.md](README.md) (documentation index).

---

## Security, identity, and compliance

| Acronym | Meaning |
|---------|---------|
| **JWT** | A signed JSON token returned after login. The React app sends it as `Authorization: Bearer …` on API calls. The Node backend verifies the signature before allowing access. See [auth_guide_rbac.md](auth_guide_rbac.md). |
| **RBAC** | Role-Based Access Control — each user gets roles (analyst, admin, …), and each role grants permission codes such as `reviews.read` or `ingest.clients.write`. |
| **HMAC** | Hash-based Message Authentication Code — a shared secret is used to sign the raw webhook JSON body. Receivers recompute the hash and compare it to header `X-Verdict-Signature` to detect tampering. See [data_guide_verdict_webhooks.md](data_guide_verdict_webhooks.md). |
| **OAuth** | A standard way to sign in through a third party (for example Google) without storing that provider's password in this app. See [auth_guide_google_oauth.md](auth_guide_google_oauth.md). |
| **SAML** | Security Assertion Markup Language — enterprise single sign-on protocol (on the roadmap, not implemented here yet). |
| **SSO** | Single Sign-On — one corporate login gives access to multiple applications. |
| **IdP** | Identity Provider — the system that authenticates users (Okta, Azure AD, Google Workspace, etc.). |
| **MFA** | Multi-Factor Authentication — requires a second proof of identity beyond a password. |
| **TLS** | Transport Layer Security — encrypts HTTP traffic (HTTPS). Required for production verdict webhooks. |
| **mTLS** | Mutual TLS — both the client and the server present certificates (roadmap for hardened ingest edges). |
| **SPF** | Sender Policy Framework — DNS records that list which servers may send email for a domain. |
| **DKIM** | DomainKeys Identified Mail — cryptographic signatures on email headers proving the message was not altered in transit. |
| **DMARC** | Policy that tells receiving servers what to do when SPF or DKIM checks fail, and where to send reports. |
| **BEC** | Business Email Compromise — fraud where attackers impersonate executives or vendors to steal money or credentials. |
| **SOC** | Security Operations Center — team that monitors alerts and triages suspicious email. This product supports SOC-style review queues. |
| **SEG** | Secure Email Gateway — mail filter appliance or cloud service (Proofpoint, Mimecast, etc.) that sits before the inbox. |
| **SIEM** | Security Information and Event Management — centralized platform for searching logs and correlating security events. |

---

## Email and messaging

| Acronym | Meaning |
|---------|---------|
| **SMTP** | Simple Mail Transfer Protocol — how mail servers deliver messages to each other. |
| **IMAP** | Internet Message Access Protocol — how clients read mail stored on a server. |
| **MTA** | Mail Transfer Agent — software that routes email (Postfix, Exchange transport, etc.). |
| **MIME** | Multipurpose Internet Mail Extensions — standard for attachments and content types in email. |
| **EML** | File format that stores a complete email message including headers. |
| **M365** | Microsoft 365 — cloud suite with Exchange, Outlook, and Graph APIs. |
| **Graph** | Microsoft Graph API — REST interface for M365 mail, users, and webhook subscriptions. |

---

## Application architecture

| Acronym | Meaning |
|---------|---------|
| **API** | Application Programming Interface — HTTP endpoints that return or accept JSON. |
| **REST** | Representational State Transfer — style of HTTP APIs used by the Node backend (nouns as paths, verbs as methods). |
| **UI** | User Interface — the React web application (port 3001 in local dev). |
| **SPA** | Single Page Application — the browser loads one HTML shell; React swaps views using hash tabs like `#ingest`. |
| **CRA** | Create React App — build toolchain for the frontend (`react-scripts`). |
| **FSM** | Finite State Machine — explicit stages for agent triage (fetch context → score → finalize). See [data_guide_agent_triage.md](data_guide_agent_triage.md). |
| **NDJSON** | Newline-Delimited JSON — one JSON object per line in unified log file `merged.log`. |
| **ETL** | Extract, Transform, Load — copy data from operational stores (MongoDB) into analytics tables (Snowflake). |
| **DLQ** | Dead Letter Queue — Kafka topic where poison or repeatedly failing messages land for inspection. |

---

## Data stores and infrastructure

| Acronym | Meaning |
|---------|---------|
| **MongoDB** | Document database storing full Review records (body, verdict, delivery audit). |
| **Postgres / PostgreSQL** | Relational database for auth tables, chart statistics, and `ingest_clients` webhook registry. |
| **Redis** | In-memory data store — Celery broker and dev simulation state. |
| **Neo4j** | Graph database linking senders, URLs, domains, and campaigns for phishing analysis. |
| **ES** | Elasticsearch — search index for full-text lookup of past reviews. |
| **S3** | Amazon Simple Storage Service — object storage used for database backups. |
| **AWS** | Amazon Web Services — cloud provider for staging and production deployments. |
| **WSL** | Windows Subsystem for Linux — run Linux tooling on Windows (common dev setup for this repo). |
| **K8s** | Kubernetes — container orchestration; Helm charts live under `deploy/helm/`. |

---

## Async pipeline and AI

| Acronym | Meaning |
|---------|---------|
| **Kafka** | Distributed commit log for events — Redpanda in dev; topic `email.review.ingested` triggers analysis. |
| **Celery** | Python task queue — workers run `analyze_review` after Kafka dispatch. |
| **LLM** | Large Language Model — cloud or mock APIs that score email text (OpenAI-compatible, Bedrock, Vertex). |
| **NLP** | Natural Language Processing — understanding and classifying text (rules plus LLM in this product). |
| **ML** | Machine Learning — models that improve predictions from data; here combined with explicit rules. |
| **AI** | Umbrella term for automated analysis features (rules, LLM, agent FSM). |

---

## Threat intelligence and formats

| Acronym | Meaning |
|---------|---------|
| **VT** | VirusTotal — reputation service for URLs and files (roadmap enrichment). |
| **STIX** | Structured Threat Information Expression — JSON schema for sharing threat indicators. |
| **TAXII** | Protocol for exchanging STIX packages between organizations. |
| **MISP** | Malware Information Sharing Platform — community hub for threat intelligence. |
| **IoC** | Indicator of Compromise — observable sign of attack (malicious domain, hash, IP). |

---

## Analytics and ops

| Acronym | Meaning |
|---------|---------|
| **dbt** | Data build tool — SQL transformations that build analytics tables from raw exports. |
| **OLAP** | Online Analytical Processing — aggregate reporting workloads (Snowflake charts in Admin UI). |
| **Prometheus** | Time-series metrics scraper — counters from Go ingest-gateway and Node middleware. |
| **Grafana** | Dashboard tool commonly paired with Prometheus (not bundled in dev compose). |
| **CI** | Continuous Integration — automated lint and test on every push (GitHub Actions). |
| **CD** | Continuous Delivery/Deployment — automated promotion to staging/prod (partially documented). |
| **QA** | Quality Assurance — manual or automated testing before release. |
| **E2E** | End-to-End test — exercises UI, API, workers, and databases together. |

---

## File formats and web

| Acronym | Meaning |
|---------|---------|
| **JSON** | JavaScript Object Notation — primary format for API bodies and log lines. |
| **YAML** | Human-readable config format (agent workflow policy in `ai_service`). |
| **XML** | Markup format used by some email and cloud APIs. |
| **HTML** | HyperText Markup Language — markup in email bodies (future parsing roadmap). |
| **HTTP** | HyperText Transfer Protocol — foundation of REST APIs and webhooks. |
| **HTTPS** | HTTP secured with TLS — required for production webhook endpoints. |
| **URL** | Web address string (`https://host/path`). |
| **URI** | Uniform Resource Identifier — general identifier; URLs are a subset. |
| **UUID** | Universally Unique Identifier — opaque string ids (MongoDB ObjectIds are similar). |

---

## Business and product

| Acronym | Meaning |
|---------|---------|
| **P0–P2** | Priority labels in [roadmap_tbd.md](roadmap_tbd.md) — P0 is safety-critical, P2 is nice-to-have. |
| **MVP** | Minimum Viable Product — smallest feature set that delivers real user value. |
| **SaaS** | Software as a Service — hosted multi-tenant product model (roadmap §3.6). |
| **B2B** | Business-to-Business — selling to organizations rather than consumers. |

---

## Quick command

```bash
cd ~/suspicious-email-triage
grep -RhoE '\\b[A-Z]{2,6}\\b' docs/*.md | sort -u | head -40
```

Use this to find acronyms missing from the glossary, then add them in a doc PR.
