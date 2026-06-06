# Manual test — phishing identification end to end

This document is a **standalone manual test procedure** for proving that the triage stack correctly **identifies phishing-like email**, persists results, and (when graph services run) links related messages into a **campaign** in Neo4j.

**Audience:** QA engineers or developers who want a repeatable checklist without reading the full Neo4j demo narrative.

**Broader demo (Cypher, APIs, screenshots):** [graph_demo_neo4j_phishing.md](graph_demo_neo4j_phishing.md)  
**Concepts:** [graph_guide_neo4j_phishing.md](graph_guide_neo4j_phishing.md)  
**Build + login first:** [stack_guide_build_and_run.md](stack_guide_build_and_run.md)

---

## What you are validating

| Layer | Technology | Pass criterion |
|-------|------------|----------------|
| **Rule engine** | Python in `ai_service/app/rule_engine.py` | URLs/domains like `example-phish` raise risk score |
| **Optional LLM** | `mock_commercial` HTTP API (`DISABLE_LLM=false`) | Model agrees with suspicious verdict |
| **Merge** | `ai_service/app/merge.py` | Final verdict `likely_phishing` or `suspicious` |
| **Persistence** | MongoDB + Postgres statistics | Review reaches `completed` in UI |
| **Graph sync** | Celery task `sync_review_graph` → Neo4j | Shared domain creates a **campaign** with ≥2 reviews |

---

## Prerequisites

1. Signed in at `http://localhost:3001` — [stack_guide_build_and_run.md](stack_guide_build_and_run.md).
2. Backend + databases running; for graph/campaign checks, also start workers:

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d backend ai-celery ai-kafka-dispatch mock-llm neo4j
```

3. In the Triage workspace, **disable simulation** (Simulation panel → uncheck synthetic ingests) so Recent reviews shows only your test rows.

---

## Test data — two related phishing messages

Submit **two** separate reviews via **Queue analysis**. Both bodies share the hostname `secure-login.example-phish.test` (intentional test domain wired in the rule engine).

### Message A

| Field | Value |
|-------|-------|
| Sender name | `Attacker A` |
| Sender email | `attacker-a@fake-mail.test` |
| Subject | `Urgent: verify your account` |
| Body | `Please verify immediately: https://secure-login.example-phish.test/reset` |

### Message B

| Field | Value |
|-------|-------|
| Sender name | `Attacker B` |
| Sender email | `attacker-b@other-domain.test` |
| Subject | `Your account will be locked` |
| Body | `Click here: https://secure-login.example-phish.test/update` |

---

## Step 1 — Submit and wait for completion

1. Open **Triage workspace** → **Queue analysis**.
2. Paste Message A fields → submit.
3. Repeat for Message B.
4. Watch the **Result** panel for each submission until **Status: completed** (Kafka → Celery pipeline).

**Pass:** Both show `completed` within a few minutes (depends on worker load).

**Fail:** Stuck `pending` / `failed` — check `docker compose logs ai-celery` and [arch_guide_worker_pipeline.md](arch_guide_worker_pipeline.md).

---

## Step 2 — Verify phishing verdict in UI

For each completed review, open it from **Recent reviews** (user submissions only; simulation rows are hidden by default).

**Pass:**

- Verdict is **`likely_phishing`** or **`suspicious`**.
- Explanation mentions the suspicious URL/domain (rule engine and/or LLM).

**Note:** With `DISABLE_LLM=true` (default in `.env.dev`), the **rule engine alone** should still flag `example-phish` / `secure-login` patterns. With `DISABLE_LLM=false` and `LLM_PROVIDER=mock_commercial`, the mock LLM reinforces the same verdict.

Optional terminal check:

```bash
cd ~/suspicious-email-triage
bash scripts/verify-campaign-detection.sh
```

---

## Step 3 — Verify campaign in Phishing graph tab

1. Click **Phishing graph** in the nav.
2. Click **Refresh**.

**Pass:**

- **Detected campaigns** lists `secure-login.example-phish.test` with **2** linked reviews.
- Graph SVG shows nodes (senders, reviews, URL, domain) and edges.
- **Prev / Next campaign** and **Zoom** controls work; hover shows tooltips.

**Fail — campaigns empty:** Both reviews must be `completed` with risky verdicts; wait and refresh. See [graph_demo_neo4j_phishing.md](graph_demo_neo4j_phishing.md#part-3-react-graph).

**Fail — list OK but graph empty:** Usually one review not synced yet; refresh after both complete.

---

## Step 4 — Optional API verification

With a JWT from login (`POST /auth/login`):

```bash
TOKEN="paste-jwt-here"
curl -sS -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/graph/campaigns" | python3 -m json.tool
```

**Pass:** JSON includes a campaign for `secure-login.example-phish.test` with `reviewCount` ≥ 2.

Campaign subgraph:

```bash
curl -sS -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3000/graph/campaign-subgraph?domain=secure-login.example-phish.test" \
  | python3 -m json.tool
```

---

## Step 5 — Record results (manual test log)

| Step | Result (pass/fail) | Notes |
|------|-------------------|-------|
| 1 — Both completed | | |
| 2 — Verdict phishing/suspicious | | |
| 3 — Campaign in UI | | |
| 4 — API campaigns (optional) | | |

---

## Negative control (optional)

Submit a benign message with no suspicious URLs (e.g. internal newsletter). **Expected:** verdict `benign` or low risk; no new campaign for unrelated domains.

---

## Related docs

- [graph_demo_neo4j_phishing.md](graph_demo_neo4j_phishing.md) — full demo with Neo4j Browser Cypher
- [tech_neo4j_setup_wsl_windows.md](tech_neo4j_setup_wsl_windows.md) — Neo4j Docker on WSL
- [data_guide_mock_llm.md](data_guide_mock_llm.md) — enabling mock LLM scoring
