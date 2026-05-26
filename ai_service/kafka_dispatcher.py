"""Consume Kafka ingest topic and dispatch Celery `analyze_review` tasks."""

import json
import os
import signal
import sys

from kafka import KafkaConsumer, KafkaProducer

from app.logutil import log_line
from app.tasks import analyze_review
from kafka_patterns.offsets import commit_message_offset, should_auto_commit
from kafka_patterns.reliability import publish_dlq, validate_ingest_payload
from kafka_patterns.topics import GROUP_DISPATCHER, TOPIC_REVIEW_INGEST


def main():
    """Long-lived dispatcher loop with optional manual commits and DLQ routing."""
    brokers = os.environ.get("KAFKA_BROKERS", "localhost:9092").split(",")
    topic = os.environ.get("KAFKA_TOPIC_REVIEW_INGEST", TOPIC_REVIEW_INGEST)
    group = os.environ.get("KAFKA_GROUP_DISPATCHER", GROUP_DISPATCHER)
    auto_commit = should_auto_commit()

    consumer = KafkaConsumer(
        topic,
        bootstrap_servers=brokers,
        group_id=group,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
        auto_offset_reset="earliest",
        enable_auto_commit=auto_commit,
    )
    # DLQ producer shares the same broker list (fire-and-forget poison messages).
    dlq_producer = KafkaProducer(bootstrap_servers=brokers)

    stop = False

    def _handle_sig(*_args):
        nonlocal stop
        stop = True

    signal.signal(signal.SIGINT, _handle_sig)
    signal.signal(signal.SIGTERM, _handle_sig)

    log_line(
        "info",
        "kafka-dispatch",
        "consumer started",
        kafkaTopic=topic,
        consumerGroup=group,
        autoCommit=auto_commit,
    )

    for msg in consumer:
        if stop:
            break
        payload = msg.value or {}
        review_id, error = validate_ingest_payload(payload)
        if error:
            log_line(
                "warn",
                "kafka-dispatch",
                "invalid message -> dlq",
                reason=error,
                payload=payload,
            )
            publish_dlq(dlq_producer, msg, error)
            if not auto_commit:
                commit_message_offset(consumer, msg)
            continue

        analyze_review.delay(review_id)
        log_line(
            "info",
            "kafka-dispatch",
            "dispatched",
            reviewId=review_id,
            partition=msg.partition,
        )
        if not auto_commit:
            commit_message_offset(consumer, msg)

    dlq_producer.flush()
    dlq_producer.close()
    consumer.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
