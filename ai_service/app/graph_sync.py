"""
Notify the Node API to re-sync a review into Neo4j after Celery analysis completes.

Celery owns Mongo writes; Neo4j upserts live in the backend so one driver stack is maintained.
"""

from __future__ import annotations

import os

import requests

from app.logutil import log_line


def graph_sync_enabled() -> bool:
    """True when worker should POST to backend graph internal sync endpoint."""
    flag = os.environ.get("NEO4J_ENABLED", "true").lower()
    return flag not in ("false", "0", "")


def sync_review_graph(review_id: str) -> bool:
    """
    POST /graph/internal/sync/:id with a shared service token.

    Returns True on HTTP 2xx; False when disabled or unreachable (non-fatal for scoring).
    """
    if not graph_sync_enabled():
        return False

    base = os.environ.get("BACKEND_INTERNAL_URL", "http://backend:3000").rstrip("/")
    token = os.environ.get("GRAPH_INTERNAL_TOKEN", "dev-graph-sync-token")
    url = f"{base}/graph/internal/sync/{review_id}"
    headers = {"X-Graph-Internal-Token": token}

    try:
        response = requests.post(url, headers=headers, timeout=10)
        if response.status_code >= 400:
            log_line(
                "warn",
                "graph_sync",
                "backend returned error",
                reviewId=review_id,
                status=response.status_code,
            )
            return False
        log_line("info", "graph_sync", "neo4j sync requested", reviewId=review_id)
        return True
    except Exception as exc:  # noqa: BLE001 — graph sync must not fail Celery task
        log_line(
            "warn",
            "graph_sync",
            "request failed",
            reviewId=review_id,
            error=str(exc),
        )
        return False
