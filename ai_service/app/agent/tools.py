"""
Agent tool registry — allowlisted actions (DB queries + internal HTTP APIs).

Pattern: JSON-schema tool definitions; orchestrator executes, never arbitrary code.
Technology: requests for Node internal routes; pymongo/psycopg for local DB reads.
"""

from __future__ import annotations

import os
import time
from typing import Any, Callable

import requests
from bson import ObjectId

from app.mongo import get_db
from app.rule_engine import run_rule_engine

# Tool JSON schemas sent to Bedrock Converse / Vertex function calling / mock-cloud-llm.
TOOL_SPECS: list[dict[str, Any]] = [
    {
        "name": "run_rule_engine",
        "description": "Run deterministic phishing heuristics on the review document.",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    },
    {
        "name": "get_review_by_id",
        "description": "Load the full Mongo review document by id.",
        "input_schema": {
            "type": "object",
            "properties": {"review_id": {"type": "string"}},
            "required": ["review_id"],
        },
    },
    {
        "name": "query_review_stats",
        "description": "Fetch recent PostgreSQL stats events for a review id.",
        "input_schema": {
            "type": "object",
            "properties": {"review_id": {"type": "string"}, "limit": {"type": "integer"}},
            "required": ["review_id"],
        },
    },
    {
        "name": "get_graph_neighborhood",
        "description": "Fetch Neo4j neighborhood subgraph for campaign linkage.",
        "input_schema": {
            "type": "object",
            "properties": {
                "review_id": {"type": "string"},
                "depth": {"type": "integer", "minimum": 1, "maximum": 2},
            },
            "required": ["review_id"],
        },
    },
    {
        "name": "lookup_sender_history",
        "description": "List recent reviews from the same sender email.",
        "input_schema": {
            "type": "object",
            "properties": {
                "sender_email": {"type": "string"},
                "limit": {"type": "integer", "minimum": 1, "maximum": 10},
            },
            "required": ["sender_email"],
        },
    },
]


def _agent_token() -> str:
    """Shared secret for Celery → Node internal agent routes (never log the value)."""
    return os.environ.get("AGENT_INTERNAL_SERVICE_TOKEN") or os.environ.get(
        "GRAPH_INTERNAL_TOKEN", "dev-graph-sync-token"
    )


def _backend_base() -> str:
    """Node API base URL inside Docker Compose network."""
    return os.environ.get("AGENT_BACKEND_BASE_URL", "http://backend:3000").rstrip("/")


def _http_timeout_sec() -> float:
    """Tool HTTP timeout — keeps agent wall clock bounded."""
    return float(os.environ.get("AGENT_TOOL_HTTP_TIMEOUT_MS", "5000")) / 1000.0


def _internal_get(path: str) -> dict[str, Any]:
    """GET an agent-internal backend route with the service token header."""
    url = f"{_backend_base()}{path}"
    headers = {"X-Agent-Internal-Token": _agent_token()}
    response = requests.get(url, headers=headers, timeout=_http_timeout_sec())
    response.raise_for_status()
    return response.json()


def _tool_run_rule_engine(_: dict[str, Any], review: dict[str, Any]) -> dict[str, Any]:
    """Local function tool — wraps existing deterministic rule_engine."""
    verdict, action, findings, followups = run_rule_engine(review)
    return {
        "verdict": verdict,
        "recommendedAction": action,
        "findings": findings,
        "followUpQuestions": followups,
    }


def _tool_get_review_by_id(args: dict[str, Any], _: dict[str, Any]) -> dict[str, Any]:
    """Mongo lookup — used when orchestrator needs a fresh document snapshot."""
    review_id = str(args.get("review_id") or "")
    doc = get_db().reviews.find_one({"_id": ObjectId(review_id)})
    if not doc:
        return {"found": False}
    doc["id"] = str(doc.pop("_id"))
    return {"found": True, "review": doc}


def _tool_query_review_stats(args: dict[str, Any], _: dict[str, Any]) -> dict[str, Any]:
    """PostgreSQL stats snippet — same table used by analytics charts."""
    review_id = str(args.get("review_id") or "")
    limit = int(args.get("limit") or 5)
    try:
        import psycopg

        url = os.environ.get(
            "STATISTICS_PG_URL",
            "postgres://triage:triage@postgres:5432/triage_stats",
        )
        with psycopg.connect(url, connect_timeout=2) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT status, verdict, occurred_at::text
                    FROM review_stats_events
                    WHERE review_id = %s
                    ORDER BY occurred_at DESC
                    LIMIT %s
                    """,
                    (review_id, limit),
                )
                rows = cur.fetchall()
        return {
            "events": [
                {"status": r[0], "verdict": r[1], "occurredAt": r[2]} for r in rows
            ]
        }
    except Exception as exc:  # noqa: BLE001 — optional enrichment tool
        return {"events": [], "error": str(exc)}


def _tool_get_graph_neighborhood(args: dict[str, Any], _: dict[str, Any]) -> dict[str, Any]:
    """HTTP tool — Neo4j neighborhood via Node agent-internal route."""
    review_id = str(args.get("review_id") or "")
    depth = int(args.get("depth") or 1)
    return _internal_get(f"/agent/internal/graph/review/{review_id}/neighborhood?depth={depth}")


def _tool_lookup_sender_history(args: dict[str, Any], _: dict[str, Any]) -> dict[str, Any]:
    """HTTP tool — recent reviews for repeat-sender workflow branch."""
    email = str(args.get("sender_email") or "")
    limit = int(args.get("limit") or 5)
    encoded = requests.utils.quote(email, safe="")
    return _internal_get(f"/agent/internal/sender-history?email={encoded}&limit={limit}")


# Static registry maps tool name → executor callable.
_TOOL_EXECUTORS: dict[str, Callable[[dict[str, Any], dict[str, Any]], dict[str, Any]]] = {
    "run_rule_engine": _tool_run_rule_engine,
    "get_review_by_id": _tool_get_review_by_id,
    "query_review_stats": _tool_query_review_stats,
    "get_graph_neighborhood": _tool_get_graph_neighborhood,
    "lookup_sender_history": _tool_lookup_sender_history,
}


def list_tool_specs() -> list[dict[str, Any]]:
    """Return tool definitions for cloud LLM toolConfig."""
    return list(TOOL_SPECS)


def execute_tool(name: str, args: dict[str, Any], review: dict[str, Any]) -> dict[str, Any]:
    """
    Execute one allowlisted tool and return a JSON-serializable result.

    Raises KeyError when the LLM requests a tool outside the registry (guardrail).
    """
    executor = _TOOL_EXECUTORS.get(name)
    if not executor:
        raise KeyError(f"tool_not_allowed:{name}")

    started = time.time()
    try:
        output = executor(args or {}, review)
        return {
            "ok": True,
            "name": name,
            "args": args,
            "output": output,
            "latencyMs": int((time.time() - started) * 1000),
        }
    except Exception as exc:  # noqa: BLE001 — tool failure must not crash orchestrator
        return {
            "ok": False,
            "name": name,
            "args": args,
            "error": str(exc),
            "latencyMs": int((time.time() - started) * 1000),
        }
