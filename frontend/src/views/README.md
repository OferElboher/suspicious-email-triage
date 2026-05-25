# `frontend/src/views/` — full-page sections

These components are mounted by `TriageApp.jsx` depending on the active navigation tab. Tab selection is stored in the URL hash (`#analytics`, `#admin`; workspace uses no hash) so browser refresh restores the same view.

## Files

- `AnalyticsView.jsx` — charts, time range controls, and optional auto-refresh (rolling last 24 hours from PostgreSQL via `/metrics/*`).
- `AdminUsersView.jsx` — admin user provisioning UI backed by `/admin/users`.
- `AuthViews.jsx` — sign-in, forgot password, reset password screens.
- `SimulationPanel.jsx` — dev-only synthetic traffic controls and local reset button backed by `/dev/*` endpoints.

## URL hash routes

| Tab | Hash |
|-----|------|
| Triage workspace | *(none)* |
| Analytics & graphs | `#analytics` |
| Admin users | `#admin` |

See `../lib/appScreenNavigation.js` and `../hooks/useAppScreen.js`.
