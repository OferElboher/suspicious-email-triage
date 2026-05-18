"""PostgreSQL statistics writer for chart events created by Python workers."""

# os reads STATISTICS_PG_URL from Docker Compose or deployment secrets.
import os

# psycopg writes narrow status events to PostgreSQL without touching MongoDB stats.
import psycopg

# log_line reports non-fatal stats-write failures into the merged log.
from app.logutil import log_line

# _conn is reused by the Celery worker process after first connection.
_conn = None


def _url() -> str:
    """Return the PostgreSQL URL used for chart statistics."""
    # STATISTICS_PG_URL defaults to local dev PostgreSQL.
    return os.environ.get(
        "STATISTICS_PG_URL",
        "postgres://triage:triage@localhost:5432/triage_stats",
    )


def _connect():
    """Return a live PostgreSQL connection for stats writes."""
    # global keeps one connection per process for lightweight task writes.
    global _conn
    if _conn is None or _conn.closed:
        _conn = psycopg.connect(_url(), autocommit=True)
    return _conn


def ensure_schema() -> None:
    """Create the stats table if the Node API has not created it yet."""
    # conn is the reusable PostgreSQL connection for this worker.
    conn = _connect()
    # Schema matches backend/src/stats/statsPg.js.
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS review_stats_events (
          id BIGSERIAL PRIMARY KEY,
          occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          event_type TEXT NOT NULL,
          status TEXT,
          verdict TEXT,
          review_id TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_review_stats_events_time
          ON review_stats_events (occurred_at);
        CREATE INDEX IF NOT EXISTS idx_review_stats_events_type_time
          ON review_stats_events (event_type, occurred_at);
        CREATE INDEX IF NOT EXISTS idx_review_stats_events_status_time
          ON review_stats_events (status, occurred_at);
        """
    )


def record_status(review_id: str, status: str, verdict: str | None = None) -> None:
    """Write a status_changed event used by frontend status breakdown charts."""
    try:
        ensure_schema()
        _connect().execute(
            """
            INSERT INTO review_stats_events (event_type, status, verdict, review_id)
            VALUES (%s, %s, %s, %s)
            """,
            ("status_changed", status, verdict, review_id),
        )
    except Exception as exc:  # noqa: BLE001 - stats must not fail review processing
        log_line("warn", "stats", "postgres status write failed", error=str(exc))
