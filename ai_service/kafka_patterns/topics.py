"""Topic naming and partition defaults for the review-ingest pipeline demo."""

import os

# Primary domain event: a review was persisted and should be scored asynchronously.
TOPIC_REVIEW_INGEST = os.environ.get("KAFKA_TOPIC_REVIEW_INGEST", "email.review.ingested")

# Dead-letter queue for poison messages (missing reviewId, bad JSON, repeated failures).
TOPIC_REVIEW_DLQ = os.environ.get("KAFKA_TOPIC_REVIEW_DLQ", "email.review.ingested.dlq")

# Consumer group for the Python dispatcher (competing consumers share partitions).
GROUP_DISPATCHER = os.environ.get("KAFKA_GROUP_DISPATCHER", "triage-dispatcher")

# Dev default >1 partition so running two dispatchers demonstrates group rebalancing.
DEFAULT_PARTITION_COUNT = int(os.environ.get("KAFKA_TOPIC_PARTITIONS", "3"))


def partition_for_key(key: str | None, partition_count: int) -> int:
    """Deterministic partition from message key (same reviewId → same partition)."""
    if not key or partition_count <= 1:
        return 0
    return abs(hash(key)) % partition_count
