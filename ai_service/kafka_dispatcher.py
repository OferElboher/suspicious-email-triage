"""Consume Kafka ingest topic and dispatch Celery `analyze_review` tasks."""

# json decodes Kafka message bodies into dictionaries.
import json

# os reads broker/topic/group configuration from environment variables.
import os

# signal lets the process stop cleanly when Docker sends SIGTERM.
import signal

# sys provides the process exit code at module entry.
import sys

# KafkaConsumer reads new review events from the Kafka-compatible broker.
from kafka import KafkaConsumer

# log_line writes into the shared JSON-lines log.
from app.logutil import log_line

# analyze_review is the Celery task scheduled for each review ID.
from app.tasks import analyze_review


def main():
    # brokers lists Kafka endpoints; dev uses local Redpanda inside Docker.
    brokers = os.environ.get("KAFKA_BROKERS", "localhost:9092").split(",")
    # topic is where the Node API publishes new review IDs.
    topic = os.environ.get("KAFKA_TOPIC_REVIEW_INGEST", "email.review.ingested")
    # group gives this dispatcher a stable consumer group identity.
    group = os.environ.get("KAFKA_GROUP_DISPATCHER", "triage-dispatcher")

    # consumer is the long-lived Kafka subscription for ingest events.
    consumer = KafkaConsumer(
        topic,
        bootstrap_servers=brokers,
        group_id=group,
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
        auto_offset_reset="earliest",
        enable_auto_commit=True,
    )

    # stop is flipped by signal handlers so the loop can close the consumer.
    stop = False

    def _handle_sig(*_args):
        # Mark the loop for shutdown; actual close happens after the current message.
        nonlocal stop
        stop = True

    # Register graceful shutdown for local Ctrl+C and container stop.
    signal.signal(signal.SIGINT, _handle_sig)
    signal.signal(signal.SIGTERM, _handle_sig)

    log_line("info", "kafka-dispatch", "consumer started", kafkaTopic=topic)
    for msg in consumer:
        # Respect shutdown after the current poll/message cycle.
        if stop:
            break
        # Payload should be {"reviewId": "..."}; tolerate empty messages.
        payload = msg.value or {}
        # rid is the MongoDB Review id to pass into Celery.
        rid = payload.get("reviewId")
        if not rid:
            log_line("warn", "kafka-dispatch", "missing reviewId", payload=payload)
            continue
        # Schedule scoring asynchronously; the dispatcher does not do heavy work.
        analyze_review.delay(rid)
        log_line("info", "kafka-dispatch", "dispatched", reviewId=rid)

    # Close the Kafka consumer so offsets/network resources are released cleanly.
    consumer.close()
    return 0


if __name__ == "__main__":
    # CLI entrypoint used by Docker Compose.
    sys.exit(main())
