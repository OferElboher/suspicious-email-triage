# Review dashboard — queue tracking, detail panel, and manual submit modal

This guide explains the **Review dashboard** tab in the React single-page application (SPA). It is written for developers new to React, modal dialogs, and role-based UI patterns who need to understand **what analysts see**, **why manual paste is not on the main screen**, and **how hover help works everywhere**.

**Related:** [biz_guide_user.md](biz_guide_user.md), [stack_guide_dev_simulation.md](stack_guide_dev_simulation.md), [search_guide_elasticsearch_reviews.md](search_guide_elasticsearch_reviews.md), [ops_guide_central_logging.md](ops_guide_central_logging.md).

---

## Why the dashboard changed (2026 UX refresh)

In a production security operations center, suspicious email arrives from **shared mailboxes**, **API ingest**, or **SOAR playbooks** — analysts do not paste messages into the home screen all day. The main dashboard should therefore **track inbound review requests**: status, verdict, pagination, and selection for detail.

Manual paste remains valuable for **development**, **demos**, and **QA**, but it lives in a **modal dialog** opened by **Submit email** (toolbar button) so it does not consume permanent layout space.

| Pattern | Technology | Purpose |
|---------|------------|---------|
| Queue + detail split | CSS Grid (`.layout--dashboard`) | Left column lists reviews; right column shows selected item |
| Modal overlay | Fixed backdrop + `role="dialog"` | Manual submit without route change |
| Contextual help | `HoverHelp.jsx` wrapper | Dark tooltip on hover — same style as simulation panel |
| Permission gate | RBAC `reviews.write` | Only users who may create reviews see **Submit email** |

---

## Tab name and routing

- **Tab label:** **Review dashboard** (formerly “Triage workspace”).
- **URL hash:** default route `/` or `/#` — no hash required for the dashboard.
- **Component root:** `frontend/src/TriageApp.jsx` (name kept for history; renders the dashboard layout).

Other tabs (**Analytics & graphs**, graph views) keep their existing hash routes — see [ui_guide_analytics_charts.md](ui_guide_analytics_charts.md).

---

## Layout overview

```
┌─────────────────────────────────────────────────────────────┐
│  Toolbar: [Submit email]  ·  "N reviews tracked" stat pill   │
├──────────────────────────┬──────────────────────────────────┤
│  Review queue (left)     │  Review detail (right)           │
│  - pagination            │  - status / verdict / findings   │
│  - simulation filter     │  - analyst override form         │
│  - row click → select    │  - polling while pending         │
├──────────────────────────┴──────────────────────────────────┤
│  dashboard-tools (full width): dev simulation only             │
└─────────────────────────────────────────────────────────────┘
```

### Review queue (`RecentReviewsList.jsx`)

- Lists paginated summaries from `GET /reviews`.
- Clicking a row calls `onSelectReview(id)` — parent loads `GET /reviews/:id` into the detail panel.
- Selected row CSS class: `dashboard-list-item--selected`.
- Dev simulation rows show a `[Simulation]` prefix when `source === dev_simulation`.
- **Include simulation** checkbox filters synthetic traffic (Redis-backed ingest).

### Review detail (`ReviewDetailPanel.jsx`)

- Shows pipeline **status**, **effective verdict** (override wins — `effectiveVerdict.js`), **findings**, and **follow-up questions**.
- While status is `pending` or `processing`, `useReviewPoller` in the parent refreshes the document.
- Analysts with `reviews.override` see verdict dropdown + notes → `POST /reviews/:id/override`.

### Manual submit modal (`ManualReviewSubmitModal.jsx`)

- Opened from **Submit email** in the dashboard toolbar.
- Fields: sender name, sender email, subject, body (structured form — not raw RFC822 paste in v1).
- **Queue analysis** button → parent `POST /reviews` → closes modal → selects new id for polling.
- **Escape** or backdrop click closes (disabled while submitting).
- Each label wrapped in `HoverHelp` for field-level documentation.

---

## HoverHelp pattern (project-wide)

**Component:** `frontend/src/components/HoverHelp.jsx`

**Behavior:** Wrap any heading, button, or label. On mouse hover, a dark floating panel appears (`position: absolute`, high z-index) with explanatory text. This replaces long gray intro paragraphs in cards.

**Used in:**

- Review dashboard (queue toolbar, detail headings, submit modal)
- Dev simulation panel (`SimulationPanel.jsx`)
- Search panels on the dedicated **Search past reviews** tab (`ReviewSearchPanel`, `SearchIndexPanel`)

**Search past reviews** and **Search unified logs** live in separate sub-windows — [ui_guide_app_navigation.md](ui_guide_app_navigation.md) (`#search` and `#logs`).

**Accessibility note:** Tooltips supplement visible labels; they are not a substitute for full WCAG compliance on the graph tab (see [roadmap_tbd.md §6.1](roadmap_tbd.md#61-accessible-graph-visualization-p1--partial)).

---

## Permissions (RBAC)

| UI element | Permission |
|------------|------------|
| View queue & detail | `reviews.read` |
| **Submit email** button | `reviews.write` |
| Override verdict form | `reviews.override` |
| Search past reviews | `reviews.read` — dedicated **Search past reviews** tab (`#search`); Elasticsearch optional but required for hits |
| Search unified logs | `logs.read` — dedicated **Logs** tab (`#logs`) |
| Dev simulation / reset | `developer` role or admin + dev routes |

See [auth_guide_rbac.md](auth_guide_rbac.md).

---

## Developer workflow examples

### Submit a test email (manual)

1. Sign in at `http://localhost:3001`.
2. Stay on **Review dashboard**.
3. Click **Submit email** → fill subject/body → **Queue analysis**.
4. Click the new row in the queue; watch detail panel until status is `completed`.

### Run simulation without cluttering the queue

1. Use **Dev simulation** card → **Start simulation** ([stack_guide_dev_simulation.md](stack_guide_dev_simulation.md)).
2. Leave **Include simulation** unchecked on the queue to hide synthetic rows by default.

---

## Files to read in the repository

| File | Responsibility |
|------|----------------|
| `frontend/src/TriageApp.jsx` | Tab shell, layout, modal state, review selection |
| `frontend/src/components/RecentReviewsList.jsx` | Paginated queue |
| `frontend/src/components/ReviewDetailPanel.jsx` | Right-column detail |
| `frontend/src/components/ManualReviewSubmitModal.jsx` | Modal submit |
| `frontend/src/components/HoverHelp.jsx` | Tooltip wrapper |
| `frontend/src/styles/triage.css` | `.layout--dashboard`, `.modal-backdrop`, selected row |

---

## Security note for documentation authors

Never copy values from gitignored `backend/dev.secrets` or personal `.env` overrides into this guide. Use placeholders (`YOUR_EMAIL@example.com`) and variable names only — see [ops_guide_secrets_management.md](ops_guide_secrets_management.md).

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — WSL, repository root unless noted</p>

```bash
cd ~/suspicious-email-triage
PORT=3001 npm start --prefix frontend
# Open http://localhost:3001 → Review dashboard tab
```

</div>
