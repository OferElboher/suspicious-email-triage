# Demo guide — Neo4j phishing graph capabilities

This walkthrough shows how to **try and demo** the Neo4j features in this project: relationship modeling, shared-indicator **campaigns**, the React **Phishing graph** tab, REST APIs, and direct Cypher in Neo4j Browser.

**Audience:** developers new to graph databases who already have WSL + Docker working.

**Setup first:** [tech_neo4j_setup_wsl_windows.md](tech_neo4j_setup_wsl_windows.md)  
**Concepts & code map:** [graph_guide_neo4j_phishing.md](graph_guide_neo4j_phishing.md)  
**Neo4j Browser (Cypher UI):** [tech_neo4j_browser_guide.md](tech_neo4j_browser_guide.md)  
**Manual QA checklist (phishing verdict + campaign):** [graph_test_manual_phishing_identification.md](graph_test_manual_phishing_identification.md)

---

## What you will demonstrate {#what-you-will-demonstrate}

| Capability | Where you see it |
|------------|------------------|
| Sender → Review → URL → Domain relationships | Phishing graph tab, Neo4j Browser |
| Campaign when two+ risky reviews share a domain | Campaign list in UI, `GET /graph/campaigns` |
| Graph updates after async analysis | Submit review → wait for `completed` → refresh graph |
| Analyst-facing visualization | React `#graph` view (SVG nodes and edges) |

---

## Part 1 — Start the stack {#part-1-start-stack}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — WSL, repository root</p>

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d neo4j backend ai-celery ai-kafka-dispatch mock-llm
```

</div>

Optional — enable LLM scoring (mock API, zero cost). Edit gitignored `backend/.env` if needed (`DISABLE_LLM=false`, `LLM_PROVIDER=mock_commercial`), then:

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — recreate Celery after env change</p>

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --force-recreate ai-celery
```

</div>

Start the React UI per [stack_guide_windows_startup.md](stack_guide_windows_startup.md) (use `PORT=3001 npm start --prefix frontend` **without** `REACT_APP_API_URL`).

Sign in with a user that has **`graph.read`** (default admin/analyst roles).

---

## Part 2 — Seed two related “phishing” reviews {#part-2-seed-reviews}

**What you are proving:** Neo4j **campaign detection** (`backend/src/graph/campaignDetection.js`) links two or more **risky** reviews when they share the same URL **domain** (here: `secure-login.example-phish.test`). That requires:

1. Both reviews reach **`completed`** (Kafka → Celery pipeline in `ai_service/app/tasks.py`).
2. Each has verdict **`suspicious`** or **`likely_phishing`** (rule engine + optional mock LLM in `ai_service/app/merge.py`).
3. Celery calls **`sync_review_graph`** so Neo4j `Review` nodes get the final verdict before campaign Cypher runs.

**Before you submit:** turn **off** dev simulation in the Triage workspace (Simulation panel → uncheck “Enable synthetic ingests”) so **Recent reviews** is not flooded with “Simulated ingest” rows. User submissions are tagged `source: user`; simulation uses `dev_simulation` and is hidden by default.

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Demo test data (UI — Triage workspace)</strong> — open <code>http://localhost:3001</code>, sign in, click <strong>Queue analysis</strong> twice (once per row). Shared hostname: <code>secure-login.example-phish.test</code></p>

<p><strong>Review A</strong></p>

| Field | Value |
|-------|-------|
| Sender name | `Attacker A` |
| Sender email | `attacker-a@fake-mail.test` |
| Subject | `Urgent: verify your account` |
| Body | `Please verify immediately: https://secure-login.example-phish.test/reset` |

<p><strong>Review B</strong></p>

| Field | Value |
|-------|-------|
| Sender name | `Attacker B` |
| Sender email | `attacker-b@other-domain.test` |
| Subject | `Your account will be locked` |
| Body | `Click here: https://secure-login.example-phish.test/update` |

</div>

**Wait for Result panel:** **Status: completed** on both. Verdict should be **`likely_phishing`** (rule engine matches `example-phish` / `secure-login` in the URL even when `DISABLE_LLM=true`; mock LLM adds the same when `DISABLE_LLM=false` and `LLM_PROVIDER=mock_commercial`).

**Verify scoring (optional, terminal):**

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong></p>

```bash
cd ~/suspicious-email-triage
bash scripts/verify-campaign-detection.sh
```

</div>

---

## Part 3 — Phishing graph tab (React UI) {#part-3-react-graph}

1. Click **Phishing graph** (`#graph`).
2. Click **Refresh**.

**Expected:**

- **Detected campaigns** lists `secure-login.example-phish.test` with **2** linked reviews (largest campaigns appear first).
- The **relationship graph appears only when this list is non-empty** — not while it still says “No campaigns detected”.
- Use **◀ Prev / Next ▶** and **⏮ First / Last ⏭** to flip between clusters; **Zoom − / +** to scale the SVG.
- **Hover** any node or line for a detail box (sender email, review id, URL, relationship type).

If you see campaigns but an empty graph, wait for both reviews to reach `completed` and click **Refresh** again.

---

## Part 4 — Neo4j Browser {#part-4-neo4j-browser}

Full guide: [tech_neo4j_browser_guide.md](tech_neo4j_browser_guide.md). Open **http://localhost:7474/browser/** (Bolt: `bolt://localhost:7687`). Credentials from **`NEO4J_USER`** / **`NEO4J_PASSWORD`** in your local `backend/.env.dev` — never from documentation.

Campaign query (paste in Browser editor):

```cypher
MATCH (c:Campaign)<-[:PART_OF_CAMPAIGN]-(r:Review)
RETURN c.indicator AS campaign, collect(r.id) AS reviewIds, c.reviewCount AS count
```

---

## Verify campaign detection with automated tests {#verify-campaign-detection-with-automated-tests}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — full campaign + mock LLM test suite (includes <code>example-phish.test</code> rules)</p>

```bash
cd ~/suspicious-email-triage
bash scripts/verify-campaign-detection.sh
```

</div>

Jest only:

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong></p>

```bash
cd ~/suspicious-email-triage/backend
npm test -- --testPathPattern=campaignDetection --watchAll=false
```

</div>

**Expected:** all tests pass; no Neo4j or Docker required.

---

## Part 5 — REST API demo (optional) {#part-5-rest-api}

Graph routes need a **JWT** from login (not `GRAPH_INTERNAL_TOKEN`).

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — helper script (API port <strong>3000</strong>)</p>

```bash
cd ~/suspicious-email-triage
bash scripts/curl-graph-api.sh YOUR_EMAIL@example.com YOUR_PASSWORD
bash scripts/curl-graph-api.sh YOUR_EMAIL@example.com YOUR_PASSWORD /graph/campaigns
bash scripts/curl-graph-api.sh YOUR_EMAIL@example.com YOUR_PASSWORD /graph/visualization
```

</div>

Manual login:

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong></p>

```bash
cd ~/suspicious-email-triage
curl -sS -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"YOUR_EMAIL@example.com","password":"YOUR_PASSWORD"}'
```

</div>

Then replace `YOUR_JWT` and run:

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong></p>

```bash
curl -s -H "Authorization: Bearer YOUR_JWT" http://localhost:3000/graph/status | python3 -m json.tool
curl -s -H "Authorization: Bearer YOUR_JWT" http://localhost:3000/graph/campaigns | python3 -m json.tool
curl -s -H "Authorization: Bearer YOUR_JWT" http://localhost:3000/graph/visualization | python3 -m json.tool
curl -s -H "Authorization: Bearer YOUR_JWT" \
  "http://localhost:3000/graph/review/REVIEW_MONGO_ID/neighborhood?depth=2" | python3 -m json.tool
```

</div>

---

## Part 6 — Talk track {#part-6-talk-track}

1. Phishing reuses fake login domains across messages.
2. Submit two reviews sharing `secure-login.example-phish.test`.
3. Async pipeline: Kafka → Celery; Mongo = reviews, Postgres = chart events, Neo4j = relationships.
4. Open **Phishing graph** — Campaign cluster.
5. Optional: Neo4j Browser + campaign Cypher.
6. If Neo4j is down, triage still works (graceful degradation).

---

## Reset graph data {#reset-graph}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — reads password from local <code>backend/.env.dev</code> (never commit secrets)</p>

```bash
cd ~/suspicious-email-triage
docker compose -f infra/docker/docker-compose.yml exec neo4j cypher-shell -u neo4j -p "$(grep '^NEO4J_PASSWORD=' backend/.env.dev | cut -d= -f2-)" \
  "MATCH (n) DETACH DELETE n"
```

</div>

---

## Troubleshooting {#troubleshooting}

| Symptom | Fix |
|---------|-----|
| No campaign | 2+ risky verdicts, same domain, both `completed` |
| Graph never updates | Check `ai-celery`; `NEO4J_ENABLED`; internal sync URL |
| 403 on `/graph/*` | Missing `graph.read` role |
| `graph_campaigns_failed` | `docker compose up -d --build --force-recreate backend`; `docker compose ps neo4j` |

---

## Next steps {#next-steps}

- [stack_guide_running_tests.md](stack_guide_running_tests.md)
- [arch_guide_overview.md](arch_guide_overview.md), [arch_guide_worker_pipeline.md](arch_guide_worker_pipeline.md)
