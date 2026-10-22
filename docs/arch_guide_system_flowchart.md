# End-to-end system flowchart

One-page map of how the **Suspicious Email Triage** monorepo fits together. It lists **every major database**, **dev mocks**, and **staging/prod cloud counterparts**. For narrative detail, see [arch_guide_overview.md](arch_guide_overview.md), [arch_guide_system_comprehensive.md](arch_guide_system_comprehensive.md), and [arch_guide_features_catalog.md](arch_guide_features_catalog.md).

---

## Database and storage inventory

This project uses **several store types**; each has a distinct job. **Phishing graph data is not stored in a column-oriented database** (no Cassandra, ClickHouse, or Bigtable). Campaign relationships live in **Neo4j**, a **labeled property graph database** (nodes + relationships, queried with Cypher).

| Store | Type | What it holds | Used by |
|-------|------|---------------|---------|
| **MongoDB** | Document DB | Canonical `Review` documents, `analysisResult`, overrides, optional `agentTrace` | Node API, Celery |
| **PostgreSQL** | Relational DB | `auth_users`, RBAC, `review_stats_events` (charts), `ingest_clients` (verdict webhook registry) | Node API, Celery, Django admin |
| **Neo4j** | **Graph DB** | Sender, Review, Url, Domain, Campaign nodes and relationships | Node graph APIs; sync from Celery via internal HTTP |
| **Elasticsearch** | Search index | Denormalized review text for keyword search | Node search API; background indexing |
| **Redis** | In-memory | Celery broker/result backend; dev simulation state | Celery, Node dev routes |
| **Redpanda/Kafka** | Event log | `email.review.ingested`, DLQ, `email.review.completed` (verdict fan-out) | Node producer, Python dispatcher |
| **Docker volume `triage-logs`** | Append-only file | `merged.log` NDJSON (central logging, not a query DB) | Node, Python, Go gateway, Django bootstrap |
| **SQLite (Django only)** | Embedded | Django **session** store inside `django-admin` container only — not application data | Django admin UI |
| **Snowflake (or mock)** | Cloud warehouse | Analytical copies of completed reviews | Node export after analysis/override |
| **S3 (or mock-s3)** | Object storage | PostgreSQL logical backup JSON snapshots | Node `POST /ops/backups/run` |

**Optional / alternate paths (not in the main diagram):** legacy **BullMQ** Node worker (`--profile legacy-bullmq`), local **Ollama** LLM if configured, **Prefect/dbt** demo reads PostgreSQL only ([data_guide_prefect_dbt_demo.md](data_guide_prefect_dbt_demo.md)).

Deep dives: [graph_guide_neo4j_phishing.md](graph_guide_neo4j_phishing.md), [stack_guide_staging_production_services.md](stack_guide_staging_production_services.md), [data_guide_dev_mock_services.md](data_guide_dev_mock_services.md).

---

## Viewing on Windows 11

| What works | How |
|------------|-----|
| **Standalone source (recommended)** | Open **`docs/diagrams/system-flow-main.mmd`** in [Mermaid Live Editor](https://mermaid.live). |
| **Staging/prod cloud map** | Open **`docs/diagrams/system-flow-staging-prod.mmd`**. |
| **Graph UI only** | Open **`docs/diagrams/system-flow-graph-ui.mmd`**. |
| **Markdown preview** | **Markdown Preview Mermaid Support** → preview this file. |

Copy **only** the contents of a ` ```mermaid ` block (or a `.mmd` file), not the whole markdown page, into Mermaid Live Editor if preview fails.

---

## Whole-project flow — dev stack (default Docker Compose)

Same diagram as [diagrams/system-flow-main.mmd](diagrams/system-flow-main.mmd).

```mermaid
flowchart TB
  subgraph clients [Clients]
    BROWSER["React UI port 3001<br/>triage analytics graph search logs admin"]
    MAIL["Mail platforms webhooks<br/>production mailbox path"]
  end

  subgraph edge [Ingest edge]
    GW["Go ingest-gateway port 8080<br/>webhooks and dev simulation"]
  end

  subgraph nodeApi [Node API port 3000]
    EXPRESS["Express REST<br/>auth reviews metrics graph search logs ops"]
  end

  subgraph adminOps [Admin and ops]
    DJANGO["Django admin port 8000<br/>user CRUD via PostgreSQL"]
    LOGVOL["Docker volume triage-logs<br/>merged.log NDJSON central logging"]
  end

  subgraph data [Databases and search stores]
    MONGO[(MongoDB document DB<br/>Review documents and agentTrace)]
    PG[(PostgreSQL relational<br/>auth_users stats events ingest_clients)]
    NEO[(Neo4j graph DB<br/>Sender Review Url Domain Campaign)]
    ES[(Elasticsearch<br/>full-text review search index)]
    REDIS[(Redis in-memory<br/>Celery broker dev sim state)]
  end

  subgraph events [Events]
    KAFKA["Redpanda or Kafka<br/>ingest DLQ completed topics"]
  end

  subgraph workers [Python workers]
    DISPATCH["ai-kafka-dispatch"]
    CELERY["ai-celery<br/>rules LLM agent graph ES callbacks"]
  end

  subgraph outbound [Outbound integrations]
    VERDICT["Verdict webhooks poll Kafka<br/>client registry in PostgreSQL"]
    SNOW["Snowflake analytics export<br/>mock-snowflake in dev"]
  end

  subgraph devMocks [Dev mocks replace cloud APIs]
    MOCKSECR["mock-secrets-manager port 4566"]
    MOCKS3["mock-s3 port 4568<br/>Postgres backup objects"]
    MOCKLLM["mock-llm port 8090<br/>OpenAI-compatible scoring"]
    MOCKAGENT["mock-cloud-llm port 8091<br/>Bedrock Vertex shape"]
    MOCKCB["mock-verdict-callback"]
    MAILPIT["Mailpit SMTP capture"]
  end

  subgraph externalId [External identity and email]
    GOOGLE["Google OAuth 2.0"]
    EMAILVENDOR["Gmail API SES or corporate SMTP"]
  end

  BROWSER -->|JWT REST via dev proxy| EXPRESS
  BROWSER -.->|sign-in redirect| GOOGLE
  GOOGLE -.->|OAuth callback| EXPRESS
  MAIL --> GW
  GW -->|internal ingest token| EXPRESS

  EXPRESS --> MONGO
  EXPRESS --> PG
  EXPRESS --> NEO
  EXPRESS --> ES
  EXPRESS --> REDIS
  EXPRESS --> KAFKA
  EXPRESS --> VERDICT
  EXPRESS --> SNOW
  EXPRESS --> LOGVOL
  EXPRESS -->|ops backups PutObject| MOCKS3
  EXPRESS -.->|password reset| MAILPIT
  EXPRESS -.->|staging prod email| EMAILVENDOR

  DJANGO --> PG
  DJANGO --> LOGVOL

  MOCKSECR -.->|GetSecretValue at startup| EXPRESS
  MOCKSECR -.->|secrets bundle| CELERY
  MOCKSECR -.->|secrets bundle| GW

  KAFKA --> DISPATCH
  DISPATCH --> CELERY
  CELERY --> MONGO
  CELERY --> PG
  CELERY --> NEO
  CELERY --> ES
  CELERY --> MOCKLLM
  CELERY --> MOCKAGENT
  CELERY --> VERDICT
  CELERY --> LOGVOL
  CELERY -.->|internal HTTP graph sync| EXPRESS

  GW --> LOGVOL
  VERDICT -.-> MOCKCB
```

**How to read this diagram**

| Arrow | Meaning |
|-------|---------|
| Browser → Node | Primary path: triage, polling, analytics, Neo4j graph API, Elasticsearch search, unified logs, ops backups. |
| Mail → Go gateway → Node | Mailbox ingest and dev simulation share Node internal persist → Kafka pipeline. |
| Node / Celery → Neo4j | **Graph storage** — property graph, not columns or Mongo embeds. |
| Node / Celery → Elasticsearch | Search index separate from Neo4j graph traversals. |
| mock-secrets-manager | In dev, all containers load JWT/DB passwords from gitignored `dev.secrets` via HTTP GetSecretValue shape. |
| mock-s3 | Dev stand-in for **Amazon S3** backup bucket ([ops_guide_s3_backups.md](ops_guide_s3_backups.md)). |
| Verdict / Snowflake | Outbound integrations; registry in PostgreSQL; dev uses mock containers. |

---

## Staging and production — real cloud services

In **dev**, the `devMocks` boxes above replace paid APIs. In **staging/prod**, the same env vars point at real vendors (no code fork). See [stack_guide_staging_production_services.md](stack_guide_staging_production_services.md).

Standalone diagram: [diagrams/system-flow-staging-prod.mmd](diagrams/system-flow-staging-prod.mmd).

```mermaid
flowchart LR
  subgraph app [Same application containers]
    NODE[Node API]
    PY[Python Celery and dispatch]
    GW2[ingest-gateway optional]
  end

  subgraph awsAndVendors [Typical staging prod endpoints]
    SM[AWS Secrets Manager]
    S3[Amazon S3 backups]
    MSK[Amazon MSK or Confluent Kafka]
    RDS[Amazon RDS PostgreSQL]
    ATLAS[MongoDB Atlas]
    ELASTIC[ElastiCache Redis]
    OS[OpenSearch or Elastic Cloud]
    AURA[Neo4j Aura or managed Neo4j]
    SF[Snowflake cloud]
    OAI[OpenAI Azure or Anthropic API]
    BR[Amazon Bedrock Converse]
    VTX[Google Vertex Gemini]
    SES[Amazon SES email]
  end

  NODE --> SM
  NODE --> RDS
  NODE --> ATLAS
  NODE --> OS
  NODE --> AURA
  NODE --> MSK
  NODE --> S3
  NODE --> SF
  PY --> SM
  PY --> RDS
  PY --> ATLAS
  PY --> ELASTIC
  PY --> MSK
  PY --> OAI
  PY --> BR
  PY --> VTX
  NODE -.-> SES
```

---

## Phishing graph UI (where `layoutNodesOnCircle` fits)

Analyst opens **Phishing graph** → Node reads **Neo4j** → JSON nodes/edges → React `GraphView` → `CampaignGraphCanvas` → `layoutNodesOnCircle` → SVG. See [graph_guide_neo4j_phishing.md](graph_guide_neo4j_phishing.md).

Standalone file: [diagrams/system-flow-graph-ui.mmd](diagrams/system-flow-graph-ui.mmd).

```mermaid
flowchart LR
  UI[GraphView tab] -->|GET graph campaigns| API[Node graph routes]
  API --> NEO[(Neo4j)]
  API -->|nodes and edges JSON| CANVAS[CampaignGraphCanvas]
  CANVAS --> LAYOUT["layoutNodesOnCircle<br/>graphLayout.js"]
  LAYOUT --> SVG[SVG pan zoom tooltips]
```

---

## Related diagrams elsewhere

| Document | Focus |
|----------|--------|
| [arch_guide_overview.md](arch_guide_overview.md) | Text main flow + sequence diagram |
| [arch_guide_system_comprehensive.md](arch_guide_system_comprehensive.md) | Use cases UC1–UC4, Python scoring |
| [data_guide_kafka_events.md](data_guide_kafka_events.md) | Topics, DLQ, completed events |
| [data_guide_agent_triage.md](data_guide_agent_triage.md) | Agent FSM + Bedrock/Vertex/mock |
| [data_guide_mailbox_ingest_gateway.md](data_guide_mailbox_ingest_gateway.md) | Go gateway |
| [ops_guide_s3_backups.md](ops_guide_s3_backups.md) | S3 backup flow |

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — confirm API + graph path after stack is up</p>

```bash
cd ~/suspicious-email-triage
curl -sS http://localhost:3000/health/live
curl -sS -H "Authorization: Bearer YOUR_JWT" http://localhost:3000/graph/campaigns | python3 -m json.tool | head
```

</div>
