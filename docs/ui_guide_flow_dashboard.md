# Live flow dashboard — gauges, clocks, and real-time pipeline view

This guide explains the **Live flow dashboard** tab in plain language: what each gauge and clock means, why needles might look empty during simulation, how the backend builds numbers, and how the React UI draws them. You do not need prior experience with SVG graphics or SOC wall displays.

**Related:** [ui_guide_app_navigation.md](ui_guide_app_navigation.md), [ui_guide_analytics_charts.md](ui_guide_analytics_charts.md), [stack_guide_dev_simulation.md](stack_guide_dev_simulation.md), [ops_guide_metrics_alerting.md](ops_guide_metrics_alerting.md).

---

## What is this tab for?

Security operations centers (SOCs) often mount **wall displays** with:

- **Gauges** — semicircle dials with needles showing pressure (queue depth, ingest rate, error rate).
- **Clocks** — server time and service uptime so everyone in the room shares the same reference frame.

This project implements a **browser-based** version inside the React single-page app. It is lighter than Grafana or Datadog, but it still **polls the API every 3 seconds** so you can watch needles move while **dev simulation** creates synthetic email reviews.

| Audience | What you learn here |
|----------|---------------------|
| **Analyst / demo viewer** | How reviews move through `pending` → `processing` → `completed` in near real time |
| **Developer new to dashboards** | How polling + SVG needles work without a chart library like Recharts |

---

## How to open it

1. Sign in at `http://localhost:3001` (bootstrap admin — see [auth_guide_dev_admin_credentials.md](auth_guide_dev_admin_credentials.md); password is in gitignored `backend/dev.secrets`, never in docs).
2. Click the **speedometer** icon (**Live flow dashboard**) in the header navigation bar.
3. Or open directly: `http://localhost:3001/#flow`.

**Permission:** `metrics.read` (bootstrap **admin** and **manager** roles include this — see [auth_guide_rbac.md](auth_guide_rbac.md)).

---

## What you see on screen

### Clocks (top row)

| Widget | File / technology | What it means |
|--------|-------------------|---------------|
| **Server time (UTC)** | `FlowAnalogClock.jsx` — SVG clock face, hands rotated with the SVG `transform` attribute | The API server’s idea of “now”; resynced on each poll |
| **API uptime** | `FlowUptimeClock.jsx` — circular `stroke-dashoffset` ring | How long the Node.js API process has been running since last restart |
| **Simulation pill** (dev only) | Redis key `triage:dev:simulation` via `simulationStore.js` | Whether dev simulation is running and at what **configured** events/minute |

**Pattern — analog clock trick:** The backend sends `clocks.serverUtc` once per poll. Between polls, the frontend advances the hands every second with `setInterval` so the clock **appears to tick live**. This is a common dashboard UX pattern: coarse server sync + smooth local interpolation.

**SVG note:** Clock hands use `transform="rotate(angle cx cy)"` on SVG `<g>` groups. This is more reliable than CSS `transform` on SVG when the graphic is scaled via `viewBox`.

### Gauges (grid)

Each gauge is a **semicircle SVG** (`FlowGauge.jsx`) with:

- A grey background arc (full semicircle).
- A colored fill arc (`stroke-dasharray` along the path — standard SVG gauge technique).
- A needle rotated from −90° (left) to +90° (right) using the SVG `transform` attribute.

The **large number** under each gauge is the **human-readable primary value** (for example `28/min` or `5` pending). The smaller **“% of scale”** line is the needle position relative to a dynamic ceiling computed in `flowMetrics.js`.

| Gauge | Mongo / metrics source | Needle scale (activity-based) | Moves when… |
|-------|------------------------|------------------------------|-------------|
| **Ingest rate (last 1 min)** | `countDocuments({ createdAt: { $gte: oneMinuteAgo } })` | `ingestGaugeMax` = max(sim rate, observed 1m rate, 5m avg, 10) | You submit emails or **start simulation** |
| **Pending (in queue)** | `status: pending` count | `pendingScaleMax` = max(10, 2× sim rate, current pending) | Arrivals outpace Celery workers |
| **Processing (Celery)** | `status: processing` count | `processingScaleMax` = max(10, sim rate, current processing) | Kafka/Celery pipeline is analyzing |
| **Backlog pressure** | `backlog / (backlog + completed)` | Percentage (0–100) | In-flight work vs finished history |
| **Completion throughput** | `completed` with `updatedAt` in last minute | `completionScaleMax` = max(10, sim rate, observed completions) | Workers finish analysis |
| **Readiness** | `appMetrics.lastReadinessStatus` | 100 = healthy, 15 = degraded | Mongo, Redis, Kafka, or workers unhealthy |

**Why two kinds of percentages?** Early versions used only **share of total queue** (`pending / total`). During fast simulation, `total` grows large (thousands of `completed`) while `pending` stays small — share needles stuck at **0%** even with 30 reviews/min arriving. **Activity gauges** scale against the simulation target rate so needles move during demos.

**Detail captions** still show share percentages (for example “share 0% of 5,003 total”) so you can see both views.

### Pipeline counters (bottom card)

Cumulative counters from **`appMetrics.js`** (same in-process registry exposed at `GET /ops/prometheus`):

- Reviews created (API submissions **and** dev simulation ticks after `incrementReviewsCreated()`)
- HTTP requests / 5xx errors
- Graph sync failures
- Elasticsearch document count (optional)
- 5-minute average ingest rate

---

## Watch it move during dev simulation

1. Ensure the stack is up and Celery workers are running — see [stack_guide_full_feature_activation.md](stack_guide_full_feature_activation.md).
2. Open **Review dashboard** → **Dev simulation** → set rate (max **30/min** on laptops — `SIMULATION_MAX_EVENTS_PER_MIN` in `backend/.env.dev`) → **Start simulation** ([stack_guide_dev_simulation.md](stack_guide_dev_simulation.md)).
3. Switch to **Live flow dashboard** (`#flow`).
4. Within **one or two poll cycles** (3–6 seconds) you should see:
   - **Ingest rate** primary line approach your configured rate (for example `28/min`)
   - **Pending** and **Processing** needles rise, then fall as Celery completes jobs
   - **Simulation pill** show `Running · N/min`
   - **Created (API + sim total)** counter climb in the bottom card

**Important:** The UI input may show a number up to 30; the server clamps higher values when writing Redis. Simulation also enforces a **minimum 2 second interval** between ticks (`simulationLoop.js`), so the effective rate cannot exceed ~30/min on a laptop even if you type 60.

---

## API reference

**Route:** `GET /metrics/flow-dashboard`  
**Auth:** JWT bearer token + `metrics.read` permission  
**Poll interval (UI):** 3 seconds (`useFlowDashboardPoll.js` — React `useEffect` + `setInterval`, cleaned up on unmount)

Example (replace `YOUR_JWT` with a token from [auth_guide_obtain_jwt.md](auth_guide_obtain_jwt.md)):

```bash
curl -sS -H "Authorization: Bearer YOUR_JWT" \
  http://localhost:3000/metrics/flow-dashboard | python3 -m json.tool
```

Response sections:

| Field | Purpose |
|-------|---------|
| `generatedAt` | Snapshot timestamp (ISO UTC) |
| `clocks` | `serverUtc`, `uptimeSeconds`, `apiStartedAt` |
| `queue` | Mongo counts by `pending` / `processing` / `completed` / `failed` |
| `rates` | `createdLastMinute`, `createdLastFiveMinutes`, `completedLastMinute`, `createdPerMinuteAvg5m` |
| `gauges` | Share percents **and** activity percents with scale ceilings (`ingestGaugeMax`, `pendingScaleMax`, …) |
| `simulation` | Dev-only Redis simulation state |
| `pipeline` | In-process Prometheus-style counters |

**Backend module:** `backend/src/metrics/flowMetrics.js` — Mongoose `countDocuments`, Redis `readSimulation`, `appMetrics` state.  
**Route wiring:** `backend/src/api/metrics.js` — Express router with `requirePermission("metrics.read")`.

---

## Code map (for implementers)

| Layer | File | Pattern / technology |
|-------|------|----------------------|
| Snapshot builder | `backend/src/metrics/flowMetrics.js` | Mongo aggregates + activity scaling helper `activityPercent()` |
| REST | `backend/src/api/metrics.js` | Express, JWT RBAC |
| Poll hook | `frontend/src/hooks/useFlowDashboardPoll.js` | `getJson` + interval polling |
| View | `frontend/src/views/FlowDashboardView.jsx` | Grid of gauges/clocks; `primaryDisplay` for counts |
| Gauge | `frontend/src/components/FlowGauge.jsx` | SVG semicircle + `stroke-dasharray` fill arc |
| Clock | `frontend/src/components/FlowAnalogClock.jsx` | SVG hands + 1s local tick |
| Uptime ring | `frontend/src/components/FlowUptimeClock.jsx` | `stroke-dashoffset` on SVG circle |
| Styles | `frontend/src/styles/triage.css` | `.flow-dashboard__*`, `.flow-gauge__*` BEM classes |
| Nav | `#flow` in `appScreenNavigation.js`, `IconFlow` in `NavIcons.jsx` | Hash routing in `TriageApp.jsx` |
| Simulation | `simulationLoop.js` | `setInterval` → `Review.create` → `incrementReviewsCreated()` |

**Why not Recharts here?** Analytics charts use **Recharts** for historical PostgreSQL time series. Gauges need **continuous needle motion** and minimal CPU — plain SVG keeps the bundle smaller and avoids chart-library overhead for six dials.

---

## Troubleshooting

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| No **Live flow dashboard** icon | Missing `metrics.read` | Sign in as admin or manager |
| Tab loads but **“Loading first metrics snapshot…”** never clears | Backend down or JWT missing | Check `docker compose ps`, sign in again, inspect browser Network tab for `/metrics/flow-dashboard` |
| **Ingest** shows `0/min` while simulation runs | Workers/backend not on same Mongo; simulation disabled | Confirm `DEPLOYMENT_ENV=dev`, Redis sim `enabled: true`, `curl` the API (see above) |
| Needles at 0% but **detail** shows non-zero counts | Old share-only scaling | Rebuild frontend after pulling activity-gauge fix |
| **Needle invisible** but numbers visible | SVG CSS transform bug (fixed) | Needles now use SVG `transform` attribute — rebuild frontend |
| Simulation pill missing | Not `DEPLOYMENT_ENV=dev` | Expected in staging/prod — pill is dev-only |
| Error banner on tab | 403/500 from API | Check role, backend logs in `backend/logs/merged.log` |
| Typed **60/min** but pill shows **30/min** | Server clamp `SIMULATION_MAX_EVENTS_PER_MIN` | Expected on laptops — raise only if you accept higher load |

---

## Tests

```bash
cd ~/suspicious-email-triage/backend
npm test -- --watchAll=false --testPathPattern="flowMetrics|metricsApi"

cd ~/suspicious-email-triage/frontend
npm test -- --watchAll=false --testPathPattern="FlowGauge|FlowDashboard|useFlowDashboardPoll"
```

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — open flow dashboard after stack is up</p>

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d backend celery-worker
# Browser: http://localhost:3001/#flow (sign in as admin)
# Review dashboard → Start simulation → watch ingest gauge primary line (e.g. 28/min)
```

</div>
