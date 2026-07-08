# Live flow dashboard — single-screen SOC wall (gauges, clocks, live pipeline)

This guide explains the **Live flow dashboard** tab (`#flow`) in plain language: why it fits **one screen without scrolling**, configurable auto-refresh, nine compact gauges (semicircle, vertical tank, traffic-light ranges, volatility jitter), clocks, and how the backend builds the numbers. No prior experience with SVG, statistics, or SOC wall displays is required.

**Related:** [ui_guide_app_navigation.md](ui_guide_app_navigation.md), [stack_guide_dev_simulation.md](stack_guide_dev_simulation.md), [ops_guide_metrics_alerting.md](ops_guide_metrics_alerting.md).

---

## What is this tab for?

Real **network / security operations center (NOC/SOC) dashboards** are designed so an operator sees **everything at once** — no scrolling, no hidden panels. If you must scroll, you might miss an alert on a wall display that is ten feet away.

This tab follows that pattern:

- **Single viewport** — CSS class `flow-dashboard--viewport` sets `height: calc(100dvh − header)` and `overflow: hidden` so the full wall fits below the app navigation bar.
- **3×3 gauge grid** — six operational semicircle dials plus three “pattern demo” widgets (vertical, range, volatility) in one grid.
- **Compact side strip** — UTC clock, uptime ring, simulation pill (dev), and pipeline counters in one horizontal row (no separate stats card).

You can **poll the API every 0.5 seconds** (minimum) while **dev simulation** creates synthetic reviews.

| Audience | What you learn |
|----------|----------------|
| **Analyst / demo viewer** | Queue flow `pending` → `processing` → `completed` at a glance |
| **Developer new to dashboards** | Viewport-bound layouts, SVG gauges, idle vs active warning indicators |

---

## How to open it

1. Sign in at `http://localhost:3001` (bootstrap admin — [auth_guide_dev_admin_credentials.md](auth_guide_dev_admin_credentials.md); password in gitignored `backend/dev.secrets`, never in docs).
2. Click the **speedometer** icon (**Live flow dashboard**).
3. Or: `http://localhost:3001/#flow`.

**Permission:** `metrics.read` ([auth_guide_rbac.md](auth_guide_rbac.md)).

---

## Layout (single screen, no scroll)

```
┌─────────────────────────────────────────────────────────────┐
│ Title │ Refresh │ Auto │ interval │ last update UTC         │
├─────────────────────────────────────────────────────────────┤
│ [UTC clock] [Uptime] [Sim] │ Created HTTP 5xx Graph ES σ …  │
├───────────────┬───────────────┬─────────────────────────────┤
│ Ingest / min  │ Pending       │ Processing                  │
├───────────────┼───────────────┼─────────────────────────────┤
│ Backlog       │ Completed /m  │ Readiness                   │
├───────────────┼───────────────┼─────────────────────────────┤
│ Vertical tank │ Range + ⚠     │ Volatility σ (jitter)       │
└───────────────┴───────────────┴─────────────────────────────┘
```

**Technology:** CSS Grid in `triage.css` — `.flow-dashboard__grid` is `3×3` with `minmax(0, 1fr)` rows so cells shrink to fit. Long detail captions are hidden in viewport mode (primary value + short label only).

**Pattern — viewport height:** We subtract `--flow-header-offset` (~4.25 rem) for the global app header (`app-header` in `TriageApp.jsx`). Using `100dvh` handles mobile browser chrome better than `100vh`.

---

## Auto-refresh

| Control | File / pattern | Behavior |
|---------|----------------|----------|
| **Refresh** | `useFlowDashboardPoll` `{ manual: true }` | Immediate fetch |
| **Auto** checkbox | `flowDashboardRefresh.js` → `localStorage` | Off = manual only |
| **Interval select** | Presets 0.5, 1, 2, 3, 5, 10, 30 s | Minimum **500 ms** enforced in code |

Background polls do **not** flash the loading spinner (only first load + manual refresh) so fast polling stays readable.

Preferences are **browser-only** — no secrets, not sent to the server.

---

## Gauges in the 3×3 grid

### Row 1–2 — operational semicircles (`FlowGauge.jsx`)

| Cell | Mongo / metrics source |
|------|------------------------|
| Ingest / min | `createdAt` in last minute |
| Pending / Processing | Status counts (activity-scaled needles) |
| Backlog | `backlog / (backlog + completed)` |
| Completed / min | Completed with `updatedAt` in last minute |
| Readiness | `appMetrics.lastReadinessStatus` |

**Activity scaling** (in `flowMetrics.js`): needles scale against simulation rate so fast Celery drains do not pin dials at 0% when `completed` history is huge.

### Row 3 — SOC pattern demos

| Cell | Component | Idea |
|------|-----------|------|
| **Vertical pending** | `FlowVerticalGauge.jsx` | SVG `<rect>` fill from bottom (“tank”) |
| **Range backlog** | `FlowRangeGauge.jsx` | Green / amber / red arc bands |
| **Volatility σ** | `FlowVolatilityGauge.jsx` + `useVolatilityNeedle.js` | Inter-arrival std dev + 100 ms local jitter |

---

## Warning indicator (⚠) — idle gray, active color

On the **range gauge**, the **⚠ icon is always visible** in **light gray** (`flow-range-gauge__warning--idle`). This mirrors physical SOC panels where indicator lamps sit dim until an alarm condition lights them up.

| Needle zone | ⚠ appearance | CSS classes |
|-------------|--------------|-------------|
| Green (0–40%) | Gray, static | `--idle` |
| Amber (40–70%) | Orange + pulse | `--active --warn` |
| Red (70–100%) | Red + pulse | `--active --danger` |

**Pattern — armed indicator:** Operators always know *where* to look; color means *something is wrong now*, not *this widget exists*.

Arc band colors (green/amber/red) remain visible at all times so thresholds are readable even when the needle is in the green zone.

---

## Volatility (backend + frontend)

**Backend** (`arrivalVolatility.js`): last 40 reviews → gaps between `createdAt` → population **standard deviation (σ)** in milliseconds → `gauges.arrivalVolatilityPercent` (0–100, ceiling 5000 ms).

**Frontend** (`useVolatilityNeedle`): re-renders needle every **100 ms** with bounded noise anchored to the server value so the dial **trembles** between API polls during bursty simulation.

---

## Clocks and stat strip

- **UTC** / **Uptime** — compact 64 px SVG clocks in the side row.
- **Sim** (dev) — Redis `triage:dev:simulation` rate or “Off”.
- **Stat strip** — Created, HTTP, 5xx, graph sync failures, ES docs, σ ms from the same snapshot (replaces the old scrollable stats card).

---

## API

`GET /metrics/flow-dashboard` — JWT + `metrics.read`. See [auth_guide_obtain_jwt.md](auth_guide_obtain_jwt.md) for tokens.

Notable fields: `rates.arrivalVolatility`, `gauges.arrivalVolatilityPercent`.

---

## Code map

| File | Role |
|------|------|
| `FlowDashboardView.jsx` | Viewport layout, 3×3 grid |
| `triage.css` | `.flow-dashboard--viewport`, compact sizing |
| `FlowRangeGauge.jsx` | Idle/active ⚠ logic |
| `flowMetrics.js` / `arrivalVolatility.js` | Snapshot + σ |
| `flowDashboardRefresh.js` | localStorage interval prefs |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Content clipped | Window very short | Maximize browser; wall targets ~768 px+ height |
| ⚠ stays gray | Backlog &lt; 40% | Expected — indicator idle until threshold |
| ⚠ orange/red | Backlog elevated/critical | Expected — active warning |
| Gauges flat | No traffic | Start dev simulation |

---

## Tests

```bash
cd ~/suspicious-email-triage/backend
npm test -- --watchAll=false --testPathPattern="flowMetrics|arrivalVolatility"

cd ~/suspicious-email-triage/frontend
npm test -- --watchAll=false --testPathPattern="FlowRange|FlowDashboard"
```

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — single-screen flow wall</p>

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d backend celery-worker
# Browser: http://localhost:3001/#flow (full wall visible without scrolling)
```

</div>
