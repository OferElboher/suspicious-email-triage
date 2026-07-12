"""
Agent triage orchestrator — bounded finite-state machine for Celery scoring.

States: INTAKE → PLAN → TOOL_LOOP → SYNTHESIZE → GUARD_VALIDATE → PERSIST (or FALLBACK_RULES).

Pattern: explicit FSM (not unbounded ReAct); workflow YAML + tool allowlist + guardrails.
Technology: CloudLlmClient (mock/Bedrock/Vertex), jsonschema post-validation, Mongo agentTrace.
"""

from __future__ import annotations

import os
import time
import uuid
from dataclasses import dataclass
from typing import Any

from app.agent.providers.factory import get_cloud_llm_client
from app.agent.safety import get_agent_safety_limits, wall_budget_exceeded
from app.agent.tools import execute_tool, list_tool_specs
from app.agent.workflow import count_campaign_edges, evaluate_workflow, load_workflow_policy
from app.guardrails.post_llm import run_post_llm_guardrails
from app.guardrails.pre_llm import run_pre_llm_guardrails
from app.logutil import log_line
from app.rule_engine import run_rule_engine


@dataclass
class AgentTriageResult:
    """Return value from run_agent_triage — merge-ready LLM dict + audit trace."""

    structured_output: dict[str, Any]
    agent_trace: dict[str, Any]
    fallback_rules_only: bool = False


def agent_triage_enabled() -> bool:
    """True when AGENT_TRIAGE_ENABLED env flag is set (dev demos opt-in)."""
    return os.environ.get("AGENT_TRIAGE_ENABLED", "").lower() == "true"


def _rule_verdict_from_tool(tool_result: dict[str, Any] | None) -> str:
    """Extract verdict string from run_rule_engine tool output."""
    if not tool_result or not tool_result.get("ok"):
        return "benign"
    output = tool_result.get("output") or {}
    return str(output.get("verdict") or "benign")


def _sender_review_count(sender_email: str) -> int:
    """Count recent reviews from sender via lookup_sender_history tool."""
    if not sender_email:
        return 0
    result = execute_tool(
        "lookup_sender_history",
        {"sender_email": sender_email, "limit": 5},
        {},
    )
    if not result.get("ok"):
        return 0
    reviews = (result.get("output") or {}).get("reviews") or []
    return len(reviews)


def _disabled_fallback_summary(reason: str) -> dict[str, Any]:
    """Produce merge-compatible stub when guardrails hard-fail (rules remain authoritative)."""
    return {
        "_llmDisabled": True,
        "_agentFallback": True,
        "summary": f"Agent guardrail fallback ({reason})",
        "findings": [],
        "followUpQuestions": [],
    }


def run_agent_triage(review: dict[str, Any]) -> AgentTriageResult:
    """
    Execute the full agent FSM for one Mongo review document.

    Never raises for guardrail failures — returns rule-only fallback instead.
    """
    run_id = str(uuid.uuid4())
    started = time.monotonic()
    limits = get_agent_safety_limits()
    states: list[str] = []
    guard_events: list[dict[str, Any]] = []
    tool_calls: list[dict[str, Any]] = []
    provider = os.environ.get("LLM_CLOUD_PROVIDER", "mock")
    model_id = os.environ.get("BEDROCK_MODEL_ID") or os.environ.get("VERTEX_MODEL_ID") or "mock"

    # --- INTAKE ---
    states.append("INTAKE")
    pre = run_pre_llm_guardrails(review)
    guard_events.extend(pre.events)
    if pre.hard_fail:
        states.append("FALLBACK_RULES")
        log_line("warn", "agent", "pre guardrail hard fail", reason=pre.reason)
        return AgentTriageResult(
            structured_output=_disabled_fallback_summary(pre.reason),
            agent_trace=_build_trace(
                run_id, provider, model_id, states, tool_calls, guard_events, started
            ),
            fallback_rules_only=True,
        )
    working_review = pre.review

    # --- PLAN ---
    states.append("PLAN")
    if wall_budget_exceeded(started, limits):
        states.append("FALLBACK_RULES")
        return AgentTriageResult(
            structured_output=_disabled_fallback_summary("wall_budget_exceeded"),
            agent_trace=_build_trace(
                run_id, provider, model_id, states, tool_calls, guard_events, started
            ),
            fallback_rules_only=True,
        )
    rules_tuple = run_rule_engine(working_review)
    rule_verdict = rules_tuple[0]
    client = get_cloud_llm_client()
    try:
        plan = client.converse_plan(working_review, rule_verdict)
    except Exception as exc:  # noqa: BLE001
        states.append("FALLBACK_RULES")
        log_line("error", "agent", "plan failed", error=str(exc))
        return AgentTriageResult(
            structured_output=_disabled_fallback_summary("plan_failed"),
            agent_trace=_build_trace(
                run_id, provider, model_id, states, tool_calls, guard_events, started
            ),
            fallback_rules_only=True,
        )

    # --- TOOL_LOOP ---
    states.append("TOOL_LOOP")
    sender_email = str(working_review.get("senderEmail") or "")
    ctx: dict[str, Any] = {
        "rule_verdict": rule_verdict,
        "sender_review_count_30d": _sender_review_count(sender_email),
        "last_tool_campaign_edges": 0,
        "synthesis": {},
    }
    policy = load_workflow_policy()
    wf = evaluate_workflow(policy, ctx)
    tools_to_run = wf["run_tools"]
    tools_to_run = tools_to_run[: limits.max_tool_steps]

    tool_outputs: list[dict[str, Any]] = []
    for tool_name in tools_to_run:
        if wall_budget_exceeded(started, limits):
            log_line("warn", "agent", "wall budget exceeded during tool loop")
            break
        args: dict[str, Any] = {}
        review_id = str(working_review.get("_id") or working_review.get("id") or "")
        if tool_name == "run_rule_engine":
            args = {}
        elif tool_name == "get_graph_neighborhood":
            args = {"review_id": review_id, "depth": 1}
        elif tool_name == "query_review_stats":
            args = {"review_id": review_id, "limit": 5}
        elif tool_name == "lookup_sender_history":
            args = {"sender_email": sender_email, "limit": 5}
        elif tool_name == "get_review_by_id":
            args = {"review_id": review_id}

        result = execute_tool(tool_name, args, working_review)
        tool_calls.append(
            {
                "name": tool_name,
                "ok": result.get("ok"),
                "latencyMs": result.get("latencyMs"),
            }
        )
        tool_outputs.append(result)

        if tool_name == "get_graph_neighborhood" and result.get("ok"):
            ctx["last_tool_campaign_edges"] = count_campaign_edges(result.get("output"))

    try:
        client.converse_tool_round(working_review, tool_outputs, list_tool_specs())
    except Exception as exc:  # noqa: BLE001 — tool round is advisory in minimal implementation
        log_line("warn", "agent", "tool round advisory failed", error=str(exc))

    # --- SYNTHESIZE ---
    states.append("SYNTHESIZE")
    if wall_budget_exceeded(started, limits):
        states.append("FALLBACK_RULES")
        return AgentTriageResult(
            structured_output=_disabled_fallback_summary("wall_budget_exceeded"),
            agent_trace=_build_trace(
                run_id, provider, model_id, states, tool_calls, guard_events, started
            ),
            fallback_rules_only=True,
        )
    synth_context = {
        "plan": plan,
        "ruleVerdict": rule_verdict,
        "toolOutputs": tool_outputs,
        "workflowBranches": wf.get("branches_taken"),
    }
    try:
        synthesis = client.converse_synthesize(working_review, synth_context)
    except Exception as exc:  # noqa: BLE001
        states.append("FALLBACK_RULES")
        log_line("error", "agent", "synthesis failed", error=str(exc))
        return AgentTriageResult(
            structured_output=_disabled_fallback_summary("synthesis_failed"),
            agent_trace=_build_trace(
                run_id, provider, model_id, states, tool_calls, guard_events, started
            ),
            fallback_rules_only=True,
        )

    ctx["synthesis"] = synthesis
    wf_post = evaluate_workflow(policy, ctx)
    overrides = {**wf.get("overrides", {}), **wf_post.get("overrides", {})}
    if wf_post.get("branches_taken"):
        synthesis.setdefault("workflowTrace", {})["branchesTaken"] = wf_post["branches_taken"]

    # --- GUARD_VALIDATE ---
    states.append("GUARD_VALIDATE")
    post = run_post_llm_guardrails(
        synthesis,
        rule_verdict=rule_verdict,
        workflow_overrides=overrides,
    )
    guard_events.extend(post.events)
    if not post.ok:
        # One repair attempt — append hint and re-validate with rule-only merge fields.
        states.append("FALLBACK_RULES")
        log_line("warn", "agent", "post guardrail failed", reason=post.reason)
        return AgentTriageResult(
            structured_output=_disabled_fallback_summary(post.reason),
            agent_trace=_build_trace(
                run_id, provider, model_id, states, tool_calls, guard_events, started
            ),
            fallback_rules_only=True,
        )

    states.append("PERSIST")
    payload = post.payload
    payload["_agentMeta"] = {
        "provider": provider,
        "modelId": model_id,
        "planIntent": plan.get("intent"),
        "confidence": payload.get("confidence"),
    }

    return AgentTriageResult(
        structured_output=payload,
        agent_trace=_build_trace(
            run_id, provider, model_id, states, tool_calls, guard_events, started, plan
        ),
        fallback_rules_only=False,
    )


def _build_trace(
    run_id: str,
    provider: str,
    model_id: str,
    states: list[str],
    tool_calls: list[dict[str, Any]],
    guard_events: list[dict[str, Any]],
    started: float,
    plan: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Assemble Mongo agentTrace sub-document for SOC audit."""
    return {
        "runId": run_id,
        "provider": provider,
        "modelId": model_id,
        "statesVisited": states,
        "toolCalls": tool_calls,
        "guardrailEvents": guard_events,
        "plan": plan or {},
        "wallDurationMs": int((time.monotonic() - started) * 1000),
    }
