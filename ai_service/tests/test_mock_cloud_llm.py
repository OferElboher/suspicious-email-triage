"""Tests for mock-cloud-llm HTTP responses."""

from mock_cloud_llm.responses import build_plan, build_synthesis


def test_build_plan_includes_sub_tasks():
    """PLAN stage returns structured subTasks for orchestrator audit."""
    plan = build_plan("suspicious", {"subject": "Urgent", "body": "verify password"})
    assert plan["intent"] == "investigate_suspicious_email"
    assert len(plan["subTasks"]) >= 2


def test_build_synthesis_flags_phishing_keywords():
    """SYNTHESIZE stage returns likely_phishing for credential language."""
    payload = build_synthesis(
        {"subject": "Account", "body": "verify your account password"},
        {"ruleVerdict": "suspicious", "workflowBranches": ["graph_if_suspicious"]},
    )
    assert payload["verdict"] in ("suspicious", "likely_phishing")
    assert payload["confidence"] >= 0.5
    assert "workflowTrace" in payload
