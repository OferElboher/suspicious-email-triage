# Manual test — phishing identification and campaigns (LLM off)

This guide walks you through a **repeatable manual test** when **`DISABLE_LLM=true`** (the default in `backend/.env.dev`). You will submit two related test emails, check how the **rule engine** scores them, optionally **override** verdicts as an analyst, and confirm whether a **Neo4j campaign** appears.

**Who this is for:** developers or QA who want step-by-step instructions without assuming LLM scoring is enabled.

**Related:** [graph_demo_neo4j_phishing.md](graph_demo_neo4j_phishing.md) (full demo), [graph_guide_neo4j_phishing.md](graph_guide_neo4j_phishing.md) (concepts), [data_guide_mock_llm.md](data_guide_mock_llm.md) (optional LLM path), [stack_guide_build_and_run.md](stack_guide_build_and_run.md) (login + Docker).

---

## How scoring works in your setup (no LLM)

| Step | Technology | What happens |
|------|------------|--------------|
| 1 | React UI → `POST /reviews` | Review saved in **MongoDB**, status `pending` |
| 2 | **Kafka** + **Celery** (`ai_service/app/tasks.py`) | Worker picks up the review |
| 3 | **Rule engine** (`ai_service/app/rule_engine.py`) | Deterministic Python heuristics (URL hostnames like `example-phish`, urgent + link, etc.) |
| 4 | **LLM stub** (`ai_service/app/llm_client.py`, `DISABLE_LLM=true`) | Returns `_llmDisabled: true` — **must not** force `benign` |
| 5 | **Merge** (`ai_service/app/merge.py`) | Final verdict = rule engine output when LLM is disabled |
| 6 | Mongo update | `analysisResult.verdict`, status `completed` |
| 7 | **Graph sync** (Celery → Neo4j) | `Review.verdict` on graph nodes; campaigns need **risky** verdicts |

**Important:** Campaign detection (`backend/src/graph/campaignDetection.js`) only clusters reviews whose effective verdict is **`suspicious`** or **`likely_phishing`**. **`benign`** reviews never join a campaign.

After rebuilding Docker images, recreate the Celery worker so it runs the latest Python code:

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --build ai-celery
```

---

## After `reset-local-state` — verify the stack end-to-end

Running **`POST /dev/reset-local-state`** clears Mongo reviews, Neo4j campaigns, Redis queues, Kafka backlog, PostgreSQL chart stats, and mock Snowflake analytics. That is expected — **Phishing graph** and **Recent reviews** will be empty until you create new data.

### 1. Confirm dev panels are available (simulation mode)

1. Rebuild backend if you have not since pulling latest code — see [stack_guide_full_feature_activation.md](stack_guide_full_feature_activation.md).
2. Sign in at `http://localhost:3001` — the **Dev simulation (synthetic emails)** card should appear for bootstrap admin ([stack_guide_dev_simulation.md](stack_guide_dev_simulation.md)).
3. Leave simulation **stopped** while testing the phishing graph manually (synthetic rows clutter Recent reviews).

### 2. Run the phishing graph verification test

This submits two demo emails, waits for Celery analysis, optionally prunes Neo4j duplicates, and asserts the campaign subgraph has **no disconnected nodes**:

```bash
bash scripts/run-manual-phishing-campaign-test.sh YOUR_EMAIL@example.com YOUR_PASSWORD
```

Ensure workers are up:

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d \
  backend ai-celery ai-kafka-dispatch neo4j
```

Then open **Phishing graph** → **Refresh**. Pass criteria: campaign `secure-login.example-phish.test` with **2** reviews, connected SVG edges, **no** duplicate React key warnings in the browser console.

Step-by-step manual checklist: [graph_test_manual_phishing_identification.md](graph_test_manual_phishing_identification.md).

### 3. Smoke-check other UI areas

| Area | What to verify |
|------|----------------|
| **Review dashboard** | Submit one review via **Submit email** modal → Review detail reaches `completed` |
| **Recent reviews** | New row appears; pagination and date jump work |
| **Analytics** (`/#analytics`) | Charts load (may be empty until events exist) |
| **Search past reviews** (`/#search`) | Plain-language keyword search returns indexed rows after analysis |
| **Search unified logs** (`/#logs`) | Log search panel returns JSON hits from `GET /logs/search` |
| **Override verdict** | Dropdown saves; Recent reviews shows `(override)` |

---

## Prerequisites

1. Signed in at `http://localhost:3001` — [stack_guide_build_and_run.md](stack_guide_build_and_run.md).
2. Stack running (backend, databases, workers, Neo4j):

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d \
  backend ai-celery ai-kafka-dispatch neo4j
```

3. **Turn off simulation** — click **Stop simulation** in the Dev simulation card (or leave it off after reset) so Recent reviews is not flooded with synthetic rows. See [stack_guide_dev_simulation.md](stack_guide_dev_simulation.md).
4. Confirm LLM is off inside the worker (optional):

```bash
docker compose -f infra/docker/docker-compose.yml exec ai-celery \
  printenv DISABLE_LLM
```

**Expected:** `true`

---

## Test messages (copy exactly)

Both messages share the hostname **`secure-login.example-phish.test`**. That string is wired into the rule engine as a **demo phishing indicator** (same idea as the Node rule engine in `backend/src/worker/ruleEngine.js`).

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

## Step 1 — Submit and wait for `completed`

1. Open **Review dashboard** → click **Submit email** → fill the form → **Queue analysis** for Message A.
2. Submit Message B the same way (open **Submit email** again).
3. Click each row in **Review queue**; watch **Review detail** until **Status: completed** for each.

**Pass:** Both reach `completed` within a few minutes.

**Fail (stuck pending):** Check `docker compose logs ai-celery` — see [arch_guide_worker_pipeline.md](arch_guide_worker_pipeline.md).

---

## Step 2 — Check automated verdict (rule engine, LLM off)

### Expected result **after a current worker build**

| Message | Expected verdict | Why |
|---------|------------------|-----|
| A | **`likely_phishing`** | URL contains `example-phish` / `secure-login`; subject contains “verify account”; urgent + link |
| B | **`likely_phishing`** | URL contains demo phishing hostname |

Summary line should say **`LLM disabled (python stub)`**. Findings should mention the URL or credential language — not only generic follow-ups.

### If you see **`benign`** but findings look suspicious (your reported case)

This usually means the **Celery container is running old code** where the disabled LLM stub returned `verdict: benign` and overwrote the rule engine.

**Fix:**

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --build ai-celery
```

Re-submit Message A and B (or use analyst override — Step 3).

**Quick terminal check** (no UI):

```bash
cd ~/suspicious-email-triage
bash scripts/verify-campaign-detection.sh
```

**Full automated manual test** (submits both demo emails, waits for Celery with progress output, re-queues Kafka if stuck, verifies connected subgraph):

```bash
bash scripts/run-manual-phishing-campaign-test.sh YOUR_EMAIL YOUR_PASSWORD
```

The script prints `status=` on each poll (so it does not appear frozen). If reviews stay `pending`, ensure `ai-celery` and `ai-kafka-dispatch` are running — the script runs a preflight check and can re-publish the Kafka ingest event via `POST /dev/requeue-review/:id` after five pending polls.

Optional environment variables: `ATTEMPTS=40`, `POLL_SECS=3`, `REQUEUE_AFTER=5` (set `REQUEUE_AFTER=0` to disable auto-requeue).

---

## Step 3 — Analyst override (when automated verdict is wrong)

The **Override reason** field is **notes only**. It does **not** change the verdict by itself.

To manually set a verdict:

1. In the **Result** panel, use the **Override verdict** dropdown → choose **`Likely phishing`**.
2. Optionally fill **Override reason (notes)** — e.g. `Manual test — shared phish domain`.
3. Click **Save override**.

**What should happen:**

| Where | Expected after save |
|-------|---------------------|
| **Result** panel | Shows **`likely_phishing (analyst override)`** |
| **Recent reviews** row | Shows **`likely_phishing · override`** (not `benign`) |
| **Phishing graph** (after Refresh) | Can form a campaign once **two** overridden reviews share the domain |

**Pattern:** Overrides are stored on `review.override` in MongoDB. The UI and Neo4j sync use **effective verdict** = override if present, else `analysisResult.verdict` (`backend/src/lib/effectiveVerdict.js`).

If Recent reviews still shows `benign` after override, click **Refresh** on that panel. If it still fails, pull latest code — this was a known display bug (list showed only `analysisResult.verdict`).

Repeat override for **both** Message A and B before expecting a campaign.

---

## Step 4 — Identify a phishing **campaign** (Neo4j)

A **campaign** means: **two or more** reviews with effective verdict **`suspicious`** or **`likely_phishing`** that share the same URL **domain** (`secure-login.example-phish.test`).

1. Ensure both reviews are `completed` **and** effectively risky (automated or override).
2. Open **Phishing graph** → **Refresh**.
3. Use **First / Prev / Next / Last** to move between campaigns.

**Pass:**

- **Detected campaigns** lists `secure-login.example-phish.test` with **2** linked reviews.
- Graph SVG shows **nodes and connecting lines (edges)** between senders, reviews, URLs, and domains.
- **Drag** the graph to pan; **Zoom − / +** and **Reset view**; **drag the bottom or right edge** to resize the viewport.
- Unconnected nodes are **hidden** automatically (stale Url/Domain rows in Neo4j, secondary components, or duplicate Sender ids from repeated test runs); the hint under the graph explains when orphans or duplicates were dropped. If the browser console shows **duplicate React key** warnings for `sender:…`, run `POST /dev/prune-graph` then refresh.

**Fail — no campaigns:**

| Cause | What to do |
|-------|------------|
| Verdict still `benign` on one or both | Rebuild `ai-celery` (Step 2) or override both (Step 3) |
| Only one review completed | Wait and refresh |
| Neo4j not running | `docker compose … up -d neo4j` |
| Graph sync lag | Refresh again after ~30s |

Optional API check (replace `TOKEN` with JWT from login):

```bash
curl -sS -H "Authorization: Bearer TOKEN" \
  "http://localhost:3000/graph/campaigns" | python3 -m json.tool
```

---

## Step 5 — Jump to date (optional)

**Recent reviews:** **Jump to date** + **Go** calls `GET /reviews/page-for-date?date=YYYY-MM-DD` and opens the page containing the first review on that day (`updatedAt`, newest-first sort).

**Phishing graph:** **Jump to date** in the graph toolbar selects the first campaign whose Neo4j `updatedAt` matches that day.

---

## Step 6 — Optional: enable mock LLM (different path)

If you want the **LLM path** instead of rule-only scoring:

1. In gitignored `backend/.env`, set `DISABLE_LLM=false` and `LLM_PROVIDER=mock_commercial`.
2. Recreate Celery and start mock LLM:

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --force-recreate ai-celery mock-llm
```

3. Re-submit test messages. See [data_guide_mock_llm.md](data_guide_mock_llm.md).

This is **not required** for campaign testing when the rule engine flags the demo URLs.

---

## Manual test log

| Step | Pass / fail | Notes |
|------|-------------|-------|
| 1 — Both completed | | |
| 2 — Automated verdict (or rebuilt worker) | | |
| 3 — Override both to likely_phishing (if needed) | | |
| 4 — Campaign visible in Phishing graph | | |

---

## Related docs

- [graph_demo_neo4j_phishing.md](graph_demo_neo4j_phishing.md) — narrative demo with Neo4j Browser
- [tech_neo4j_setup_wsl_windows.md](tech_neo4j_setup_wsl_windows.md) — Neo4j on WSL
- [arch_guide_worker_pipeline.md](arch_guide_worker_pipeline.md) — Kafka / Celery flow
