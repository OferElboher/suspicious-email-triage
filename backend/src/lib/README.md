# `backend/src/lib/` — shared utilities

Small modules reused across routes, workers, and dev tooling.

## Examples

- `logger.js` — JSON-lines merged logging.
- `logSearch.js` — reads merged logs for `GET /logs/search`.
- `extractLinks.js` — URL extraction for heuristics.
- `mongoConnect.js` — Mongoose connect helper.
- `getRedis.js` — singleton Redis client for non-BullMQ use cases.
