# App navigation — icon tabs and sub-windows

This guide explains how the signed-in React shell organizes **sub-windows** (primary views) using **icon-only navigation** with **hover labels**, URL hash routing, and **role-based visibility**.

**Related:** [ui_guide_review_dashboard.md](ui_guide_review_dashboard.md), [ops_guide_central_logging.md](ops_guide_central_logging.md), [ui_guide_color_themes.md](ui_guide_color_themes.md), [auth_guide_django_admin_users.md](auth_guide_django_admin_users.md).

---

## Sub-windows (tabs)

Each sub-window is a full-page view inside `TriageApp.jsx`. The browser URL hash remembers which view is open so refresh restores the same screen.

| Hash | Icon label (hover) | Permission / role |
|------|-------------------|-------------------|
| *(empty)* | Review dashboard | `reviews.read` |
| `#analytics` | Analytics & graphs | `metrics.read` + analytics feature flag |
| `#graph` | Phishing graph | `graph.read` |
| `#logs` | Search unified logs | `logs.read` |
| `#admin` | User administration | `admin` role or `admin.users` |
| `#settings` | Settings | any authenticated user |

**Pattern:** `frontend/src/lib/appScreenNavigation.js` defines `APP_SCREENS` and read/write helpers; `useAppScreen.js` syncs React state with `hashchange` events.

---

## Icon navigation bar

**Components:**

| File | Role |
|------|------|
| `AppNavBar.jsx` | Renders RBAC-filtered icon row |
| `NavIconButton.jsx` | Uniform 40×40 button + `aria-label` |
| `NavIcons.jsx` | Inline SVG icons (no extra npm package) |
| `HoverHelp.jsx` | Dark tooltip shows full tab name on hover |

Text labels were removed from the header bar to save space. Screen readers still get full names via `aria-label`.

---

## Search unified logs (dedicated tab)

Previously embedded in the Review dashboard tools row; now **`LogsView.jsx`** wraps `LogSearchPanel` in a dedicated sub-window (`#logs`).

**Why:** SOC operators search logs separately from review triage; gating by `logs.read` keeps the dashboard focused on inbound reviews.

**API:** `GET /logs/search` — see [ops_guide_central_logging.md](ops_guide_central_logging.md).

---

## Settings sub-window

**`SettingsView.jsx`** holds:

- **Theme** selector (`ThemeSelector.jsx`) — moved from the header; persists via `PUT /auth/preferences`
- **Account** summary (email, roles, permission count)
- **Sign out** button (duplicate of header sign-out for convenience)

Guests on the login screen still see theme picker in `auth-theme-bar` (`App.js`) because Settings requires authentication.

---

## User administration sub-window

**`AdminView.jsx`** is a gateway to **Django admin** (external tab). Full user CRUD remains in Django — not reimplemented in React. Admin role opens the **User administration** icon.

---

## Security note

Documentation uses placeholders only — never paste gitignored secrets or personal `.env` values.

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — frontend navigation unit tests</p>

```bash
cd ~/suspicious-email-triage/frontend
npm test -- --watchAll=false --testPathPattern="AppNavBar|appScreenNavigation|SettingsView"
```

</div>
