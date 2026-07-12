"""
Stock agent responses for mock-cloud-llm — plan, tool hints, synthesis JSON.

Pattern: keyword rules (like mock_commercial_llm) drive deterministic demo behavior.
"""

from __future__ import annotations

from typing import Any


def build_plan(rule_verdict: str, review: dict[str, Any]) -> dict[str, Any]:
    """PLAN stage JSON — decomposes intent into allowlisted sub-tasks."""
    return {
        "intent": "investigate_suspicious_email",
        "subTasks": [
            {"id": "t1", "action": "run_deterministic_rules", "reason": "baseline heuristics"},
            {
                "id": "t2",
                "action": "fetch_sender_graph_context",
                "reason": "campaign linkage",
            },
            {"id": "t3", "action": "check_recent_stats", "reason": "repeat sender pattern"},
        ],
        "riskHypothesis": "credential_phish"
        if rule_verdict in ("suspicious", "likely_phishing")
        else "benign_newsletter",
    }


def build_synthesis(review: dict[str, Any], context: dict[str, Any]) -> dict[str, Any]:
    """SYNTHESIZE stage JSON — structured verdict compatible with merge_results."""
    body = str(review.get("body") or "").lower()
    subject = str(review.get("subject") or "").lower()
    combined = f"{subject} {body}"
    rule_verdict = str((context or {}).get("ruleVerdict") or "benign")

    phishing_hints = (
        "password",
        "verify your account",
        "phish.test",
        "evil.com",
        "secure-login",
        "example-phish",
    )
    if any(h in combined for h in phishing_hints) or rule_verdict == "likely_phishing":
        verdict = "likely_phishing"
        action = "report_and_block"
        confidence = 0.91
        summary = "[mock-agent] Phishing indicators and rule engine agreement."
        findings = [
            {
                "severity": "high",
                "explanation": "Credential or phishing URL language detected.",
                "evidence": "mock-cloud-llm keyword rules",
            }
        ]
    elif "urgent" in combined or rule_verdict == "suspicious":
        verdict = "suspicious"
        action = "investigate"
        confidence = 0.72
        summary = "[mock-agent] Elevated urgency warrants analyst review."
        findings = [
            {
                "severity": "medium",
                "explanation": "Urgent tone with actionable language.",
                "evidence": "mock-cloud-llm",
            }
        ]
    else:
        verdict = "benign"
        action = "close"
        confidence = 0.88
        summary = "[mock-agent] No strong phishing indicators."
        findings = []

    branches = (context or {}).get("workflowBranches") or []
    return {
        "verdict": verdict,
        "recommendedAction": action,
        "summary": summary,
        "findings": findings,
        "followUpQuestions": ["Confirm sender domain with IT?"] if verdict != "benign" else [],
        "confidence": confidence,
        "workflowTrace": {"branchesTaken": branches},
    }


def tool_loop_ack(tool_results: list[dict[str, Any]]) -> dict[str, Any]:
    """TOOL_LOOP acknowledgement payload (advisory — orchestrator already executed tools)."""
    return {
        "acknowledged": True,
        "toolResultCount": len(tool_results or []),
        "note": "mock-cloud-llm advisory round",
    }
