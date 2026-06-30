# App navigation — icon tabs and sub-windows

This guide explains how the signed-in React shell organizes **sub-windows** (primary views) using **large round icon buttons**, **hover labels that stay on screen**, URL **hash routing**, and **role-based access control (RBAC)**.

If you are new to single-page applications (SPAs): the app does not perform a full browser navigation when you switch tabs. Instead, React swaps which view component is mounted, and the URL hash (the part after `#`) records your place so a refresh returns you to the same sub-window.

**Related:** [ui_guide_review_dashboard.md](ui_guide_review_dashboard.md), [ops_guide_central_logging.md](ops_guide_central_logging.md), [ui_guide_color_themes.md](ui_guide_color_themes.md), [auth_guide_django_admin_users.md](auth_guide_django_admin_users.md).

---

## Sub-windows (what each tab opens)

Each sub-window is a full-page view rendered inside `TriageApp.jsx`. The mapping from hash fragment to screen id lives in `frontend/src/lib/appScreenNavigation.js` as the `APP_SCREENS` constant. The hook `useAppScreen.js` keeps React state in sync with browser `hashchange` events.

| URL hash | Hover label (full name) | Who sees it |
|----------|-------------------------|-------------|
| *(empty)* | Review dashboard | Users with `reviews.read` |
| `#analytics` | Analytics & graphs | `metrics.read` **and** analytics feature flag |
| `#graph` | Phishing graph | `graph.read` |
| `#search` | Search past reviews | `reviews.read` |
| `#logs` | Search unified logs | `logs.read` |
| `#admin` | User administration | `admin` role or `admin.users` permission |
| `#settings` | Settings | Any authenticated user |

**Pattern name:** hash-based client routing — lightweight alternative to React Router for a fixed set of top-level tabs.

---

## Icon navigation bar (header)

Text labels were removed from the header to save horizontal space on smaller laptops. Instead, each destination is a **round button** with a **large inline SVG icon**. The full tab name appears in a tooltip when you hover (implemented with the shared `HoverHelp` component).

### Size and visual design

| Element | CSS class | Size | Purpose |
|---------|-----------|------|---------|
| Button | `.nav-icon` | **3.5rem × 3.5rem** (56px), **50% border-radius** (circle) | Comfortable click/touch target |
| Icon | `.nav-icon__svg` | **2rem × 2rem** (32px) | Readable at a glance |
| Active tab | `.nav-icon--active` | Accent border + soft fill | Shows current sub-window |

Icons use **stroke-based SVG** at 2px weight (`NavIcons.jsx`) so metaphors stay clear when scaled up:

| Icon component | Visual metaphor |
|----------------|-----------------|
| `IconDashboard` | Clipboard with checklist — triage queue |
| `IconAnalytics` | Bar chart with axis — KPIs |
| `IconGraph` | Hub node with three links — relationship graph |
| `IconSearchReviews` | Envelope + magnifying glass — Elasticsearch review search |
| `IconLogs` | Document + magnifying glass — log search |
| `IconAdmin` | Person + shield — admin / RBAC gateway |
| `IconSettings` | Gear — preferences and theme |

**Technology:** plain SVG in JSX with `currentColor` — no icon font or extra npm package, so colors follow the active CSS theme automatically.

### Components

| File | Responsibility |
|------|----------------|
| `AppNavBar.jsx` | Builds the row; filters tabs by RBAC `access` flags |
| `NavIconButton.jsx` | Wraps each button with `HoverHelp placement="above"` |
| `NavIcons.jsx` | Exports one SVG component per tab |
| `HoverHelp.jsx` | Tooltip; `useLayoutEffect` clamps position inside viewport |

### Hover labels that stay on screen

Earlier tooltips followed the mouse cursor (`placement="cursor"`), which worked in forms but could push nav labels **off the top or sides** of the viewport.

Nav buttons now use **`placement="above"`**:

1. `getBoundingClientRect()` on the button finds its screen position.
2. The tooltip is centered horizontally above the button.
3. `useLayoutEffect` measures the popup and **clamps** `left`/`top` with an 8px margin so the full tab name remains visible on narrow windows.

CSS class **`.hover-help__popup--nav`** adds centered text and slightly larger font for long names like “Analytics & graphs”.

**Accessibility:** every button still has `aria-label` with the full tab name for screen readers, independent of the hover tooltip.

---

## Search past reviews (dedicated `#search` tab)

Review full-text search used to live in the Review dashboard footer (`dashboard-tools`), where it was easy to miss without scrolling past simulation controls. It now has its own sub-window: **`SearchReviewsView.jsx`**.

**What you see on this tab:**

1. **`ReviewSearchPanel.jsx`** — plain-language keyword search, optional verdict/status/sender/date filters, and Lucene regex fields for power users. Requires **`reviews.read`** (bootstrap admin has this).
2. **`SearchIndexPanel.jsx`** (below the form) — Elasticsearch index status and **Clear search index** for users with **`dev.reset`** plus **`admin`** or **`developer`** role. The panel **always renders** for those users; if Elasticsearch is disabled or down, it shows setup steps instead of disappearing.

**Why separate:** analysts often investigate historical emails without triaging the live queue. A dedicated tab mirrors the **Logs** pattern and keeps the dashboard focused on inbound review tracking.

**Backend:** `GET /search/reviews`, `GET /search/status`, `DELETE /search/index` — see [search_guide_elasticsearch_reviews.md](search_guide_elasticsearch_reviews.md).

**Direct URL:** `http://localhost:3001/#search`

---

## Search unified logs (dedicated `#logs` tab)

Log search used to live inside the Review dashboard tools row. It now has its own sub-window: **`LogsView.jsx`** wraps `LogSearchPanel`.

**Why separate:** security operations center (SOC) analysts often search centralized logs without triaging inbound reviews. Gating the tab with `logs.read` keeps the dashboard focused on the review queue.

**Backend:** `GET /logs/search` — see [ops_guide_central_logging.md](ops_guide_central_logging.md).

---

## Settings sub-window (`#settings`)

**`SettingsView.jsx`** contains:

- **Theme** selector (`ThemeSelector.jsx`) — all 18 CSS themes including **`spring-blossom`**; see [ui_guide_color_themes.md](ui_guide_color_themes.md)
- **Account** summary (email, roles, permission count)
- **Sign out** (duplicate of header sign-out for convenience)

Guests on the login screen still see a theme picker in the `auth-theme-bar` (`App.js`) because Settings requires authentication.

---

## User administration sub-window (`#admin`)

**`AdminView.jsx`** is a **gateway** to Django admin (opens in a new browser tab). Full user CRUD remains in Django — we do not reimplement admin tables in React. Users with the admin role see the shield icon.

---

## Security note for documentation authors

This guide and all sibling docs use **placeholders only**. Never paste values from gitignored `backend/dev.secrets`, personal `.env` overrides, or live JWT strings into markdown. Refer to variable **names** and [ops_guide_secrets_management.md](ops_guide_secrets_management.md).

---

## Tests

| Test file | Coverage |
|-----------|----------|
| `AppNavBar.test.jsx` | RBAC-filtered tabs; **Search past reviews** button; click calls `setScreen` |
| `SearchReviewsView.test.jsx` | Dedicated `#search` tab mounts search + index admin panels |
| `SearchIndexPanel.test.jsx` | Index admin visible with setup text when ES disabled |
| `HoverHelp.test.jsx` | Tooltip show/hide; `placement="above"` nav styling |
| `appScreenNavigation` tests | Hash read/write helpers including `#search` |

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — frontend navigation unit tests</p>

```bash
cd ~/suspicious-email-triage/frontend
npm test -- --watchAll=false --testPathPattern="AppNavBar|HoverHelp|appScreenNavigation|SettingsView"
```

</div>
