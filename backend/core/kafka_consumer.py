"""
Kafka consumer.

Role in system
--------------
Consumes Kafka events and forwards them to Celery workers.

Flow
----
Kafka → Consumer → Celery → AI Worker

Responsibilities
---------------
- Subscribe to topic
- Deserialize events
- Send Celery tasks

This layer bridges event streaming with async worker processing.
"""

# json deserializes Kafka message bytes back into Python dictionaries.
import json

# os reads broker settings from the environment.
import os

# Dict/Any document the expected JSON message shape.
from typing import Dict, Any

# KafkaConsumer is the long-running Kafka client for this Django-side path.
from kafka import KafkaConsumer

# add is the demo Celery task triggered from consumed messages.
from core.tasks import add


# Kafka topic to subscribe to.
TOPIC_NAME = "ai_tasks"


# Global Kafka consumer instance.
# Runs as a long-lived process that continuously listens for new events coming from REST API via Kafka producer.
consumer = KafkaConsumer(
    TOPIC_NAME,
    bootstrap_servers=os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092"),
    value_deserializer=lambda m: json.loads(m.decode("utf-8")),
)


def start() -> None:
    """
    Start Kafka consumer loop.

    Role in system
    --------------
    Event ingestion layer that converts Kafka messages into Celery async tasks.

    Flow
    ----
    Kafka → start() → Celery task → Worker

    Behavior
    --------
    - Blocks forever
    - Waits for Kafka messages
    - Deserializes JSON payload
    - Sends Celery task asynchronously

    Message Format
    --------------
    Expected Kafka message payload:

    {
        "x": 1,
        "y": 2
    }

    Processing
    ----------
    Each message triggers:

        add.delay(x, y)

    which runs asynchronously in Celery worker.

    Returns
    -------
    None

    Notes
    -----
    This function runs forever and should be started in a dedicated process:

        python manage.py run_kafka_consumer

    Multiple consumers may run in parallel for horizontal scaling.
    """

    for message in consumer:
        # message.value is already decoded by value_deserializer above.
        data: Dict[str, Any] = message.value

        # Forward message to a Celery worker without blocking this consumer loop.
        add.delay(data["x"], data["y"])
