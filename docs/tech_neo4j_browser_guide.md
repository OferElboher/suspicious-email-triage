# Neo4j Browser — technology guide

**Neo4j Browser** is the web UI shipped with Neo4j. You type **Cypher** queries and inspect nodes and relationships as a graph picture, a table, or plain text. This document is for developers who have never used Neo4j before.

**Technology:** [Neo4j](https://neo4j.com/) graph database, **Bolt** protocol (port **7687**), **Cypher** query language.

**Functional context (why this project uses a graph):** [graph_guide_neo4j_phishing.md](graph_guide_neo4j_phishing.md)

**Install & Docker on WSL:** [tech_neo4j_setup_wsl_windows.md](tech_neo4j_setup_wsl_windows.md)

**Hands-on demo (submit reviews, campaigns):** [graph_demo_neo4j_phishing.md](graph_demo_neo4j_phishing.md)

---

## Open Browser {#open-browser}

Neo4j runs in Docker for this project — you do not install Browser separately.

1. Start the `neo4j` service (see [tech_neo4j_setup_wsl_windows.md — Docker](tech_neo4j_setup_wsl_windows.md)).
2. On **Windows 11**, open Edge, Chrome, or Firefox.
3. Navigate to **http://localhost:7474/browser/** (the root `http://localhost:7474` may redirect here).

Port **7474** is published from the `triage-neo4j` container to your machine.

---

## Log in (credentials from env, never from docs) {#login}

Browser asks for **connection URI**, **username**, and **password**.

| Field | What to enter |
|-------|----------------|
| Connect URL / URI | `bolt://localhost:7687` (Bolt from your PC into Docker — **not** `http://`) |
| Username | **`NEO4J_USER`** from your local `backend/.env.dev` (template uses `neo4j`) |
| Password | **`NEO4J_PASSWORD`** from the same file — read on your machine only |

If login fails: confirm `docker compose ps neo4j` shows **Up**, wait 20–30 seconds on first boot, and verify you copied values from **your** env file.

---

## Navigation basics {#navigation}

| UI area | Purpose |
|---------|---------|
| **Editor** | Type Cypher; **Ctrl+Enter** (Windows) or **Run** ▶ |
| **Graph** view | Nodes (circles) and relationships (arrows) |
| **Table** view | Rows/columns — good for IDs and counts |
| **Text** view | Raw values when the graph is crowded |
| **Database info** (sidebar) | Labels and relationship types present in the DB |
| **:help** | Built-in Browser cheatsheet |

---

## First query {#first-query}

```cypher
RETURN 1 AS ok
```

**Expected:** one row, `ok = 1`.

---

## Example queries for this project {#example-queries}

**Count nodes by label:**

```cypher
MATCH (n)
RETURN labels(n) AS label, count(*) AS cnt
ORDER BY cnt DESC
```

**List campaigns** (same logic as backend campaign detection):

```cypher
MATCH (c:Campaign)<-[:PART_OF_CAMPAIGN]-(r:Review)
RETURN c.indicator AS campaign, collect(r.id) AS reviewIds, c.reviewCount AS count
```

**Sender → review → URL → domain:**

```cypher
MATCH (s:Sender)-[:SENT]->(r:Review)-[:CONTAINS_URL]->(u:Url)-[:RESOLVES_TO]->(d:Domain)
RETURN s.email AS sender, r.id AS reviewId, u.href AS url, d.host AS domain
LIMIT 25
```

**Small subgraph for graph view:**

```cypher
MATCH (n)-[r]->(m)
RETURN n, r, m
LIMIT 50
```

**One review by Mongo id** (paste id from triage UI):

```cypher
MATCH (r:Review {id: "PASTE_MONGO_REVIEW_ID_HERE"})
OPTIONAL MATCH (r)-[rel]-(neighbor)
RETURN r, rel, neighbor
LIMIT 100
```

---

## Reading results {#reading-results}

| You see | Meaning |
|---------|---------|
| `(:Review {id: "..."})` | Review node; `id` is the MongoDB string |
| `[:SENT]`, `[:CONTAINS_URL]` | Relationship types from the [graph data model](graph_guide_neo4j_phishing.md#data-model-implemented-pattern) |
| `(:Campaign {indicator: "host.example"})` | Shared domain / campaign cluster |
| Empty result | Graph empty, sync not run, or `NEO4J_ENABLED=false` — submit reviews and wait for `completed` |

---

## Common mistakes {#common-mistakes}

| Mistake | Fix |
|---------|-----|
| Bolt URI set to `http://localhost:7474` | Use **`bolt://localhost:7687`** |
| Query before Celery finishes | Wait for review `completed` and graph sync |
| No `LIMIT` on exploratory queries | Add `LIMIT 25` or `LIMIT 50` |
| Password copied from documentation | Use **`backend/.env.dev`** on your machine |

---

## REST API alternative {#rest-api}

JWT routes (`GET /graph/campaigns`, `GET /graph/visualization`) return JSON from the same graph. Browser is best for **ad hoc Cypher**; the React **Phishing graph** tab is best for live demos.

**Tests:** [stack_guide_running_tests.md](stack_guide_running_tests.md), [graph_demo_neo4j_phishing.md — verify campaigns](graph_demo_neo4j_phishing.md#verify-campaign-detection-with-automated-tests).
