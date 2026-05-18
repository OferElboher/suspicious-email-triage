# `backend/src/api/` — HTTP route modules

Route modules export Express `Router` instances mounted by `http/createApp.js`.

## Files

- `reviews.js` — create/list/get reviews and analyst overrides.
- `metrics.js` — reporting endpoints for charts (PostgreSQL statistics events).
