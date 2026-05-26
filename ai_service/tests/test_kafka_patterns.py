"""Unit tests for Kafka interview-demo helpers (no broker required)."""

from kafka_patterns.offsets import should_auto_commit
from kafka_patterns.reliability import validate_ingest_payload
from kafka_patterns.topics import DEFAULT_PARTITION_COUNT, partition_for_key


def test_validate_ingest_payload_accepts_review_id():
    """Happy path returns reviewId string."""
    rid, err = validate_ingest_payload({"reviewId": "abc123"})
    assert rid == "abc123"
    assert err is None


def test_validate_ingest_payload_rejects_missing_review_id():
    """Missing reviewId is a DLQ candidate."""
    rid, err = validate_ingest_payload({"at": "2020-01-01"})
    assert rid is None
    assert err == "missing_reviewId"


def test_partition_for_key_is_stable():
    """Same key maps to same partition (ordering per review demo)."""
    p1 = partition_for_key("review-42", DEFAULT_PARTITION_COUNT)
    p2 = partition_for_key("review-42", DEFAULT_PARTITION_COUNT)
    assert p1 == p2
    assert 0 <= p1 < DEFAULT_PARTITION_COUNT


def test_should_auto_commit_defaults_false(monkeypatch):
    """Manual commit is the reliability demo default."""
    monkeypatch.setenv("KAFKA_AUTO_COMMIT", "false")
    assert should_auto_commit() is False
