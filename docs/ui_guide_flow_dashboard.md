# Live flow dashboard — gauges, clocks, and real-time pipeline view

This guide explains the **Live flow dashboard** tab in plain language: configurable auto-refresh, semicircle and vertical gauges, traffic-light range bands with warning icons, a high-frequency volatility dial, clocks, and how the backend builds the numbers. You do not need prior experience with SVG graphics, statistics, or SOC wall displays.

**Related:** [ui_guide_app_navigation.md](ui_guide_app_navigation.md), [ui_guide_analytics_charts.md](ui_guide_analytics_charts.md), [stack_guide_dev_simulation.md](stack_guide_dev_simulation.md), [ops_guide_metrics_alerting.md](ops_guide_metrics_alerting.md).

---

## What is this tab for?

Security operations centers (SOCs) often mount **wall displays** with:

- **Gauges** — dials or vertical “tanks” showing pressure (queue depth, ingest rate, burstiness).
- **Threshold colors** — green / amber / red bands so operators spot trouble without reading exact numbers.
- **Clocks** — server time and service uptime so everyone shares the same reference frame.

This project implements a **browser-based** version inside the React single-page app. It is lighter than Grafana or Datadog, but you can **poll the API as often as every 0.5 seconds** and watch needles move while **dev simulation** creates synthetic email reviews.

| Audience | What you learn here |
|----------|---------------------|
| **Analyst / demo viewer** | How reviews move through `pending` → `processing` → `completed` in near real time |
| **Developer new to dashboards** | Polling intervals, SVG gauges, range bands, and local animation between API calls |

---

## How to open it

1. Sign in at `http://localhost:3001` (bootstrap admin — see [auth_guide_dev_admin_credentials.md](auth_guide_dev_admin_credentials.md); password lives in gitignored `backend/dev.secrets`, never in documentation).
2. Click the **speedometer** icon (**Live flow dashboard**) in the header navigation bar.
3. Or open directly: `http://localhost:3001/#flow`.

**Permission:** `metrics.read` (bootstrap **admin** and **manager** roles — see [auth_guide_rbac.md](auth_guide_rbac.md)).

---

## Auto-refresh (configurable interval)

At the top of the tab you will find:

| Control | Technology | Behavior |
|---------|------------|----------|
| **Auto-refresh** checkbox | `flowDashboardRefresh.js` → `localStorage` key `triage_flow_dashboard_refresh` | When off, only **Refresh now** fetches data (useful while debugging) |
| **Preset select** | Same module, presets `[0.5, 1, 2, 3, 5, 10, 30]` seconds | Quick interval pick |
| **Custom seconds input** | `normalizeFlowDashboardIntervalMs()` enforces **minimum 0.5 s (500 ms)** | Type any half-second step ≥ 0.5 |
| **Refresh now** button | `useFlowDashboardPoll` with `{ manual: true }` | Immediate fetch; shows loading spinner |

**Pattern — background vs manual poll:** The hook `useFlowDashboardPoll.js` uses React `useEffect` + `setInterval`. Background polls **do not** flash the loading spinner (only the first load and manual refresh do), so fast 0.5 s polling stays readable.

**Security note:** Refresh preferences are **browser-only** (localStorage). They are not synced to the server and contain no secrets.

---

## What you see on screen

### Clocks (top row)

| Widget | File / technology | What it means |
|--------|-------------------|---------------|
| **Server time (UTC)** | `FlowAnalogClock.jsx` — SVG `transform="rotate(...)"` on hand groups | API server clock; resynced each poll |
| **API uptime** | `FlowUptimeClock.jsx` — SVG circle `stroke-dashoffset` | Node.js process lifetime |
| **Simulation pill** (dev only) | Redis `triage:dev:simulation` via `simulationStore.js` | Simulation on/off and configured rate |

**Pattern — analog clock trick:** Server sends `clocks.serverUtc` once per poll; the UI ticks hands every second locally between polls.

### Gauge patterns showcase (SOC demos)

A dedicated card demonstrates three alternate gauge styles used on real SOC walls:

| Widget | Component | Pattern / technology | What it shows |
|--------|-----------|----------------------|---------------|
| **Vertical — pending level** | `FlowVerticalGauge.jsx` | SVG `<rect>` fill rising from bottom (“tank” gauge) | Pending queue depth as vertical fill |
| **Range — backlog pressure** | `FlowRangeGauge.jsx` | Stacked arc segments with `stroke-dasharray` + `stroke-dashoffset`; zones `{ from, to, tone, label }` | Green 0–40% “Normal”, amber 40–70% “Elevated”, red 70–100% “Critical” |
| **Arrival volatility (σ jitter)** | `FlowVolatilityGauge.jsx` + `useVolatilityNeedle.js` | Mongo gap **standard deviation** + **100 ms local jitter** | How “bursty” arrivals are; needle shakes furiously between polls |

**Range gauge warning icon:** When the needle enters amber or red (`tone: warn | danger`), a **⚠** badge pulses in the corner (`@keyframes flow-range-pulse` in `triage.css`). This is a visual alert pattern — no modal — like a wall display LED.

**Volatility math (backend):** Module `arrivalVolatility.js` loads the **40 most recent** reviews’ `createdAt` timestamps, computes **gaps** between consecutive arrivals (milliseconds), then the **population standard deviation (σ)** of those gaps. Steady simulation ≈ low σ; irregular bursts ≈ high σ. Mapped to 0–100% with ceiling `STD_DEV_CEILING_MS = 5000`. Exposed as:

- `rates.arrivalVolatility.stdDevMs`
- `gauges.arrivalVolatilityPercent`

**Volatility animation (frontend):** Even at 0.5 s polling, σ changes slowly. The hook `useVolatilityNeedle` re-renders the needle every **100 ms** with bounded random walk noise anchored to the server percent — so the dial feels **sensitive and alive** during demos while still reflecting real burstiness.

### Standard semicircle gauges (main grid)

Each uses `FlowGauge.jsx` (semicircle arc + SVG needle). Primary captions show raw counts (`28/min`, pending integer).

| Gauge | Data source | Activity scale |
|-------|-------------|----------------|
| Ingest rate (1 min) | Mongo `createdAt` window | `ingestGaugeMax` |
| Pending / Processing | Mongo status counts | `pendingScaleMax`, `processingScaleMax` |
| Backlog pressure | `backlog / (backlog + completed)` | 0–100% |
| Completion throughput | Completed in last minute | `completionScaleMax` |
| Readiness | `appMetrics.lastReadinessStatus` | Healthy vs degraded |

See prior sections in this guide for why **activity scaling** matters when `completed` history is huge.

### Pipeline counters (bottom card)

From **`appMetrics.js`** and volatility stats:

- Reviews created (API + simulation)
- HTTP requests / 5xx / graph sync failures
- Search index document count
- **Arrival σ (ms)** — same std dev as the volatility gauge

---

## Watch it move during dev simulation

1. Start stack + Celery — [stack_guide_full_feature_activation.md](stack_guide_full_feature_activation.md).
2. Review dashboard → **Dev simulation** → Start (max **30/min** on laptops — `SIMULATION_MAX_EVENTS_PER_MIN` in gitignored env).
3. Open `#flow`; set **Auto-refresh** to **0.5 s** or **1 s** for snappy demos.
4. Observe: ingest primary line rises; vertical tank fills; range gauge may enter amber under backlog; **volatility needle trembles** (especially if simulation intervals vary).

---

## API reference

**Route:** `GET /metrics/flow-dashboard`  
**Auth:** JWT + `metrics.read`  
**Default poll:** 3 s (user override in UI)

New / notable response fields:

| Field | Meaning |
|-------|---------|
| `rates.arrivalVolatility` | `{ sampleSize, gapCount, meanGapMs, stdDevMs, volatilityPercent }` |
| `gauges.arrivalVolatilityPercent` | 0–100 needle input for volatility widget |

**Backend:** `flowMetrics.js` aggregates Mongo + `computeArrivalVolatility()` from `arrivalVolatility.js`.  
**Route:** `backend/src/api/metrics.js`.

Example (use JWT from [auth_guide_obtain_jwt.md](auth_guide_obtain_jwt.md)):

```bash
curl -sS -H "Authorization: Bearer YOUR_JWT" \
  http://localhost:3000/metrics/flow-dashboard | python3 -m json.tool
```

---

## Code map

| Layer | File | Role |
|-------|------|------|
| Refresh prefs | `frontend/src/lib/flowDashboardRefresh.js` | localStorage, 500 ms floor |
| Poll hook | `frontend/src/hooks/useFlowDashboardPoll.js` | `setInterval`, manual vs background |
| View | `frontend/src/views/FlowDashboardView.jsx` | Toolbar + showcase + main grid |
| Semicircle | `FlowGauge.jsx` | Default arc gauge |
| Vertical | `FlowVerticalGauge.jsx` | Tank fill |
| Range | `FlowRangeGauge.jsx` | Traffic-light bands + ⚠ |
| Volatility | `FlowVolatilityGauge.jsx`, `useVolatilityNeedle.js` | σ + jitter |
| Volatility stats | `backend/src/metrics/arrivalVolatility.js` | Mongo gap std dev |
| Snapshot | `backend/src/metrics/flowMetrics.js` | Full dashboard JSON |
| Styles | `frontend/src/styles/triage.css` | `.flow-range-gauge__*`, etc. |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Polling too heavy at 0.5 s | Expected — lower interval or disable auto-refresh | Use 3–10 s for normal dev |
| Volatility always low | Few reviews or steady simulation | Run simulation longer; gaps become regular |
| ⚠ never appears | Backlog pressure &lt; 40% | Normal — warning is intentional |
| Settings reset | Cleared localStorage | Defaults return (auto on, 3 s) |

---

## Tests

```bash
cd ~/suspicious-email-triage/backend
npm test -- --watchAll=false --testPathPattern="flowMetrics|arrivalVolatility|metricsApi"

cd ~/suspicious-email-triage/frontend
npm test -- --watchAll=false --testPathPattern="FlowGauge|FlowVertical|FlowRange|FlowVolatility|FlowDashboard|useFlowDashboardPoll|useVolatilityNeedle|flowDashboardRefresh"
```

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — flow dashboard with fast refresh</p>

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d backend celery-worker
# Browser: http://localhost:3001/#flow → enable Auto-refresh → 0.5 s → start simulation
```

</div>
