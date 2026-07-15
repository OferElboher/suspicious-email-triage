"""
Guardrail policy helpers — prompt injection patterns and verdict floors.

Pattern: rule engine remains authoritative; agent output cannot downgrade risky verdicts.
"""

from __future__ import annotations

import re
from typing import Any

# Classic prompt-injection phrases that must never reach the model verbatim.
_INJECTION_PATTERNS = (
    re.compile(r"ignore\s+previous\s+instructions", re.I),
    re.compile(r"ignore\s+all\s+prior", re.I),
    re.compile(r"^system\s*:", re.I | re.M),
    re.compile(r"</s>", re.I),
    re.compile(r"<\|im_start\|>", re.I),
)

# Severity ordering for verdict floor comparisons (higher rank = more severe).
_VERDICT_RANK = {
    "benign": 0,
    "suspicious": 1,
    "likely_phishing": 2,
}


def detect_prompt_injection(text: str) -> bool:
    """Return True when body/subject contains blocked injection patterns."""
    for pattern in _INJECTION_PATTERNS:
        if pattern.search(text):
            return True
    return False


def verdict_rank(verdict: str | None) -> int:
    """Map verdict label to numeric severity for floor comparisons."""
    return _VERDICT_RANK.get(str(verdict or "").lower(), 0)


def apply_verdict_floor(rule_verdict: str, llm_verdict: str) -> str:
    """Never allow LLM/agent to output a verdict below rule_engine severity."""
    if verdict_rank(llm_verdict) < verdict_rank(rule_verdict):
        return rule_verdict
    return llm_verdict


def normalize_recommended_action(verdict: str, action: str | None) -> str:
    """Keep recommendedAction consistent with final verdict (post-guardrail correction)."""
    if verdict == "benign":
        return "close"
    if verdict == "likely_phishing":
        return "report_and_block"
    if verdict == "suspicious":
        return action if action in ("investigate", "report_and_block") else "investigate"
    return action or "investigate"


def strip_unsafe_findings(
    findings: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Remove findings that accidentally echo credentials or JWT-like strings.

    Returns cleaned findings and guardrail audit events.
    """
    events: list[dict[str, Any]] = []
    safe: list[dict[str, Any]] = []
    jwt_hint = re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9._-]+")

    for item in findings or []:
        text = f"{item.get('explanation', '')} {item.get('evidence', '')}"
        lowered = text.lower()
        if jwt_hint.search(text) or "password:" in lowered or "api_key=" in lowered:
            events.append(
                {
                    "stage": "post",
                    "rule": "content_safety",
                    "action": "stripped_finding",
                }
            )
            continue
        safe.append(item)

    return safe, events
