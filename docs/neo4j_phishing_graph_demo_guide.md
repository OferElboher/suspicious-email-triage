# Demo guide — Neo4j phishing graph capabilities

This walkthrough shows how to **try and demo** the Neo4j features in this project: relationship modeling, shared-indicator **campaigns**, the React **Phishing graph** tab, REST APIs, and direct Cypher in Neo4j Browser.

**Audience:** developers new to graph databases who already have WSL + Docker working.

**Setup first:** [neo4j_wsl_windows_setup_guide.md](neo4j_wsl_windows_setup_guide.md)  
**Concepts & code map:** [neo4j_phishing_graph_guide.md](neo4j_phishing_graph_guide.md)

---

## What you will demonstrate

| Capability | Where you see it |
|------------|------------------|
| Sender → Review → URL → Domain relationships | Phishing graph tab, Neo4j Browser |
| Campaign when two+ risky reviews share a domain | Campaign list in UI, `GET /graph/campaigns` |
| Graph updates after async analysis | Submit review → wait for `completed` → refresh graph |
| Analyst-facing visualization | React `#graph` view (SVG nodes and edges) |

---

## Part 1 — Start the stack

From WSL at the repository root:

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d neo4j backend ai-celery ai-kafka-dispatch mock-llm
```

Optional — enable LLM scoring so verdicts populate faster (uses mock API, zero cost):

```bash
# In gitignored backend/.env (create if needed):
# DISABLE_LLM=false
# LLM_PROVIDER=mock_commercial
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --force-recreate ai-celery
```

Start the React UI (if not already running) per [windows_dev_startup_run_guide.md](windows_dev_startup_run_guide.md).

Sign in with a user that has **`graph.read`** (default admin/analyst roles).

---

## Part 2 — Seed two related “phishing” reviews

Campaign detection needs **at least two completed reviews** with verdict **`suspicious`** or **`likely_phishing`** that share the **same URL domain**.

### Review A

In **Triage workspace**, submit:

| Field | Example value |
|-------|----------------|
| Sender email | `attacker-a@fake-mail.test` |
| Subject | `Urgent: verify your account` |
| Body | `Please verify immediately: https://secure-login.example-phish.test/reset` |

Wait until **Status: completed** and note a verdict (mock LLM often returns `likely_phishing` when the body mentions “password” or “verify”).

### Review B

Submit a second review:

| Field | Example value |
|-------|----------------|
| Sender email | `attacker-b@other-domain.test` |
| Subject | `Your account will be locked` |
| Body | `Click here: https://secure-login.example-phish.test/update` |

**Important:** the hostname `secure-login.example-phish.test` is **the same** as in Review A — that shared domain becomes the campaign **indicator**.

Wait for **completed** on both.

---

## Part 3 — Phishing graph tab (React UI)

1. Click **Phishing graph** in the header (URL hash `#graph`).
2. Click **Refresh**.

**Expected:**

- **Nodes** colored by type (Sender, Review, Url, Domain, Campaign).
- **Edges** connecting senders to reviews, reviews to URLs, URLs to domains.
- **Detected campaigns** panel listing `secure-login.example-phish.test` (or your shared hostname) with **2 linked reviews**.

If the graph is empty:

- Confirm `neo4j` and `backend` containers are running.
- Confirm reviews reached `completed` (Celery re-syncs the graph after analysis).
- Click **Refresh** again after 10–20 seconds.

---

## Part 4 — Neo4j Browser (direct graph inspection)

1. On Windows, open **http://localhost:7474**.
2. Connect with credentials from **your local** `backend/.env.dev` (`NEO4J_USER`, `NEO4J_PASSWORD`) — see [neo4j_wsl_windows_setup_guide.md](neo4j_wsl_windows_setup_guide.md).

Run:

```cypher
MATCH (c:Campaign)<-[:PART_OF_CAMPAIGN]-(r:Review)
RETURN c.indicator AS campaign, collect(r.id) AS reviewIds, c.reviewCount AS count
```

**Expected:** one campaign row with two review Mongo IDs.

Explore the full neighborhood:

```cypher
MATCH (s:Sender)-[:SENT]->(r:Review)-[:CONTAINS_URL]->(u:Url)-[:RESOLVES_TO]->(d:Domain)
RETURN s, r, u, d
LIMIT 25
```

---

## Part 5 — REST API demo (optional)

Graph routes require a **JWT** from user login — not `GRAPH_INTERNAL_TOKEN` (that is only for Celery → `/graph/internal/sync`).

### Option A — helper script (recommended)

```bash
bash scripts/curl-graph-api.sh YOUR_EMAIL@example.com YOUR_PASSWORD
bash scripts/curl-graph-api.sh YOUR_EMAIL@example.com YOUR_PASSWORD /graph/campaigns
bash scripts/curl-graph-api.sh YOUR_EMAIL@example.com YOUR_PASSWORD /graph/visualization
```

Uses **`http://localhost:3000`** (Node API). Do not curl **`http://localhost:3001`** — that is the React dev server and returns HTML.

### Option B — manual curl

**Login** (get JWT):

```bash
curl -sS -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"YOUR_EMAIL@example.com","password":"YOUR_PASSWORD"}'
```

Copy `"token"` from the response, then:

### Graph status

```bash
curl -s -H "Authorization: Bearer YOUR_JWT" \
  http://localhost:3000/graph/status | python3 -m json.tool
```

### List campaigns

```bash
curl -s -H "Authorization: Bearer YOUR_JWT" \
  http://localhost:3000/graph/campaigns | python3 -m json.tool
```

### Visualization payload (same data as the React SVG)

```bash
curl -s -H "Authorization: Bearer YOUR_JWT" \
  http://localhost:3000/graph/visualization | python3 -m json.tool
```

### Neighborhood for one review

Use a review `_id` from the UI or MongoDB:

```bash
curl -s -H "Authorization: Bearer YOUR_JWT" \
  "http://localhost:3000/graph/review/REVIEW_MONGO_ID/neighborhood?depth=2" \
  | python3 -m json.tool
```

---

## Part 6 — Talk track for a live demo (2–3 minutes)

1. **Problem:** “Phishing emails reuse the same fake login domains across many messages.”
2. **Submit** two reviews with the same malicious URL host — show triage workspace.
3. **Wait** for async pipeline (Kafka → Celery) — mention Mongo holds the review, Postgres holds chart events, Neo4j holds **relationships**.
4. Open **Phishing graph** — point out Sender / Review / Domain nodes and the **Campaign** cluster.
5. Optional: open Neo4j Browser and run the campaign Cypher query to show the same data for technical stakeholders.
6. **Reliability note:** if Neo4j is down, triage still works; graph APIs return empty results (graceful degradation).

---

## Reset graph data for a clean re-demo

Developers with **`dev.reset`** role can clear local Mongo, Postgres stats, Redis, Kafka, **and Neo4j** via the dev reset endpoint or UI simulation panel docs.

Or from WSL:

```bash
docker compose -f infra/docker/docker-compose.yml exec neo4j cypher-shell -u neo4j -p "$(grep '^NEO4J_PASSWORD=' backend/.env.dev | cut -d= -f2-)" \
  "MATCH (n) DETACH DELETE n"
```

(Reads password from your local file — do not hard-code it in scripts you commit.)

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| No campaign | Need 2+ reviews with risky verdict **and** same domain; both must be `completed` |
| Graph never updates | Check `ai-celery` logs; verify `NEO4J_ENABLED` and internal sync URL |
| 403 on `/graph/*` | User missing `graph.read`; sign in as admin/analyst |
| Verdict always benign | Set `DISABLE_LLM=false` and use mock LLM, or rely on rule engine keywords |
| Red error `graph_campaigns_failed` on `#graph` | Rebuild/recreate backend after pulling fixes: `docker compose up -d --build --force-recreate backend`. Confirm Neo4j is up: `docker compose ps neo4j` |

---

## Next steps

- Automated tests: [running_tests_guide.md](running_tests_guide.md) (`graphSync`, `graphApi`, `test_graph_sync.py`)
- Architecture context: [architecture.md](architecture.md), [worker-architecture.md](worker-architecture.md)
