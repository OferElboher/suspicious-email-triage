"""Offset commit helpers — manual commit after successful downstream handoff."""

import os
from typing import Any


def should_auto_commit() -> bool:
    """Return True when KAFKA_AUTO_COMMIT=true (legacy at-most-once demo mode)."""
    return os.environ.get("KAFKA_AUTO_COMMIT", "false").lower() == "true"


def commit_message_offset(consumer: Any, message: Any) -> None:
    """
    Commit a single message offset (manual commit path).

    Called only after Celery enqueue succeeds so a crash before commit can retry.
    Lazy-imports kafka structs so unit tests do not require kafka-python at import time.
    """
    from kafka.structs import OffsetAndMetadata, TopicPartition

    tp = TopicPartition(message.topic, message.partition)
    consumer.commit({tp: OffsetAndMetadata(message.offset + 1, None)})
