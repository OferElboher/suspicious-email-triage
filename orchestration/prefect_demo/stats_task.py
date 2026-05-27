"""Core stats aggregation logic — Prefect wraps this in flows.py when installed."""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone


def count_review_stats_events(hours: int = 24) -> dict:
    """
    Count review_stats_events rows in a rolling UTC window (Prefect task target).

    Uses psycopg3 against the same PostgreSQL database the Node API writes for analytics.
    Kept as a plain function so tests and CI run without a Prefect server or agent.
    """
    import psycopg

    window_start = datetime.now(timezone.utc) - timedelta(hours=hours)
    conn = psycopg.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        dbname=os.getenv("POSTGRES_DB", "triage_stats"),
        user=os.getenv("POSTGRES_USER", "triage"),
        password=os.getenv("POSTGRES_PASSWORD", "triage"),
        connect_timeout=3,
    )
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*)::int FROM review_stats_events WHERE occurred_at >= %s",
                (window_start,),
            )
            (count,) = cur.fetchone()
    finally:
        conn.close()
    return {"hours": hours, "eventCount": count, "windowStart": window_start.isoformat()}
