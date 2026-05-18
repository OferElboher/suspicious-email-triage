# `ai_service/app/` — Python application modules

## Key modules

- `celery_app.py` — Celery configuration object (broker/backend/serialization).
- `tasks.py` — Celery task definitions (`analyze_review`).
- `mongo.py` — MongoDB access for tasks.
- `rule_engine.py` — deterministic heuristics (mirrors key Node rules at a high level).
- `llm_ollama.py` — optional LLM call path for scoring.
- `merge.py` — merges deterministic + model output into a persisted structure.
- `logutil.py` — JSON-lines logging compatible with the Node merged log format.
- `stats.py` — PostgreSQL status-event writer used by chart statistics.
