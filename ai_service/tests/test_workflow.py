"""Tests for YAML workflow policy evaluation."""

from app.agent.workflow import evaluate_workflow, load_workflow_policy


def test_load_workflow_policy_has_steps():
    """Committed workflow_policy.yaml must parse and include baseline steps."""
    policy = load_workflow_policy()
    assert policy.get("version") == "1"
    assert len(policy.get("steps") or []) >= 3


def test_graph_tool_suggested_when_rule_verdict_suspicious():
    """Workflow branch fires get_graph_neighborhood for elevated rule verdicts."""
    policy = load_workflow_policy()
    result = evaluate_workflow(
        policy,
        {"rule_verdict": "suspicious", "sender_review_count_30d": 0, "last_tool_campaign_edges": 0},
    )
    assert "get_graph_neighborhood" in result["run_tools"]
    assert "always_rules" in result["branches_taken"] or (
        "graph_if_suspicious" in result["branches_taken"]
    )


def test_high_confidence_phish_sets_report_and_block_override():
    """Post-synthesis workflow step escalates recommendedAction."""
    policy = load_workflow_policy()
    result = evaluate_workflow(
        policy,
        {
            "rule_verdict": "likely_phishing",
            "synthesis": {"verdict": "likely_phishing", "confidence": 0.9},
        },
    )
    assert result["overrides"].get("recommended_action") == "report_and_block"
