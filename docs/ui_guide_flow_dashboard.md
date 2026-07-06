# Live flow dashboard — gauges, clocks, and real-time pipeline view

This guide explains the **Live flow dashboard** tab: what each gauge and clock means, how the display **moves during dev simulation**, and how the implementation works for developers new to dashboard graphics.

**Related:** [ui_guide_app_navigation.md](ui_guide_app_navigation.md), [ui_guide_analytics_charts.md](ui_guide_analytics_charts.md), [stack_guide_dev_simulation.md](stack_guide_dev_simulation.md), [ops_guide_metrics_alerting.md](ops_guide_metrics_alerting.md).

---

## What is this tab for?

Security operations centers (SOCs) often mount **wall displays** with:

- **Gauges** — needles or arcs showing pressure (queue depth, ingest rate, error rate)
- **Clocks** — server time and service uptime so everyone shares the same reference frame

This project implements a **browser-based** version inside the React app. It is lighter than Grafana or Datadog but updates every **3 seconds** so you can **see simulation traffic move the needles** during local development.

| Audience | What you learn |
|----------|----------------|
| **Analyst / demo viewer** | How email reviews flow through pending → processing → completed |
| **Developer** | How to poll an API and animate SVG with CSS (no heavy chart library) |

---

## How to open it

1. Sign in at `http://localhost:3001`.
2. Click the **speedometer** icon (**Live flow dashboard**) in the header nav.
3. Or open directly: `http://localhost:3001/#flow`.

**Permission:** `metrics.read` (bootstrap **admin** and **manager** roles include this).

---

## What you see on screen

### Clocks (top row)

| Widget | Technology | Meaning |
|--------|------------|---------|
| **Server time (UTC)** | `FlowAnalogClock.jsx` — SVG hands + 1s local tick | API server clock; resynced on each poll |
| **API uptime** | `FlowUptimeClock.jsx` — circular progress ring | How long the Node process has been running |
| **Simulation pill** (dev only) | Redis `triage:dev:simulation` | Whether dev simulation is running and at what rate |

**Pattern — analog clock trick:** The backend sends `clocks.serverUtc` once per poll. The frontend advances the hands every second between polls so the clock **appears to tick live** (standard dashboard UX).

### Gauges (grid)

Each gauge is a **semicircle SVG** with a **needle** rotated via CSS `transform` (0–100%). Values come from `GET /metrics/flow-dashboard`.

| Gauge | Data source | Moves when… |
|-------|-------------|-------------|
| **Ingest rate (last 1 min)** | MongoDB `createdAt` counts | You submit emails or **start simulation** |
| **Pending share** | Count of `status: pending` | New reviews arrive faster than workers finish |
| **Processing share** | Count of `status: processing` | Celery/Kafka pipeline is actively analyzing |
| **Backlog pressure** | `(pending+processing) / (backlog+completed)` | Queue builds up vs drains |
| **Completion throughput** | Completed in last minute | Workers finish analysis |
| **Readiness** | In-process readiness gauge | Dependencies unhealthy (`/health/ready` degraded) |

**Pattern — gauge needle:** Value 0–100 maps to rotation −90° to +90°. CSS `transition: transform 0.6s ease` makes the needle **sweep smoothly** when the next poll returns new numbers.

### Pipeline counters (bottom card)

Cumulative counters from **`appMetrics.js`** (same registry exposed at `GET /ops/prometheus`):

- Reviews created via API
- HTTP requests / 5xx errors
- Graph sync failures
- Elasticsearch document count (optional)

---

## Watch it move during dev simulation

1. Open **Review dashboard** → **Dev simulation** → **Start simulation** ([stack_guide_dev_simulation.md](stack_guide_dev_simulation.md)).
2. Switch to **Live flow dashboard** (`#flow`).
3. Within a few poll cycles you should see:
   - **Ingest rate** needle rise toward the configured events/minute
   - **Pending share** and **backlog pressure** increase, then fall as Celery completes jobs
   - **Simulation pill** show `Running · N/min`

This mirrors how a production SOC wall would react to a real mail surge.

---

## API reference

**Route:** `GET /metrics/flow-dashboard`  
**Auth:** JWT + `metrics.read`  
**Poll interval (UI):** 3 seconds (`useFlowDashboardPoll.js`)

Example:

```bash
curl -sS -H "Authorization: Bearer YOUR_JWT" \
  http://localhost:3000/metrics/flow-dashboard | python3 -m json.tool
```

Response sections:

| Field | Purpose |
|-------|---------|
| `generatedAt` | Snapshot timestamp (ISO UTC) |
| `clocks` | `serverUtc`, `uptimeSeconds`, `apiStartedAt` |
| `queue` | Mongo counts by status |
| `rates` | Created/completed in last 1m / 5m |
| `gauges` | Precomputed 0–100 values for needles |
| `simulation` | Dev-only Redis simulation state |
| `pipeline` | In-process Prometheus-style counters |

**Backend module:** `backend/src/metrics/flowMetrics.js`  
**Route wiring:** `backend/src/api/metrics.js`

---

## Code map (for implementers)

| Layer | File | Pattern |
|-------|------|---------|
| Snapshot builder | `backend/src/metrics/flowMetrics.js` | Mongo `countDocuments` + `appMetrics` + Redis sim |
| REST | `backend/src/api/metrics.js` | Express router, `metrics.read` RBAC |
| Poll hook | `frontend/src/hooks/useFlowDashboardPoll.js` | `setInterval` + cleanup on unmount |
| View | `frontend/src/views/FlowDashboardView.jsx` | Layout grid of gauges/clocks |
| Gauge | `frontend/src/components/FlowGauge.jsx` | SVG semicircle + CSS needle |
| Clock | `frontend/src/components/FlowAnalogClock.jsx` | SVG hands + 1s tick |
| Uptime ring | `frontend/src/components/FlowUptimeClock.jsx` | `stroke-dashoffset` animation |
| Styles | `frontend/src/styles/triage.css` | `.flow-dashboard__*` BEM-style classes |
| Nav | `#flow` in `appScreenNavigation.js`, `IconFlow` in `NavIcons.jsx` |

**Why not Recharts here?** Analytics charts use **Recharts** for historical time series. Gauges need **continuous needle motion** and low CPU — plain SVG + CSS is simpler and keeps the bundle smaller.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| No **Live flow dashboard** icon | Missing `metrics.read` | Sign in as admin/manager |
| Gauges stuck at zero | No reviews in Mongo | Submit email or start simulation |
| Simulation pill missing | Not `DEPLOYMENT_ENV=dev` | Expected — pill is dev-only |
| Error banner on tab | API down or no JWT | Check backend container and sign-in |
| Needles jump without smooth sweep | CSS disabled or very fast poll | Normal on first load; transitions apply after first paint |

---

## Tests

```bash
cd ~/suspicious-email-triage/backend
npm test -- --watchAll=false --testPathPattern="flowMetrics|metricsApi"

cd ~/suspicious-email-triage/frontend
npm test -- --watchAll=false --testPathPattern="FlowGauge|FlowDashboard"
```

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — open flow dashboard after stack is up</p>

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d backend
# Browser: http://localhost:3001/#flow (sign in as admin)
# Start simulation on Review dashboard to watch gauges move
```

</div>
