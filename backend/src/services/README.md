# `backend/src/services/` — small orchestration helpers

Helpers in this folder exist to avoid duplicating “business glue” across multiple routes.

## Files

- `reviewPipeline.js` — shared enqueue logic after a `Review` document is created.
