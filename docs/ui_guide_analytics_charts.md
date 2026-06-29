# Analytics & graphs — what the charts show

This guide explains the **Analytics & graphs** tab in the React triage app: each chart, the data behind it, the controls, and common misreadings (including why two status bars may look the same size).

**Audience:** analysts, managers, and developers using local dev or staging.

**Prerequisite:** PostgreSQL statistics events must exist (submit reviews or enable dev simulation). See [stack_guide_versions_builds.md](stack_guide_versions_builds.md).

---

## Open the page

1. Sign in at `http://localhost:3001` (or your dev URL).
2. Click **Analytics & graphs**, or open `http://localhost:3001/#analytics` directly.
3. Browser refresh (F5) stays on this tab — see [stack_guide_windows_startup.md](stack_guide_windows_startup.md).

**Permission required:** `metrics.read` (typically `manager`, `admin`, or roles with analytics access).

---

## Where the data comes from

Charts do **not** scan MongoDB review documents. They read narrow rows from PostgreSQL:

**Table:** `review_stats_events` in database `triage_stats`

| Column | Meaning |
|--------|---------|
| `occurred_at` | When the event happened |
| `event_type` | `review_created` or `status_changed` |
| `status` | Review pipeline status (for status events) |
| `verdict` | Optional verdict on completion |
| `review_id` | MongoDB review id (string) |

The Node API writes these events when reviews are created and when Celery/Node workers change status (`pending` → `processing` → `completed` / `failed`).

**API endpoints:**

| Chart | Endpoint |
|-------|----------|
| Traffic & queue health (line) | `GET /metrics/timeseries?from=&to=&bucket=&measure=` |
| Status mix (bars) | `GET /metrics/status-breakdown?from=&to=` |

The **`measure`** query parameter on the line chart selects which PostgreSQL `event_type` is counted:

| UI value | API `measure` | PostgreSQL `event_type` |
|----------|---------------|-------------------------|
| New review ingests | `ingests` (default) | `review_created` |
| Status transitions | `status_events` | `status_changed` |

---

## Chart legends and axis labels

Both Recharts charts include a **Legend** (color key at the top) and **axis labels** so you know exactly what is plotted:

| Chart | X-axis label | Y-axis label | Legend entry |
|-------|--------------|--------------|--------------|
| Line | **Time (local)** — bucket start in your browser timezone | **Count of new reviews** or **Count of status events** (depends on measure) | Blue line name matches selected measure |
| Bar | **Review pipeline status** — `pending`, `processing`, etc. | **Status event count** | Gray bar: “Status transition events” |

The phishing **graph** tab (`GraphView`) is not a Recharts chart — it is an SVG network with **no X/Y axes**. A **color legend** below the canvas explains node types (Sender, Review, Url, Domain, Campaign). See [graph_guide_neo4j_phishing.md](graph_guide_neo4j_phishing.md).

---

## Controls

| Control | Effect |
|---------|--------|
| **From / To** | Time window (local datetime). Disabled while auto-refresh is on. |
| **Line chart measure** | Switch line chart between **new ingests** (`review_created`) and **status transitions** (`status_changed`). |
| **Time bucket (X-axis grouping)** | Groups the line chart: `15m`, `1h`, or `1d`. |
| **Auto-refresh: on** | Shows rolling **last 24 hours**, polls every **30 seconds**. |
| **Auto-refresh: off** + **Apply range** | Uses your custom From/To window. |

Default manual range on first load: **last 7 days**, bucket **1 hour**.

---

## Chart 1 — Traffic & queue health (line chart)

**Title in UI:** “Traffic & queue health”

**What it measures:** How many **new reviews entered the system** in each time bucket.

**Event filter:** `event_type = 'review_created'` only.

**Y-axis:** Count of new ingests (integer).

**X-axis:** Time buckets from PostgreSQL `date_trunc` (or 15-minute floors for `15m` bucket).

**How to read it:**

- **Flat line near zero** — no (or few) new submissions in the window.
- **Spike** — burst of new reviews (real traffic or dev simulation).
- **Compare bucket sizes** — use `1h` for incident view, `1d` for weekly trend.

**What it does not show:** completions, failures, or queue depth directly — only **arrival rate**.

---

## Chart 2 — Status mix in the same window (bar chart)

**Title in UI:** “Status mix in the same window”

**What it measures:** How many **status transition events** were recorded for each status value in the selected time window.

**Event filter:** `event_type = 'status_changed'`.

**Each bar:** One **status label** (`pending`, `processing`, `completed`, `failed`, or `unknown`).

**Y-axis:** Count of status events (integer).

### Why two bars can look the same height

Bar height is **proportional to the count** for that status in the window. If **completed** and **processing** bars look the same size, the underlying **counts are equal** (or very close), not because the chart treats them as equal by design.

Example: in the last hour, 12 reviews moved to `processing` and 12 events were logged as `completed` → bars match.

There is **no** “processed” status in the pipeline. If you expected “processed”, the closest label is **`processing`** (worker is analyzing) vs **`completed`** (analysis finished).

### Multiple events per review

Each status change writes a **separate** row. A single review can contribute:

1. `status_changed` → `processing`
2. `status_changed` → `completed`

So status counts reflect **events**, not unique reviews. Heavy re-processing or retries can inflate counts.

### Empty or single bar

- **No data** — no reviews in the window, or statistics not yet written (start backend/workers).
- **Only `completed`** — normal if all work finished and few new `pending` events occurred in range.

---

## Status labels reference

| Status | Typical meaning |
|--------|-----------------|
| `pending` | Review saved; waiting for worker |
| `processing` | Worker/Celery is analyzing |
| `completed` | Analysis result stored in MongoDB |
| `failed` | Worker error; see logs |
| `unknown` | Event row missing status (rare) |

---

## Dev simulation and charts

With **simulation running** (admin or developer, dev only — **Start simulation** button), synthetic reviews increase:

- Line chart ingests (many `review_created` events)
- Status bars as the pipeline runs

Use simulation to populate charts on an empty laptop — see [stack_guide_dev_simulation.md](stack_guide_dev_simulation.md).

**Reset local databases & queues** (dev button) **truncates** `review_stats_events` — charts go empty until new activity.

---

## Verify data in DBeaver (optional)

Connect to PostgreSQL `triage_stats` — see [tech_postgresql_dbeaver_windows.md](tech_postgresql_dbeaver_windows.md).

```sql
SELECT event_type, status, count(*) AS n
FROM review_stats_events
WHERE occurred_at >= now() - interval '24 hours'
GROUP BY event_type, status
ORDER BY event_type, status;
```

Compare counts to the bar chart for the same time window.

---

## Troubleshooting

| Symptom | Likely cause |
|---------|----------------|
| Charts empty | No events yet; submit a review or run simulation |
| Line chart flat, bars populated | Creates vs status changes — different event types |
| Auto-refresh shows different range than expected | Auto mode always uses **last 24h**, ignoring manual From/To |
| 403 / error banner | User lacks `metrics.read` permission |
| Stale data with auto-refresh off | Click **Apply range** after changing dates |

---

## Related docs

- [stack_guide_windows_startup.md](stack_guide_windows_startup.md) — start stack & open UI
- [stack_guide_dev_database_credentials.md](stack_guide_dev_database_credentials.md) — PostgreSQL connection info
- [arch_guide_overview.md](arch_guide_overview.md) — Mongo vs PostgreSQL split
---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — WSL, repository root unless noted</p>

```bash
cd ~/suspicious-email-triage
curl -sS http://localhost:3000/health/live
# API must be up; open charts at http://localhost:3001/#analytics after sign-in
```

</div>

