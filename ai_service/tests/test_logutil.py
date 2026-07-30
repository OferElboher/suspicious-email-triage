"""Tests for ai_service/app/logutil.py — unified merged.log NDJSON writer."""

import json

from app.logutil import log_line


def test_log_line_includes_service_name_from_env(tmp_path, monkeypatch):
    """GET /logs/search?service=ai-celery-test must match Python worker lines."""
    log_path = tmp_path / "merged.log"
    monkeypatch.setenv("MERGED_LOG_PATH", str(log_path))
    monkeypatch.setenv("SERVICE_NAME", "ai-celery-test")

    log_line("info", "celery", "task finished", reviewId="r1")

    row = json.loads(log_path.read_text(encoding="utf-8").strip())
    assert row["service"] == "ai-celery-test"
    assert row["topic"] == "celery"
    assert row["reviewId"] == "r1"
