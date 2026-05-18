"""Merge deterministic rules with LLM JSON; persist `analysisResult` + status."""
from typing import Any, Dict, List


def _sev(s: str) -> str:
    if s in ("critical", "high"):
        return "high"
    if s == "medium":
        return "medium"
    return "low"


def merge_results(rule_out: tuple, llm: Dict[str, Any]) -> Dict[str, Any]:
    verdict_r, action_r, findings_r, fu_r = rule_out
    final_verdict = llm.get("verdict") or verdict_r
    final_action = (
        "close"
        if final_verdict == "benign"
        else "investigate"
        if final_verdict == "suspicious"
        else "report_and_block"
    )
    merged_findings: List[Dict[str, Any]] = [
        {
            "explanation": str(f.get("explanation", "")),
            "severity": _sev(str(f.get("severity", "low"))),
            "evidence": f.get("evidence"),
        }
        for f in findings_r
    ]
    for f in llm.get("findings") or []:
        merged_findings.append(
            {
                "explanation": str(f.get("explanation", "")),
                "severity": _sev(str(f.get("severity", "low"))),
                "evidence": f.get("evidence"),
            }
        )
    return {
        "verdict": final_verdict,
        "recommendedAction": final_action,
        "summary": llm.get("summary"),
        "findings": merged_findings,
        "followUpQuestions": fu_r
        if fu_r
        else llm.get("followUpQuestions") or [],
    }
