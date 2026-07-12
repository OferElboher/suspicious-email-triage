"""
Pre-LLM guardrails — run during INTAKE before any cloud provider call.

Pattern: fail-closed on injection; mask PII; enforce size/token budgets.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

from app.guardrails.pii import mask_review_fields
from app.guardrails.policy import detect_prompt_injection


@dataclass
class PreGuardrailResult:
    """Outcome of INTAKE guardrails — sanitized review or hard-fail signal."""

    ok: bool
    review: dict[str, Any]
    events: list[dict[str, Any]] = field(default_factory=list)
    hard_fail: bool = False
    reason: str = ""


def _estimate_tokens(text: str) -> int:
    """Rough token estimate (~4 chars per token) — sufficient for budget guardrails."""
    return max(1, len(text) // 4)


def run_pre_llm_guardrails(review: dict[str, Any]) -> PreGuardrailResult:
    """
    Apply all pre-LLM checks to a Mongo review document.

    Returns hard_fail=True when the message must not be scored by LLM (injection, oversize).
    """
    events: list[dict[str, Any]] = []
    body = str(review.get("body") or "")
    subject = str(review.get("subject") or "")
    combined = f"{subject}\n{body}"

    if os.environ.get("AGENT_PROMPT_INJECTION_FILTER_ENABLED", "true").lower() == "true":
        if detect_prompt_injection(combined):
            return PreGuardrailResult(
                ok=False,
                review=review,
                events=[{"stage": "pre", "rule": "prompt_injection", "action": "hard_fail"}],
                hard_fail=True,
                reason="prompt_injection_detected",
            )

    max_body = int(os.environ.get("AGENT_MAX_BODY_CHARS", "8000"))
    if len(body) > max_body:
        trimmed = body[:max_body]
        review = {**review, "body": trimmed}
        events.append(
            {"stage": "pre", "rule": "size_cap", "action": "truncated", "maxChars": max_body}
        )

    max_tokens = int(os.environ.get("AGENT_MAX_INPUT_TOKENS", "6000"))
    if _estimate_tokens(combined) > max_tokens:
        return PreGuardrailResult(
            ok=False,
            review=review,
            events=            events
            + [
                {
                    "stage": "pre",
                    "rule": "token_budget",
                    "action": "hard_fail",
                    "maxTokens": max_tokens,
                }
            ],
            hard_fail=True,
            reason="input_token_budget_exceeded",
        )

    blocked = [
        t.strip().lower()
        for t in os.environ.get("AGENT_BLOCKED_TOPICS", "").split(",")
        if t.strip()
    ]
    lowered = combined.lower()
    for topic in blocked:
        if topic and topic in lowered:
            return PreGuardrailResult(
                ok=False,
                review=review,
                events=events
                + [
                    {
                        "stage": "pre",
                        "rule": "topic_blocklist",
                        "action": "hard_fail",
                        "topic": topic,
                    }
                ],
                hard_fail=True,
                reason="blocked_topic",
            )

    if os.environ.get("AGENT_PII_MASK_ENABLED", "true").lower() == "true":
        masked_review, pii_events = mask_review_fields(review)
        review = masked_review
        events.extend(pii_events)

    return PreGuardrailResult(ok=True, review=review, events=events)
