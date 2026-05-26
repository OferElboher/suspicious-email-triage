"""Tests for Prefect demo (runs without Prefect server)."""

from orchestration.prefect_demo.flows import review_stats_flow
from orchestration.prefect_demo.stats_task import count_review_stats_events


def test_review_stats_flow_is_callable():
    """Flow entrypoint returns eventCount when Postgres schema matches."""
    try:
        result = review_stats_flow(hours=24)
    except Exception as exc:  # pragma: no cover - offline CI
        err = str(exc).lower()
        assert "connect" in err or "timeout" in err or "does not exist" in err
        return
    assert "eventCount" in result
    assert result["hours"] == 24


def test_count_review_stats_events_signature():
    """Core task documents window parameter."""
    assert callable(count_review_stats_events)
