"""
Agent-assisted email triage — bounded FSM orchestration for Celery scoring.

Pattern: finite-state machine (not open-ended ReAct) with tool allowlist + guardrails.
Technology: Python modules under app.agent; Cloud LLM via Bedrock, Vertex, or mock-cloud-llm.
"""

from app.agent.orchestrator import run_agent_triage

__all__ = ["run_agent_triage"]
