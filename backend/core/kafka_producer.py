"""
Kafka producer.

Role in system
--------------
Publishes events/tasks from the REST API into the distributed processing pipeline Kafka topic.
This is the event ingress into the distributed processing pipeline.

Flow
----
Client → Django REST API → Kafka Producer → Kafka Topic → Consumer → Celery → Worker

Responsibilities
---------------
- Serialize events
- Decouple REST from workers
- Serialize task payloads to JSON
- Send messages to Kafka topic "ai_tasks"
- Decouple REST API from async processing layer

Used by
-------
core.views
REST endpoints enqueue async AI work via send_task()

Depends on
----------
Kafka broker running on localhost:9092
"""

# json serializes Python dict payloads into Kafka message bytes.
import json

# time.sleep spaces out retry attempts while Kafka is starting.
import time

# Dict/Any describe flexible task payloads passed from views to Kafka.
from typing import (
    Dict,
    Any,
)  # Must precede the import from kafka in order to avoid linting erros along commit!

# KafkaProducer is the client used by Django endpoints to publish events.
from kafka import KafkaProducer


# Kafka topic used for AI processing tasks
TOPIC_NAME = "ai_tasks"


# Global Kafka producer instance.
# This producer is reused across all REST requests to avoid reconnecting to Kafka for every message.
producer = None


def get_producer() -> KafkaProducer:
    # producer is module-scoped so multiple requests reuse one connection.
    global producer
    while producer is None:
        try:
            # bootstrap_servers points at the Kafka broker visible to this process.
            producer = KafkaProducer(
                bootstrap_servers="localhost:9092",
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            )
        except Exception:
            # Kafka may start after Django in local dev, so retry gently.
            print("Kafka not ready, retrying in 2 seconds...")
            time.sleep(2)
    return producer


def send_task(data: Dict[str, Any]) -> None:
    """
    Send task message to Kafka.

    Role in system
    --------------
    Entry point into distributed async processing pipeline.
    Called by REST API views to enqueue AI work.

    Flow
    ----
    REST API → send_task() → Kafka → Consumer → Celery → Worker

    Parameters
    ----------
    data : dict
        JSON-serializable task payload.

        Example:
        {
            "task": "analyze_text",
            "text": "hello world"
        }

    Returns
    -------
    None

    Side Effects
    ------------
    - Sends message to Kafka topic "ai_tasks"
    - Flushes producer buffer

    Async Behavior
    --------------
    The task is processed asynchronously after being consumed by Kafka consumer and forwarded to Celery workers.

    Notes
    -----
    producer.flush() ensures message delivery before returning.
    This is safer but slightly slower, that can be removed later for higher throughput.
    """
    # producer_instance avoids shadowing the module-level producer variable.
    producer_instance = get_producer()

    # Send the payload to the shared AI task topic.
    producer_instance.send(TOPIC_NAME, data)

    # Flush before returning so callers know the broker accepted the message.
    producer_instance.flush()
