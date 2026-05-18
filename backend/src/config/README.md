# `backend/src/config/` — runtime configuration

Centralizes parsing of environment variables so routes and services do not duplicate defaults.

## Files

- `runtime.js` — Mongo/PostgreSQL/Redis/Kafka settings, deployment slice (`dev` default), feature toggles.
