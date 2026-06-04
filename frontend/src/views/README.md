# `frontend/src/views/` — full-page sections

These components are mounted by `TriageApp.jsx` depending on the active navigation tab. Tab selection is stored in the URL hash (`#analytics`; workspace uses no hash) so browser refresh restores the same view.

User administration is **not** a React view — admins use **Django admin** via the **User administration** header link. See [docs/auth_guide_django_admin_users.md](../../docs/auth_guide_django_admin_users.md).

## Files

- `AnalyticsView.jsx` — charts, time range controls, and optional auto-refresh (rolling last 24 hours from PostgreSQL via `/metrics/*`). See [docs/ui_guide_analytics_charts.md](../../docs/ui_guide_analytics_charts.md).
- `AuthViews.jsx` — sign-in, forgot password, reset password screens.
- `SimulationPanel.jsx` — dev-only synthetic traffic controls and local reset button backed by `/dev/*` endpoints.

## URL hash routes

| Tab | Hash |
|-----|------|
| Triage workspace | *(none)* |
| Analytics & graphs | `#analytics` |

See `../lib/appScreenNavigation.js` and `../hooks/useAppScreen.js`.
