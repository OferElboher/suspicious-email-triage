"""Reliability patterns: validate payloads, DLQ routing, idempotent dispatch keys."""

import json
from typing import Any

from .topics import TOPIC_REVIEW_DLQ


def validate_ingest_payload(payload: dict | None) -> tuple[str | None, str | None]:
    """
    Validate ingest message body.

    Returns (review_id, error_reason). error_reason is set when message should go to DLQ.
    """
    if not payload or not isinstance(payload, dict):
        return None, "invalid_payload"
    review_id = payload.get("reviewId")
    if not review_id:
        return None, "missing_reviewId"
    return str(review_id), None


def publish_dlq(producer: Any, original_message: Any, reason: str) -> None:
    """
    Send poison/failed message to DLQ with error metadata (reliability interview talking point).

    Preserves original value and adds reason + source offset for replay/debug.
    """
    body = {
        "reason": reason,
        "sourceTopic": original_message.topic,
        "sourcePartition": original_message.partition,
        "sourceOffset": original_message.offset,
        "originalValue": original_message.value,
    }
    encoded = json.dumps(body, default=str).encode("utf-8")
    key_bytes = original_message.key if isinstance(original_message.key, bytes) else None
    producer.send(TOPIC_REVIEW_DLQ, key=key_bytes, value=encoded)
