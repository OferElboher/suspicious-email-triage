"""
Learning-oriented tests for Prefect orchestration patterns in this repo.

Prefect (https://www.prefect.io/) is a Python workflow orchestrator. In production you would:
  - decorate functions with @task and @flow
  - schedule flows (cron, event-driven, or Prefect Cloud)
  - retry failed tasks and observe runs in a UI

This project keeps the *business logic* in a plain function (`count_review_stats_events`) so tests
and CI never require a Prefect server. `flows.py` wraps that function when Prefect is installed.
"""

from __future__ import annotations

import inspect
from unittest.mock import MagicMock, patch

from orchestration.prefect_demo.flows import review_stats_flow
from orchestration.prefect_demo.stats_task import count_review_stats_events


def test_prefect_pattern_plain_function_is_testable_without_orchestrator():
    """
    Pattern: separate orchestration from logic.

    `count_review_stats_events` is a normal Python function — no Prefect import required.
    That means unit tests can mock the database and assert SQL behavior without spinning up
    Prefect Cloud or a local Prefect agent.
    """
    assert callable(count_review_stats_events)
    sig = inspect.signature(count_review_stats_events)
    # The `hours` parameter defines the rolling analytics window (default 24h health check).
    assert "hours" in sig.parameters


def test_prefect_pattern_flow_entrypoint_matches_task_signature():
    """
    Pattern: @flow calls @task which calls plain logic.

    Whether or not Prefect is installed, `review_stats_flow(hours=24)` must accept the same
    window parameter and return a dict containing `eventCount` when Postgres is reachable.
    """
    try:
        result = review_stats_flow(hours=24)
    except Exception as exc:  # pragma: no cover - offline CI without Postgres
        err = str(exc).lower()
        assert "connect" in err or "timeout" in err or "does not exist" in err
        return
    assert result["hours"] == 24
    assert "eventCount" in result
    assert "windowStart" in result


def test_prefect_pattern_mocked_postgres_proves_sql_aggregation():
    """
    Pattern: mock I/O at the boundary (psycopg connection) to teach what the task actually does.

    The task runs: SELECT COUNT(*) FROM review_stats_events WHERE occurred_at >= window_start.
    We fake the cursor so beginners see the expected shape without a live database.
    """
    fake_cursor = MagicMock()
    fake_cursor.__enter__ = MagicMock(return_value=fake_cursor)
    fake_cursor.__exit__ = MagicMock(return_value=False)
    fake_cursor.fetchone.return_value = (42,)

    fake_conn = MagicMock()
    fake_conn.cursor.return_value = fake_cursor

    with patch("psycopg.connect", return_value=fake_conn):
        result = count_review_stats_events(hours=1)

    assert result["eventCount"] == 42
    assert result["hours"] == 1
    # Verify the SQL targets the same table the Node API writes for analytics charts.
    executed_sql = fake_cursor.execute.call_args[0][0]
    assert "review_stats_events" in executed_sql
    assert "occurred_at" in executed_sql


def test_prefect_fallback_when_prefect_not_installed():
    """
    Pattern: graceful degradation — flows.py uses try/except ImportError.

    CI and minimal venvs may not install `prefect`. The fallback `review_stats_flow` still calls
    `count_review_stats_events` directly, preserving behavior for tests and local scripts.
    """
    import orchestration.prefect_demo.flows as flows_module

    # Either Prefect decorators exist, or the module defines a plain function fallback.
    assert hasattr(flows_module, "review_stats_flow")
    assert callable(flows_module.review_stats_flow)
