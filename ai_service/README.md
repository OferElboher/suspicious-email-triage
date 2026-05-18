# `ai_service/` — Python Kafka dispatcher + Celery workers

This folder contains the **async scoring** side of the system: consume Kafka ingest events, enqueue Celery tasks, update MongoDB, and write PostgreSQL status statistics.

## Entry processes

- `kafka_dispatcher.py` — long-running consumer that calls Celery tasks.
- Celery worker command: `celery -A app.celery_app worker ...` (see docker compose).

## Python package

- `app/` — Celery app, tasks, scoring helpers, logging utilities.

## Tests

- `tests/` — `pytest` unit tests (rule engine, etc.).
