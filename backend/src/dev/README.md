# `backend/src/dev/` — development-only tooling

This folder contains routes and timers that should **not** be relied upon in production.

## Contents

- `devRoutes.js` — `/dev/features`, `/dev/simulation`, and `/dev/reset-local-state` endpoints.
- `simulationStore.js` — persists simulation settings (Redis with memory fallback).
- `simulationLoop.js` — background synthetic ingest loop (interval-based).
- Reset behavior clears local MongoDB reviews, PostgreSQL stats, Redis queues/state, and the local Kafka ingest topic.
