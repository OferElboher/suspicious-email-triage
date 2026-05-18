"""
REST API views.

Role in system
--------------
Entry point of distributed AI pipeline.

Flow
----
Client → REST API → Kafka Producer → Kafka → Consumer → Celery → AI Worker → DB

Responsibilities
---------------
- Accept HTTP requests
- Validate input
- Publish Kafka events
- Return immediate response

This layer performs NO AI processing.
It only queues work asynchronously.
"""

# json parses request bodies from bytes into Python dictionaries.
import json

# Dict/Any describe the flexible JSON payload sent through Kafka.
from typing import Dict, Any

# JsonResponse returns compact JSON HTTP responses from Django views.
from django.http import JsonResponse

# csrf_exempt keeps this demo endpoint easy to call from non-browser clients.
from django.views.decorators.csrf import csrf_exempt

# send_task publishes accepted payloads into Kafka.
from core.kafka_producer import send_task


@csrf_exempt
def submit_task(request):
    """
    Submit AI task to distributed processing pipeline.

    Role in system
    --------------
    Main REST entrypoint for asynchronous AI processing.

    Flow
    ----
    Client → HTTP POST → submit_task()
           → send_task()
           → Kafka
           → Consumer
           → Celery
           → Worker

    Request
    -------
    POST /api/submit

    Body (JSON)
    -----------
    {
        "task": "analyze_text",
        "text": "hello world"
    }

    Behavior
    --------
    - Parses incoming JSON request
    - Sends task to Kafka
    - Returns immediately

    Returns
    -------
    JsonResponse

    Example response
    ----------------
    {
        "status": "queued"
    }

    Notes
    -----
    This endpoint does NOT wait for AI processing.
    It only enqueues the task asynchronously.
    """

    if request.method != "POST":
        # Only POST carries a payload that can be queued for asynchronous work.
        return JsonResponse({"error": "POST method required"}, status=405)

    try:
        # Parse incoming JSON once; validation can be expanded as the contract grows.
        data: Dict[str, Any] = json.loads(request.body)
    except json.JSONDecodeError:
        # Return a gentle client error when the body is not JSON.
        return JsonResponse({"error": "Invalid JSON"}, status=400)

    # Publish to Kafka and return immediately; processing continues elsewhere.
    send_task(data)

    return JsonResponse({"status": "queued"})
