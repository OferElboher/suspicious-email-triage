"""Tests for Celery → Node verdict webhook dispatch callback."""

from unittest.mock import MagicMock, patch

from app.verdict_delivery import notify_verdict_delivery, verdict_delivery_enabled


def test_verdict_delivery_enabled_defaults_true(monkeypatch):
    """VERDICT_DELIVERY_ENABLED defaults to on in dev Compose."""
    monkeypatch.delenv("VERDICT_DELIVERY_ENABLED", raising=False)
    assert verdict_delivery_enabled() is True


def test_notify_verdict_delivery_posts_to_node_internal_route(monkeypatch):
    """Pattern mirrors graph_sync — POST with X-Ingest-Internal-Token."""
    monkeypatch.setenv("BACKEND_INTERNAL_URL", "http://backend:3000")
    monkeypatch.setenv("INGEST_INTERNAL_TOKEN", "test-token")

    mock_response = MagicMock()
    mock_response.status_code = 200
    with patch("app.verdict_delivery.requests.post", return_value=mock_response) as mock_post:
        ok = notify_verdict_delivery("507f1f77bcf86cd799439011", reason="analysis_complete")
    assert ok is True
    mock_post.assert_called_once()
    args, kwargs = mock_post.call_args
    assert "/ingest/internal/verdict-deliver/" in args[0]
    assert kwargs["headers"]["X-Ingest-Internal-Token"] == "test-token"
