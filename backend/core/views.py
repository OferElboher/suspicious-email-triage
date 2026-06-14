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
from typing import Dict, Any, Optional

# JsonResponse returns compact JSON HTTP responses from Django views.
from django.http import JsonResponse, HttpRequest

# csrf_exempt keeps this demo endpoint easy to call from non-browser clients.
from django.views.decorators.csrf import csrf_exempt

# send_task publishes accepted payloads into Kafka.
from core.kafka_producer import send_task

# HTTP methods that may carry a JSON body in this demo API.
_BODY_METHODS = frozenset({"POST", "PUT", "PATCH"})


def _extract_async_payload(request: HttpRequest) -> Optional[Dict[str, Any]]:
    """
    Build the Kafka task payload from any HTTP verb.

    Pattern: POST/PUT/PATCH read JSON body; GET/DELETE/HEAD merge query string
    parameters into a dict. Long-running work always queues — the view never blocks
    on worker completion regardless of verb.
    """
    if request.method in _BODY_METHODS:
        if not request.body:
            return {}
        try:
            parsed = json.loads(request.body)
        except json.JSONDecodeError:
            return None
        if not isinstance(parsed, dict):
            return None
        return parsed

    # GET and other idempotent-style verbs still may trigger heavy async jobs.
    query_payload = {key: values[-1] for key, values in request.GET.lists()}
    return query_payload if query_payload else {}


@csrf_exempt
def submit_task(request):
    """
    Submit AI task to distributed processing pipeline.

    Role in system
    --------------
    Main REST entrypoint for asynchronous AI processing.

    Flow
    ----
    Client → HTTP (any verb) → submit_task()
           → send_task()
           → Kafka
           → Consumer
           → Celery
           → Worker

    Request
    -------
    POST /api/submit  (JSON body — typical)
    GET  /api/submit?task=analyze_text&text=hello  (query params — also queued)

    Behavior
    --------
    - Parses JSON body (POST/PUT/PATCH) or query string (GET/DELETE)
    - Sends task to Kafka without waiting for worker completion
    - Returns immediately with { "status": "queued" }

    Returns
    -------
    JsonResponse

    Notes
    -----
    Production email triage uses the Node `POST /reviews` → Kafka `email.review.ingested`
    path and Celery `analyze_review`. This Django route is a legacy/demo enqueue surface.
    """

    if request.method not in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"}:
        return JsonResponse({"error": "method_not_allowed"}, status=405)

    data = _extract_async_payload(request)
    if data is None:
        return JsonResponse({"error": "Invalid JSON body"}, status=400)

    # Attach metadata so downstream consumers know which HTTP verb initiated the job.
    data.setdefault("_httpMethod", request.method)

    send_task(data)

    return JsonResponse({"status": "queued", "method": request.method})
