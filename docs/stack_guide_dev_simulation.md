# Dev simulation mode — configure, start, stop, and find synthetic data

This guide explains **dev simulation** end to end: what it does, who can use it, how to **start** and **stop** it with one button, and where synthetic emails appear in the React UI (Recent reviews, search panels, analytics, and logs).

**Audience:** developers and QA running the local Docker stack who want believable test traffic without manually pasting emails.

**Related:** [stack_guide_build_and_run.md](stack_guide_build_and_run.md) (full stack activation), [stack_guide_versions_builds.md](stack_guide_versions_builds.md) (dev vs prod slices), [auth_guide_obtain_jwt.md](auth_guide_obtain_jwt.md) (JWT for curl), [arch_guide_worker_pipeline.md](arch_guide_worker_pipeline.md) (Kafka → Celery path).

---

## What simulation mode is

| Concept | Meaning |
|---------|---------|
| **Purpose** | Generate synthetic email reviews at a steady rate so you can exercise MongoDB, Kafka, Celery, PostgreSQL stats, Elasticsearch indexing, and chart dashboards without manual copy-paste. |
| **Technology (timer)** | Node.js `setInterval` inside the **backend API process** (`backend/src/dev/simulationLoop.js`) — not a separate container. |
| **Technology (state)** | Redis key stores `{ enabled, eventsPerMinute }` via `simulationStore.js`; `POST /dev/simulation` updates it and restarts the timer. |
| **Technology (data tag)** | Each synthetic Mongo document has `source: "dev_simulation"` (`backend/src/models/Review.js`) so the UI can hide it by default. |
| **Pipeline** | Same as real triage: Mongo insert → Kafka `email.review.ingested` → `ai-kafka-dispatch` → Celery `analyze_review` → Mongo `completed` → optional graph sync and ES index. |

**Rate cap:** The server clamps `eventsPerMinute` to **30** on laptops (`MAX_EVENTS_PER_MIN` in `simulationStore.js`). The UI shows this maximum from `GET /dev/features` → `simulationMaxEventsPerMin`.

---

## Who can use simulation

All of the following must be true:

| Requirement | How to verify |
|-------------|---------------|
| `DEPLOYMENT_ENV=dev` | `GET /dev/features` returns `"deployment": "dev"` |
| Permission `dev.simulation` | Login JSON `user.permissions` includes `dev.simulation` (bootstrap **admin** has it) |
| Role **`admin`** or **`developer`** | Login JSON `user.roles` includes one of these |

If the **Dev simulation** card is missing after login, rebuild the backend image and hard-refresh the browser — see [auth_guide_obtain_jwt.md](auth_guide_obtain_jwt.md).

---

## Prerequisites (stack must be running)

Simulation inserts reviews and publishes Kafka events. For **completed** analysis and charts you also need async workers.

Minimal for **starting/stopping** simulation (timer only):

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d mongo postgres redis backend
```

Recommended for **full pipeline** (analysis + search + graph + analytics):

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --build \
  mongo postgres redis neo4j redpanda elasticsearch backend ai-celery ai-kafka-dispatch mock-snowflake
```

Frontend (separate terminal):

```bash
REACT_APP_API_URL=http://localhost:3000 PORT=3001 npm start --prefix frontend
```

Complete command reference: [stack_guide_full_feature_activation.md](stack_guide_full_feature_activation.md).

---

## Configure and activate via the UI

1. Sign in at `http://localhost:3001` as bootstrap admin.
2. Open **Review dashboard** (default tab).
3. Scroll to the dashed card **Dev simulation (synthetic emails)** — controls are **left-aligned**.
4. **Hover** over the title, status badge, rate field, or buttons for short help popups (the UI never shows file paths or documentation links).
5. Set **Emails per minute**, then click **Start simulation**. Click **Stop simulation** to pause; your rate is remembered.
6. While running, change the number and click **Apply rate** if you need a new speed without stopping.

Read the status line under the buttons for confirmation (“Simulation is running at 3 email(s) per minute.”).

---

## Deactivate simulation

| Method | Action |
|--------|--------|
| **UI (preferred)** | Click **Stop simulation** in the Dev simulation card |
| **HTTP** | `POST /dev/simulation` with `"enabled": false` (keeps `eventsPerMinute` in Redis) |
| **Full reset** | **Reset local databases & queues** (destructive — wipes all local data and stops simulation) |

Example curl (get JWT first — [auth_guide_obtain_jwt.md](auth_guide_obtain_jwt.md)):

```bash
curl -sS -X POST "http://localhost:3000/dev/simulation" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"enabled":false,"eventsPerMinute":3}' | python3 -m json.tool
```

---

## Where to see simulation reviews and logs

Synthetic rows use subject lines like `Simulated ingest 2026-…` and sender `sim+<timestamp>@dev.local`.

### Recent reviews

- **Default:** simulation rows are **hidden** (`GET /reviews` excludes `source: dev_simulation`).
- **To show them:** tick **Show simulation traffic** at the top of the Recent reviews panel.
- **Label:** rows are prefixed **`[Simulation]`** in the list (`RecentReviewsList.jsx`).

### Search past reviews (Elasticsearch)

- Open the **Search past reviews** panel in the Review dashboard.
- Search for keywords such as `Simulated ingest` or `Simulator`.
- **Technology:** Elasticsearch index `triage-reviews`; indexing runs after analysis completes (`scheduleSearchIndex` in the backend).
- Requires `elasticsearch` container running — see [search_guide_elasticsearch_reviews.md](search_guide_elasticsearch_reviews.md).

### Search unified logs (merged.log)

- Open **Search unified logs** in the Review dashboard (requires `logs.read` — admin has it).
- Useful keyword filters:
  - `simulation` — timer start/stop and synthetic review creation
  - `synthetic review` — each tick log line from `simulationLoop.js`
- **Technology:** JSON-lines `merged.log` searched via `GET /logs/search` — see [ops_guide_central_logging.md](ops_guide_central_logging.md).

Example curl:

```bash
curl -sS "http://localhost:3000/logs/search?keyword=simulation&limit=20" \
  -H "Authorization: Bearer ${TOKEN}" | python3 -m json.tool
```

### Analytics & graphs

- Open **Analytics & graphs** tab (`/#analytics`).
- Simulation increases review volume → more points on **Reviews over time** and related PostgreSQL-backed charts.
- Enable **Auto-refresh** to watch live updates while simulation runs.
- **Technology:** PostgreSQL `review_stats_events` populated when reviews complete — see [ui_guide_analytics_charts.md](ui_guide_analytics_charts.md).

Simulation traffic does **not** create Neo4j phishing campaigns by default (subjects/URLs are generic). For campaign graph testing use [graph_test_manual_phishing_identification.md](graph_test_manual_phishing_identification.md) instead.

---

## HTTP API reference (simulation)

| Route | Purpose |
|-------|---------|
| `GET /dev/features` | Whether UI should show simulation + reset panels |
| `GET /dev/simulation` | Read current `{ enabled, eventsPerMinute }` from Redis |
| `POST /dev/simulation` | Start, stop, or change rate (`{ enabled, eventsPerMinute }`) |
| `POST /dev/reset-local-state` | Stop simulation + wipe local data (destructive) |

Full schemas: [api_reference_rest.md](api_reference_rest.md#developer-routes-dev).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| No Dev simulation card | Not dev deployment, missing permission, or stale backend | Rebuild backend; sign in as admin; check `GET /dev/features` |
| Status stuck on “Could not read simulation state” | Backend not in dev or 403 on `/dev/simulation` | `DEPLOYMENT_ENV=dev`; rebuild backend |
| Reviews stay `pending` | Celery/dispatch not running | `up -d ai-celery ai-kafka-dispatch` |
| Recent reviews empty with simulation on | Default filter hides simulation | Tick **Show simulation traffic** |
| Search past reviews empty | ES down or indexing lag | Start `elasticsearch`; wait for `completed` status |
| Charts flat | No completed reviews yet | Wait for Celery; or lower rate and enable Auto-refresh |

---

## Security note

Documentation uses placeholders (`YOUR_EMAIL`, `temp-admin-pswd` from committed `backend/.env.dev`). Real secrets live in gitignored `backend/dev.secrets` — never paste them into docs or chat.

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — WSL, repository root</p>

```bash
cd ~/suspicious-email-triage
TOKEN=$(curl -sS -X POST "http://localhost:3000/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"YOUR_EMAIL@example.com","password":"YOUR_PASSWORD"}' \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")
curl -sS "http://localhost:3000/dev/simulation" -H "Authorization: Bearer ${TOKEN}" | python3 -m json.tool
```

</div>
