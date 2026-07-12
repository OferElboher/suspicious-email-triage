"""
Post-LLM guardrails — schema validation, verdict floors, content safety.

Pattern: one repair retry is handled by orchestrator; this module validates a candidate payload.
Technology: jsonschema validates structured synthesis output from Bedrock/Vertex/mock.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Any

from app.guardrails.policy import (
    apply_verdict_floor,
    normalize_recommended_action,
    strip_unsafe_findings,
)

try:
    import jsonschema
except ImportError:  # pragma: no cover — jsonschema is a declared dependency
    jsonschema = None  # type: ignore[assignment]


# JSON Schema for agent synthesis step — mirrors merge_results expectations + confidence.
SYNTHESIS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["verdict", "recommendedAction", "summary", "findings", "confidence"],
    "properties": {
        "verdict": {"enum": ["benign", "suspicious", "likely_phishing"]},
        "recommendedAction": {"enum": ["close", "investigate", "report_and_block"]},
        "summary": {"type": "string", "maxLength": 500},
        "findings": {"type": "array", "maxItems": 10},
        "followUpQuestions": {"type": "array", "maxItems": 5},
        "confidence": {"type": "number", "minimum": 0, "maximum": 1},
        "workflowTrace": {"type": "object"},
    },
    "additionalProperties": True,
}


@dataclass
class PostGuardrailResult:
    """Validated and policy-corrected structured output ready for merge_results."""

    ok: bool
    payload: dict[str, Any] = field(default_factory=dict)
    events: list[dict[str, Any]] = field(default_factory=list)
    reason: str = ""


def _schema_validate(payload: dict[str, Any]) -> tuple[bool, str]:
    """Validate synthesis JSON against SYNTHESIS_SCHEMA when strict mode is enabled."""
    if jsonschema is None:
        return True, ""
    strict = os.environ.get("AGENT_SCHEMA_VALIDATION_STRICT", "true").lower() == "true"
    if not strict:
        return True, ""
    try:
        jsonschema.validate(instance=payload, schema=SYNTHESIS_SCHEMA)
        return True, ""
    except jsonschema.ValidationError as exc:
        return False, str(exc.message)


def run_post_llm_guardrails(
    payload: dict[str, Any],
    *,
    rule_verdict: str,
    workflow_overrides: dict[str, Any] | None = None,
) -> PostGuardrailResult:
    """
    Apply post-LLM policy to agent synthesis JSON.

    workflow_overrides may raise min_verdict or recommended_action from workflow_policy.yaml.
    """
    events: list[dict[str, Any]] = []
    if not isinstance(payload, dict):
        return PostGuardrailResult(ok=False, reason="payload_not_object")

    valid, err = _schema_validate(payload)
    if not valid:
        return PostGuardrailResult(
            ok=False,
            reason=f"schema_invalid:{err}",
            events=[{"stage": "post", "rule": "json_schema", "action": "reject"}],
        )

    corrected = dict(payload)
    llm_verdict = str(corrected.get("verdict") or "benign")
    floored = apply_verdict_floor(rule_verdict, llm_verdict)
    if floored != llm_verdict:
        events.append(
            {
                "stage": "post",
                "rule": "verdict_floor",
                "action": "raised",
                "from": llm_verdict,
                "to": floored,
            }
        )
        corrected["verdict"] = floored

    overrides = workflow_overrides or {}
    min_verdict = overrides.get("min_verdict")
    if min_verdict and verdict_rank_safe(floored) < verdict_rank_safe(str(min_verdict)):
        corrected["verdict"] = str(min_verdict)
        events.append(
            {
                "stage": "post",
                "rule": "workflow_min_verdict",
                "action": "raised",
                "to": min_verdict,
            }
        )

    action = normalize_recommended_action(
        str(corrected.get("verdict")),
        overrides.get("recommended_action") or corrected.get("recommendedAction"),
    )
    corrected["recommendedAction"] = action

    min_conf = float(os.environ.get("AGENT_MIN_CONFIDENCE", "0.3"))
    confidence = float(corrected.get("confidence") or 0)
    confidence = max(0.0, min(1.0, confidence))
    corrected["confidence"] = confidence
    if confidence < min_conf and corrected["verdict"] != "benign":
        corrected["recommendedAction"] = "investigate"
        events.append({"stage": "post", "rule": "low_confidence", "action": "force_investigate"})

    findings, finding_events = strip_unsafe_findings(corrected.get("findings") or [])
    corrected["findings"] = findings
    events.extend(finding_events)

    return PostGuardrailResult(ok=True, payload=corrected, events=events)


def verdict_rank_safe(verdict: str) -> int:
    """Local rank helper to avoid circular imports from policy module in overrides."""
    from app.guardrails.policy import verdict_rank

    return verdict_rank(verdict)
