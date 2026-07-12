"""Tests for agent tool registry — local rule engine tool."""

from app.agent.tools import execute_tool, list_tool_specs


def test_list_tool_specs_includes_rule_engine():
    """Tool allowlist must expose run_rule_engine for workflow policy."""
    names = {t["name"] for t in list_tool_specs()}
    assert "run_rule_engine" in names
    assert "get_graph_neighborhood" in names


def test_execute_tool_run_rule_engine_detects_phish_url():
    """Local tool wraps deterministic rule_engine heuristics."""
    review = {
        "subject": "Alert",
        "body": "Click https://phish.test/login now",
        "senderEmail": "a@evil.com",
    }
    result = execute_tool("run_rule_engine", {}, review)
    assert result["ok"] is True
    assert result["output"]["verdict"] == "likely_phishing"


def test_execute_tool_rejects_unknown_name():
    """Orchestrator must not execute tools outside the allowlist."""
    try:
        execute_tool("delete_all_reviews", {}, {})
        raised = False
    except KeyError as exc:
        raised = True
        assert "tool_not_allowed" in str(exc)
    assert raised
