# `backend/src/worker/` — BullMQ worker (optional legacy path)

This folder implements asynchronous processing using **BullMQ** on Redis.

## When it is used

The primary scoring path for the docker compose stack is **Kafka → Celery (Python)**. The Node worker remains useful for:

- local experimentation without Python services, or
- explicit fallback when `USE_BULLMQ_ENQUEUE=true`.

## Files

- `reviewWorker.js` — connects Mongo + Redis and registers the BullMQ worker.
- `processReviewJob.js` — per-job orchestration (rules + LLM merge + persistence).
- `ruleEngine.js` — deterministic heuristics.
