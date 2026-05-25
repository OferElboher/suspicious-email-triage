# `frontend/src/views/` — full-page sections

These components are mounted by `TriageApp.jsx` depending on the active navigation tab. Tab selection is stored in the URL hash (`#analytics`; workspace uses no hash) so browser refresh restores the same view.

User administration is **not** a React view — admins use **Django admin** via the **User administration** header link. See [docs/django_admin_user_management.md](../../docs/django_admin_user_management.md).

## Files

- `AnalyticsView.jsx` — charts, time range controls, and optional auto-refresh (rolling last 24 hours from PostgreSQL via `/metrics/*`). See [docs/analytics_and_graphs_guide.md](../../docs/analytics_and_graphs_guide.md).
- `AuthViews.jsx` — sign-in, forgot password, reset password screens.
- `SimulationPanel.jsx` — dev-only synthetic traffic controls and local reset button backed by `/dev/*` endpoints.

## URL hash routes

| Tab | Hash |
|-----|------|
| Triage workspace | *(none)* |
| Analytics & graphs | `#analytics` |

See `../lib/appScreenNavigation.js` and `../hooks/useAppScreen.js`.
