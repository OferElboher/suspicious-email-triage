# `frontend/src/views/` — full-page sections

These components are mounted by `TriageApp.jsx` depending on the active navigation tab.

## Files

- `AnalyticsView.jsx` — charts, time range controls, and optional auto-refresh (rolling last 24 hours from PostgreSQL via `/metrics/*`).
- `SimulationPanel.jsx` — dev-only synthetic traffic controls and local reset button backed by `/dev/*` endpoints.
