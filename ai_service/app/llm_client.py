"""
Unified LLM client for Celery scoring.

Supports Ollama, mock commercial (OpenAI API shape), or disabled stub.
"""

from __future__ import annotations

import json
import os
import re
from typing import Any

import requests

from app.llm_ollama import analyze_with_ollama


def _disabled_stub() -> dict[str, Any]:
    """Deterministic payload when DISABLE_LLM=true (no network, stable CI)."""
    return {
        "verdict": "benign",
        "recommendedAction": "close",
        "summary": "LLM disabled (python stub)",
        "findings": [],
        "followUpQuestions": [],
    }


def _llm_provider() -> str:
    """Active provider name when LLM is enabled."""
    return os.environ.get("LLM_PROVIDER", "ollama").lower()


def _fetch_pg_context(review_id: str | None) -> str:
    """Optional PostgreSQL snippet: recent stats events for this review (SQL context for prompt)."""
    if not review_id:
        return ""
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
                    LIMIT 3
                    """,
                    (review_id,),
                )
                rows = cur.fetchall()
        if not rows:
            return "PostgreSQL stats: no prior events for this review."
        lines = [f"  status={r[0]} verdict={r[1]} at={r[2]}" for r in rows]
        return "PostgreSQL stats (recent events):\n" + "\n".join(lines)
    except Exception as exc:  # noqa: BLE001 — context is optional enrichment
        return f"PostgreSQL stats unavailable: {exc}"


def _build_user_prompt(review: dict[str, Any]) -> str:
    """Combine Mongo review fields + optional SQL stats for the model user message."""
    review_id = str(review.get("_id") or review.get("id") or "")
    pg_ctx = _fetch_pg_context(review_id)
    return (
        f"Sender: {review.get('senderEmail')}\n"
        f"Subject: {review.get('subject')}\n"
        f"Body: {review.get('body')}\n\n"
        f"{pg_ctx}\n"
        "Return STRICT JSON with keys: verdict, recommendedAction, summary, "
        "findings[], followUpQuestions[]."
    )


def _parse_json_content(raw: str) -> dict[str, Any]:
    """Parse model JSON; tolerate prose wrappers like real LLM APIs sometimes emit."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        match = re.search(r"\{[\s\S]*\}", raw)
        if not match:
            raise
        return json.loads(match.group(0))


def analyze_with_mock_commercial(review: dict[str, Any]) -> dict[str, Any]:
    """
    Call mock OpenAI-compatible API (Bearer LLM_API_KEY) — zero cost, production-shaped request.
    """
    base = os.environ.get("LLM_BASE_URL", "http://mock-llm:8090/v1").rstrip("/")
    url = f"{base}/chat/completions"
    api_key = os.environ.get("LLM_API_KEY", "dev-mock-key")
    model = os.environ.get("LLM_MODEL", "gpt-4o-mini")
    temperature = float(os.environ.get("LLM_TEMPERATURE", "0.2"))
    max_tokens = int(os.environ.get("LLM_MAX_TOKENS", "512"))
    system_prompt = os.environ.get(
        "LLM_SYSTEM_PROMPT",
        "You are a cybersecurity email analyst. Respond with JSON only.",
    )

    payload = {
        "model": model,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": _build_user_prompt(review)},
        ],
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    response = requests.post(url, json=payload, headers=headers, timeout=60)
    response.raise_for_status()
    data = response.json()
    content = data["choices"][0]["message"]["content"]
    parsed = _parse_json_content(content)
    usage = data.get("usage") or {}
    parsed["_llmMeta"] = {
        "provider": "mock_commercial",
        "model": model,
        "promptTokens": usage.get("prompt_tokens"),
        "completionTokens": usage.get("completion_tokens"),
        "mockCostUsd": data.get("mock_cost_usd", 0.0),
    }
    return parsed


def analyze_with_llm(review: dict[str, Any]) -> dict[str, Any]:
    """
    Factory entrypoint used by Celery — selects provider based on env flags.
    """
    if os.environ.get("DISABLE_LLM", "").lower() == "true":
        return _disabled_stub()

    provider = _llm_provider()
    if provider == "mock_commercial":
        return analyze_with_mock_commercial(review)
    return analyze_with_ollama(review)
