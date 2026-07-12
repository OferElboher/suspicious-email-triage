"""
PII masking — regex redaction before text is sent to a cloud LLM.

Pattern: deterministic local redaction (no paid Comprehend API required in dev).
Technology: compiled regular expressions replace emails, phones, and card-like numbers.
"""

from __future__ import annotations

import re
from typing import Any

# Email addresses — common PII in suspicious-email triage prompts.
_EMAIL_RE = re.compile(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b")

# North-American style phone numbers (loose match for demo guardrails).
_PHONE_RE = re.compile(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b")

# Credit-card-like digit groups (16 digits with optional separators).
_PAN_RE = re.compile(r"\b(?:\d[ -]*?){13,16}\b")


def mask_pii_text(text: str) -> tuple[str, list[dict[str, Any]]]:
    """
    Return redacted text and audit events for each replacement type applied.

    Events are stored on agentTrace.guardrailEvents for SOC audit trails.
    """
    events: list[dict[str, Any]] = []
    masked = text

    if _EMAIL_RE.search(masked):
        masked = _EMAIL_RE.sub("[EMAIL_REDACTED]", masked)
        events.append({"stage": "pre", "rule": "pii_mask", "field": "email", "action": "redacted"})

    if _PHONE_RE.search(masked):
        masked = _PHONE_RE.sub("[PHONE_REDACTED]", masked)
        events.append({"stage": "pre", "rule": "pii_mask", "field": "phone", "action": "redacted"})

    if _PAN_RE.search(masked):
        masked = _PAN_RE.sub("[PAN_REDACTED]", masked)
        events.append({"stage": "pre", "rule": "pii_mask", "field": "pan", "action": "redacted"})

    return masked, events


def mask_review_fields(review: dict[str, Any]) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Apply PII masking to review body/subject/sender fields used in LLM prompts."""
    copy = dict(review)
    all_events: list[dict[str, Any]] = []

    for field in ("body", "subject", "senderEmail"):
        raw = str(copy.get(field) or "")
        if not raw:
            continue
        masked, events = mask_pii_text(raw)
        copy[field] = masked
        for ev in events:
            ev = dict(ev)
            ev["reviewField"] = field
            all_events.append(ev)

    return copy, all_events
