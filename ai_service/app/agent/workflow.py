"""
Workflow policy engine — YAML-driven conditional branches after tool execution.

Pattern: Python interprets a committed policy file; LLM proposes, code enforces branches.
Technology: PyYAML loads workflow_policy.yaml; conditions use a safe whitelist (no eval).
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import yaml


def _default_policy_path() -> Path:
    """Resolve workflow_policy.yaml beside this module."""
    override = os.environ.get("AGENT_WORKFLOW_POLICY_PATH", "").strip()
    if override:
        return Path(override)
    return Path(__file__).with_name("workflow_policy.yaml")


def load_workflow_policy() -> dict[str, Any]:
    """Load and parse the workflow policy YAML document."""
    path = _default_policy_path()
    with path.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def _condition_matches(when: dict[str, Any], ctx: dict[str, Any]) -> bool:
    """Evaluate a single policy 'when' block against orchestrator context."""
    if when.get("always"):
        return True

    rule_verdict = str(ctx.get("rule_verdict") or "benign")
    if "rule_verdict_in" in when:
        allowed = {str(v) for v in when["rule_verdict_in"] or []}
        if rule_verdict not in allowed:
            return False

    sender_count = int(ctx.get("sender_review_count_30d") or 0)
    if "sender_review_count_gte" in when:
        if sender_count < int(when["sender_review_count_gte"]):
            return False

    campaign_edges = int(ctx.get("last_tool_campaign_edges") or 0)
    if "last_tool_campaign_edges_gt" in when:
        if campaign_edges <= int(when["last_tool_campaign_edges_gt"]):
            return False

    synthesis = ctx.get("synthesis") or {}
    if "synthesis_verdict_is" in when:
        if str(synthesis.get("verdict")) != str(when["synthesis_verdict_is"]):
            return False

    if "synthesis_confidence_gte" in when:
        try:
            conf = float(synthesis.get("confidence") or 0)
        except (TypeError, ValueError):
            conf = 0.0
        if conf < float(when["synthesis_confidence_gte"]):
            return False

    return True


def evaluate_workflow(policy: dict[str, Any], ctx: dict[str, Any]) -> dict[str, Any]:
    """
    Walk policy steps and collect tools to run plus workflow overrides.

    Returns:
        run_tools: ordered unique tool names
        overrides: merged set{} directives (min_verdict, recommended_action)
        branches_taken: step ids that matched
    """
    run_tools: list[str] = []
    overrides: dict[str, Any] = {}
    branches: list[str] = []

    for step in policy.get("steps") or []:
        when = step.get("when") or {}
        if not _condition_matches(when, ctx):
            continue
        branches.append(str(step.get("id") or "unknown"))

        if step.get("run_tool"):
            name = str(step["run_tool"])
            if name not in run_tools:
                run_tools.append(name)

        if step.get("suggest_tool"):
            name = str(step["suggest_tool"])
            if name not in run_tools:
                run_tools.append(name)

        for key, value in (step.get("set") or {}).items():
            overrides[key] = value

    return {
        "run_tools": run_tools,
        "overrides": overrides,
        "branches_taken": branches,
    }


def count_campaign_edges(graph_payload: dict[str, Any] | None) -> int:
    """Count relationship edges returned by get_graph_neighborhood tool."""
    if not graph_payload:
        return 0
    edges = graph_payload.get("edges") or graph_payload.get("relationships") or []
    return len(edges)
