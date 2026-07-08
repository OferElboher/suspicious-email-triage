# Live flow dashboard — single-screen SOC wall (gauges, clocks, live pipeline)

This guide explains the **Live flow dashboard** tab (`#flow`) in plain language: why it fits **one screen without scrolling**, how the layout balances compact gauges against a readable info column, configurable auto-refresh, nine dials (semicircle, vertical tank, traffic-light ranges, volatility jitter), clocks, and how the backend builds the numbers. No prior experience with SVG, CSS Grid, or security operations center (SOC) wall displays is required.

**Related:** [ui_guide_app_navigation.md](ui_guide_app_navigation.md), [stack_guide_dev_simulation.md](stack_guide_dev_simulation.md), [ops_guide_metrics_alerting.md](ops_guide_metrics_alerting.md), [ui_guide_color_themes.md](ui_guide_color_themes.md) (Appearance themes and the range warning badge).

---

## What is this tab for?

Real **network / security operations center (NOC/SOC) dashboards** are designed so an operator sees **everything at once** — no scrolling, no hidden panels. If you must scroll, you might miss an alert on a wall display that is ten feet away.

This tab follows that pattern:

- **Single viewport** — CSS class `flow-dashboard--viewport` sets `height: calc(100dvh − header)` and `overflow: hidden` so the full wall fits below the app navigation bar.
- **Compact 3×3 gauge grid** — six operational semicircle dials plus three “pattern demo” widgets (vertical tank, range bands, volatility σ) on the **left**, capped with `max-width: 520px` so dials do not waste horizontal space.
- **Wider meta column** — UTC analog clock, uptime ring, simulation pill (dev), and pipeline counters stacked on the **right** (`flow-dashboard__meta`, roughly 10.5–13 rem wide) so labels and digital readouts stay readable.
- **One UTC display** — server time appears **only** on the analog clock in the meta column, not duplicated in the toolbar next to Auto-refresh.

You can **poll the API every 0.5 seconds** (minimum) while **dev simulation** creates synthetic reviews.

| Audience | What you learn |
|----------|----------------|
| **Analyst / demo viewer** | Queue flow `pending` → `processing` → `completed` at a glance |
| **Developer new to dashboards** | Viewport-bound layouts, SVG gauges, theme-independent warning badges |

---

## How to open it

1. Sign in at `http://localhost:3001` (bootstrap admin — [auth_guide_dev_admin_credentials.md](auth_guide_dev_admin_credentials.md); password lives in gitignored `backend/dev.secrets`, never in docs).
2. Click the **speedometer** icon (**Live flow dashboard**).
3. Or: `http://localhost:3001/#flow`.

**Permission:** `metrics.read` ([auth_guide_rbac.md](auth_guide_rbac.md)).

---

## Layout (single screen, no scroll)

```
┌───────────────────────────────┬────────────────────┐
│ Title │ Refresh │ Auto │ int  │  Meta column       │
├───────────────────────────────┤  (wider)           │
│ Compact 3×3 gauge grid        │  ─────────────     │
│ (max ~520px, smaller SVGs)    │  UTC analog clock  │
│                               │  Uptime ring       │
│                               │  Sim rate pill     │
│                               │  stat stack        │
└───────────────────────────────┴────────────────────┘
```

**Technology — CSS Grid (`triage.css`):**

| Class | Role |
|-------|------|
| `.flow-dashboard__body` | Two columns: `1fr` (gauges) + `minmax(10.5rem, 13rem)` (meta) |
| `.flow-dashboard__grid` | `3×3` grid, `max-width: min(100%, 520px)`, `justify-self: start` |
| `.flow-dashboard__meta` | Flex column for clocks, sim pill, vertical stat list |

**Pattern — viewport height:** We subtract `--flow-header-offset` (~4.25 rem) for the global app header (`app-header` in `TriageApp.jsx`). Using `100dvh` handles mobile browser chrome better than `100vh`.

**Pattern — no duplicate clocks:** The toolbar shows title, manual Refresh, Auto checkbox, and interval select only. UTC time comes from `FlowAnalogClock` fed by `snapshot.clocks.serverUtc` in the meta column.

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
| **Range backlog** | `FlowRangeGauge.jsx` + `FlowWarningBadge.jsx` | Green / amber / red arc bands + armed indicator |
| **Volatility σ** | `FlowVolatilityGauge.jsx` + `useVolatilityNeedle.js` | Inter-arrival std dev + 100 ms local jitter |

---

## Warning indicator — SVG badge, theme-independent

On the **range gauge**, a small **warning badge** is **always visible**. It uses **`FlowWarningBadge.jsx`**: an inline **SVG triangle** with a “!” mark, not a Unicode ⚠ character. Unicode glyphs inherit font and color unpredictably across themes; SVG paths use **fixed hex fills and strokes** so the badge stays readable on all 18 Appearance themes (`data-theme` on `<html>`).

**Layout trick:** the badge sits in a dedicated **top rail** (`.flow-range-gauge__warning-rail`) above the semicircle SVG, not absolutely positioned over the arc. That prevents clipping when the viewport compresses gauge cells.

| Needle zone | Badge appearance | CSS classes |
|-------------|------------------|-------------|
| Green (0–40%) | Gray triangle, white “!” | `--idle` + fixed `#9ca3af` / `#374151` |
| Amber (40–70%) | Amber triangle + pulse | `--active --warn` |
| Red (70–100%) | Red triangle + pulse | `--active --danger` |

**Pattern — armed indicator:** Physical SOC panels keep indicator lamps visible but dim until an alarm condition lights them up. Gray means “armed and watching”; amber/red means “threshold breached **now**”.

Arc band colors (green/amber/red) remain visible at all times so thresholds are readable even when the needle is in the green zone.

---

## Volatility (backend + frontend)

**Backend** (`arrivalVolatility.js`): last 40 reviews → gaps between `createdAt` → population **standard deviation (σ)** in milliseconds → `gauges.arrivalVolatilityPercent` (0–100, ceiling 5000 ms).

**Frontend** (`useVolatilityNeedle`): re-renders needle every **100 ms** with bounded noise anchored to the server value so the dial **trembles** between API polls during bursty simulation.

---

## Clocks and stat stack (meta column)

- **UTC** — `FlowAnalogClock.jsx` renders a **68 px** SVG face in the meta column; digital `HH:MM:SS UTC` stacks **below** the face (static positioning, no negative margins).
- **Uptime** — companion ring gauge with uptime text below the SVG.
- **Sim** (dev) — Redis `triage:dev:simulation` rate or “Off”.
- **Stat stack** — vertical list of Created, HTTP, 5xx, graph sync failures, ES docs, σ ms.

There is **no second UTC stamp** in the toolbar — that duplicate was removed so operators see one authoritative clock.

---

## API

`GET /metrics/flow-dashboard` — JWT + `metrics.read`. See [auth_guide_obtain_jwt.md](auth_guide_obtain_jwt.md) for tokens (never paste live tokens into docs).

Notable fields: `rates.arrivalVolatility`, `gauges.arrivalVolatilityPercent`, `clocks.serverUtc`.

---

## Code map

| File | Role |
|------|------|
| `FlowDashboardView.jsx` | Viewport layout, compact grid + wide meta column |
| `triage.css` | Grid proportions, gauge caps, warning rail styles |
| `FlowRangeGauge.jsx` | Threshold bands + idle/active warning logic |
| `FlowWarningBadge.jsx` | Theme-safe SVG triangle indicator |
| `flowMetrics.js` / `arrivalVolatility.js` | Snapshot + σ |
| `flowDashboardRefresh.js` | localStorage interval prefs |

---

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| Content clipped | Window very short | Maximize browser; wall targets ~768 px+ height |
| Warning stays gray | Backlog &lt; 40% | Expected — indicator idle until threshold |
| Warning amber/red | Backlog elevated/critical | Expected — active warning |
| Gauges flat | No traffic | Start dev simulation |
| Meta column cramped | Old CSS cached | Hard refresh; meta should be ~10.5–13 rem |

---

## Tests

```bash
cd ~/suspicious-email-triage/backend
npm test -- --watchAll=false --testPathPattern="flowMetrics|arrivalVolatility"

cd ~/suspicious-email-triage/frontend
npm test -- --watchAll=false --testPathPattern="FlowRange|FlowDashboard|FlowWarning"
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
