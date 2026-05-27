"""
Prefect flow demo — orchestrates stats health checks (optional Prefect runtime).

Prefect patterns used:
  @task  — unit of retriable work (here: count Postgres events)
  @flow  — composes tasks; becomes the schedulable entrypoint in Prefect Cloud/UI

When Prefect is not installed, review_stats_flow falls back to the plain function.
"""

from orchestration.prefect_demo.stats_task import count_review_stats_events

try:
    from prefect import flow, task

    @task(name="count-review-stats-events")
    def prefect_count_task(hours: int = 24) -> dict:
        """Prefect @task wrapper — same logic as stats_task, observable in Prefect UI."""
        return count_review_stats_events(hours)

    @flow(name="review-stats-health-check")
    def review_stats_flow(hours: int = 24) -> dict:
        """Prefect @flow entrypoint: 'did analytics events arrive in the last N hours?'"""
        return prefect_count_task(hours)

except ImportError:  # Prefect optional — CI/tests use plain function path.

    def review_stats_flow(hours: int = 24) -> dict:
        """Fallback when prefect package is not installed (identical behavior, no orchestrator)."""
        return count_review_stats_events(hours)
