"""Prefect flow demo — orchestrates stats aggregation (optional Prefect runtime)."""

from orchestration.prefect_demo.stats_task import count_review_stats_events

try:
    from prefect import flow, task

    @task(name="count-review-stats-events")
    def prefect_count_task(hours: int = 24) -> dict:
        """Prefect task wrapper around the testable stats function."""
        return count_review_stats_events(hours)

    @flow(name="review-stats-health-check")
    def review_stats_flow(hours: int = 24) -> dict:
        """Demo flow: scheduled health check on analytics Postgres table."""
        return prefect_count_task(hours)

except ImportError:  # Prefect not installed — use plain function for tests/CI.

    def review_stats_flow(hours: int = 24) -> dict:
        """Fallback when Prefect is not installed (same behavior, no orchestrator)."""
        return count_review_stats_events(hours)
