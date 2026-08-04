"""
Notify the Node API to POST the verdict webhook after Celery analysis completes.

Pattern: mirrors app/graph_sync.py — Python worker calls Node internal route with shared token.
Technology: requests HTTP client; non-fatal on failure (scoring already persisted in Mongo).
"""

from __future__ import annotations

import os

import requests

from app.logutil import log_line


def verdict_delivery_enabled() -> bool:
    """True when worker should request Node verdict webhook delivery."""
    flag = os.environ.get("VERDICT_DELIVERY_ENABLED", "true").lower()
    return flag not in ("false", "0", "")


def notify_verdict_delivery(review_id: str, reason: str = "analysis_complete") -> bool:
    """
    POST /ingest/internal/verdict-deliver/:id with X-Ingest-Internal-Token.

    Returns True on HTTP 2xx; False when disabled or unreachable (non-fatal for scoring).
    """
    if not verdict_delivery_enabled():
        return False

    base = os.environ.get("BACKEND_INTERNAL_URL", "http://backend:3000").rstrip("/")
    token = os.environ.get("INGEST_INTERNAL_TOKEN", "dev-ingest-internal-token")
    url = f"{base}/ingest/internal/verdict-deliver/{review_id}"
    headers = {"X-Ingest-Internal-Token": token, "Content-Type": "application/json"}

    try:
        response = requests.post(url, headers=headers, json={"reason": reason}, timeout=15)
        if response.status_code >= 400:
            log_line(
                "warn",
                "verdict_delivery",
                "backend returned error",
                reviewId=review_id,
                status=response.status_code,
            )
            return False
        log_line("info", "verdict_delivery", "webhook dispatch requested", reviewId=review_id)
        return True
    except Exception as exc:  # noqa: BLE001 — delivery must not fail Celery task
        log_line(
            "warn",
            "verdict_delivery",
            "request failed",
            reviewId=review_id,
            error=str(exc),
        )
        return False
