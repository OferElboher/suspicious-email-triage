"""Tests for Celery → backend Neo4j sync callback."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.graph_sync import graph_sync_enabled, sync_review_graph


def test_graph_sync_disabled_when_env_false(monkeypatch):
    """NEO4J_ENABLED=false skips HTTP entirely (CI without graph container)."""
    monkeypatch.setenv("NEO4J_ENABLED", "false")
    assert graph_sync_enabled() is False
    assert sync_review_graph("abc") is False


def test_sync_review_graph_posts_internal_token(monkeypatch):
    """Worker POSTs to /graph/internal/sync with X-Graph-Internal-Token header."""
    monkeypatch.setenv("NEO4J_ENABLED", "true")
    monkeypatch.setenv("BACKEND_INTERNAL_URL", "http://backend:3000")
    monkeypatch.setenv("GRAPH_INTERNAL_TOKEN", "dev-graph-sync-token")

    mock_response = MagicMock()
    mock_response.status_code = 200

    with patch("app.graph_sync.requests.post", return_value=mock_response) as mock_post:
        ok = sync_review_graph("review-42")

    assert ok is True
    mock_post.assert_called_once()
    args, kwargs = mock_post.call_args
    assert args[0] == "http://backend:3000/graph/internal/sync/review-42"
    assert kwargs["headers"]["X-Graph-Internal-Token"] == "dev-graph-sync-token"
