"""
Celery AI tasks.

Role in system
--------------
Executes AI processing logic.

Flow
----
Kafka → Consumer → Celery → THIS MODULE → Worker → (optional DB)

Responsibilities
---------------
- Run AI models
- Process input payload
- Save results
- Return status

This is the compute layer of the distributed architecture.
"""

# shared_task registers functions with whichever Celery app Django loads.
from celery import shared_task


@shared_task
def ping():
    # Tiny smoke-test task used to confirm Celery worker execution.
    return "pong"


@shared_task
def add(x: int, y: int) -> int:
    """
    Example Celery computation task.

    Role in system
    --------------
    Demonstrates async worker execution triggered
    by Kafka consumer.

    Flow
    ----
    REST → Kafka → Consumer → add.delay() → Celery Worker → result

    Parameters
    ----------
    x : int
        First operand

    y : int
        Second operand

    Returns
    -------
    int
        Sum of x and y

    Example
    -------
    Incoming Kafka message:

        {
            "x": 2,
            "y": 3
        }

    Consumer triggers:

        add.delay(2, 3)

    Worker executes:

        add(2, 3) → 5

    Async Behavior
    --------------
    This task runs in a separate Celery worker process.
    Multiple workers may execute this task in parallel.

    Notes
    -----
    This is currently a demo computation task.
    In production this function would:

    - run AI model
    - call LLM
    - process documents
    - run inference
    - store results in DB
    """
    # Return a deterministic value so tests and demos stay easy to reason about.
    return x + y
