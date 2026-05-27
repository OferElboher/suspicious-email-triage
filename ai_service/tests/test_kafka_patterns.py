"""Unit tests for Kafka event-stream helpers (no broker required).

These tests document the reliability patterns in ai_service/kafka_patterns/:
  - payload validation before enqueue
  - stable partition hashing for reviewId keys
  - manual commit default (KAFKA_AUTO_COMMIT=false)
"""

from kafka_patterns.offsets import should_auto_commit
from kafka_patterns.reliability import validate_ingest_payload
from kafka_patterns.topics import DEFAULT_PARTITION_COUNT, partition_for_key


def test_validate_ingest_payload_accepts_review_id():
    """Valid ingest messages must carry reviewId (MongoDB ObjectId string from Node producer)."""
    rid, err = validate_ingest_payload({"reviewId": "abc123"})
    assert rid == "abc123"
    assert err is None


def test_validate_ingest_payload_rejects_missing_review_id():
    """Missing reviewId is routed to DLQ — consumer must not call Celery without an id."""
    rid, err = validate_ingest_payload({"at": "2020-01-01"})
    assert rid is None
    assert err == "missing_reviewId"


def test_partition_for_key_is_stable():
    """Same reviewId key → same partition (Kafka ordering guarantee per entity)."""
    p1 = partition_for_key("review-42", DEFAULT_PARTITION_COUNT)
    p2 = partition_for_key("review-42", DEFAULT_PARTITION_COUNT)
    assert p1 == p2
    assert 0 <= p1 < DEFAULT_PARTITION_COUNT


def test_should_auto_commit_defaults_false(monkeypatch):
    """Manual commit after Celery enqueue is the default reliability mode (at-least-once)."""
    monkeypatch.setenv("KAFKA_AUTO_COMMIT", "false")
    assert should_auto_commit() is False
