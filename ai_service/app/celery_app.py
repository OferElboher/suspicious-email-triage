"""
This file constructs the Celery application object used by worker and dispatcher containers.

It configures broker URL, result backend, task serialization, and routing to
ai_service/app/tasks.py.

Environment variables point Redis and Mongo/Postgres credentials loaded via secrets_provider.py.

Workers execute with concurrency settings suitable for CPU and LLM I/O bound tasks.
"""

# os reads Celery broker/result URLs from environment variables.
import os

# Celery constructs the worker application used by the CLI and dispatcher.
from celery import Celery

# _broker is the Redis URL Celery uses to receive work.
_broker = os.environ.get("CELERY_BROKER_URL", "redis://localhost:6379/0")

# _result is the Redis URL Celery uses to store task result metadata.
_result = os.environ.get("CELERY_RESULT_BACKEND", "redis://localhost:6379/1")

# celery_app is the named Celery application loaded by `celery -A app.celery_app`.
celery_app = Celery("triage_ai", broker=_broker, backend=_result)

# JSON settings keep messages portable and easy to inspect during debugging.
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
    imports=("app.tasks",),
)
