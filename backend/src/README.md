# `backend/src/` — application source

This directory holds the executable Node.js source for the API (and worker entrypoints that live alongside it).

## Subfolders (short index)

- `api/` — Express routers for external HTTP endpoints.
- `config/` — environment-derived runtime configuration helpers.
- `dev/` — dev-only routes, simulation timer loop, and local reset endpoint.
- `http/` — Express app factory (`createApp`).
- `kafka/` — KafkaJS producer utilities.
- `lib/` — shared utilities (logging, Redis client, link extraction, log search).
- `llm/` — optional LLM integration used by the legacy Node worker path.
- `models/` — Mongoose schemas.
- `queue/` — BullMQ queue client for optional legacy processing.
- `services/` — small orchestration helpers shared by routes and dev tools.
- `stats/` — PostgreSQL chart statistics store and queries.
- `worker/` — BullMQ worker implementation (optional).
