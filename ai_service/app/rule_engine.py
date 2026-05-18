"""Mirror of Node ruleEngine heuristics for Celery scoring path."""
from typing import Any, Dict, List, Tuple


def run_rule_engine(review: Dict[str, Any]) -> Tuple[str, str, List[dict], List[str]]:
    text = f"{review.get('subject','')} {review.get('body','')}".lower()
    verdict = "benign"
    recommended_action = "close"
    findings: List[dict] = []
    followups: List[str] = []

    if any(
        k in text
        for k in ("password", "mfa", "credit card", "verify account")
    ):
        verdict = "likely_phishing"
        recommended_action = "report_and_block"
        findings.append(
            {
                "severity": "high",
                "explanation": "Credential or sensitive data request detected",
                "evidence": (review.get("body") or "")[:120],
            }
        )

    if "urgent" in text and "http" in (review.get("body") or ""):
        verdict = "suspicious" if verdict == "benign" else verdict
        recommended_action = "investigate"
        findings.append(
            {
                "severity": "high",
                "explanation": "Urgent language combined with external link",
                "evidence": (review.get("body") or "")[:120],
            }
        )

    if findings:
        return verdict, recommended_action, findings, followups

    followups.extend(["Is this email expected?", "Do you recognize the sender?"])
    recommended_action = "investigate"
    return verdict, recommended_action, findings, followups
