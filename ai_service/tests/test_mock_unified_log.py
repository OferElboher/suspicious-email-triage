"""Tests that mock LLM servers append to merged.log when configured."""

import json
import os
from unittest.mock import patch

from mock_commercial_llm.server import _log_unified


def test_mock_commercial_llm_log_unified_writes_ndjson(tmp_path, monkeypatch):
    """mock-llm uses app.logutil with SERVICE_NAME=mock-llm in Docker Compose."""
    log_path = tmp_path / "merged.log"
    monkeypatch.setenv("MERGED_LOG_PATH", str(log_path))
    monkeypatch.setenv("SERVICE_NAME", "mock-llm")

    _log_unified("info", "mock-llm request completed", {"model": "gpt-4o-mini"})

    row = json.loads(log_path.read_text(encoding="utf-8").strip())
    assert row["service"] == "mock-llm"
    assert row["topic"] == "mock-llm"
    assert row["model"] == "gpt-4o-mini"


def test_mock_commercial_llm_log_unified_swallows_io_errors():
    """Logging must never crash the HTTP handler when the volume is read-only."""
    bad_path = "/nonexistent/readonly/merged.log"
    with patch.dict(os.environ, {"MERGED_LOG_PATH": bad_path}, clear=False):
        _log_unified("warn", "auth rejected", {"status": 401})
