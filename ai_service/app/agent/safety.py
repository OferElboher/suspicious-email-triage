"""
Agent safety limits — bounded resource use for laptop dev and cloud servers.

Pattern: all caps are env-tunable; orchestrator checks wall-clock budget between FSM steps.
Technology: pure Python helpers (no external calls) — safe to import anywhere in Celery.
"""

from __future__ import annotations

import os
import time
from dataclasses import dataclass


@dataclass(frozen=True)
class AgentSafetyLimits:
    """Hard caps preventing runaway LLM/tool loops on dev laptops or prod workers."""

    max_tool_steps: int
    max_wall_ms: int
    max_body_chars: int
    max_input_tokens: int
    max_output_tokens: int


def get_agent_safety_limits() -> AgentSafetyLimits:
    """Read safety caps from environment with conservative defaults."""
    return AgentSafetyLimits(
        max_tool_steps=int(os.environ.get("AGENT_MAX_TOOL_STEPS", "3")),
        max_wall_ms=int(os.environ.get("AGENT_MAX_WALL_MS", "30000")),
        max_body_chars=int(os.environ.get("AGENT_MAX_BODY_CHARS", "8000")),
        max_input_tokens=int(os.environ.get("AGENT_MAX_INPUT_TOKENS", "6000")),
        max_output_tokens=int(os.environ.get("AGENT_MAX_OUTPUT_TOKENS", "1024")),
    )


def elapsed_ms(started_monotonic: float) -> int:
    """Milliseconds since orchestrator run began (monotonic clock)."""
    return int((time.monotonic() - started_monotonic) * 1000)


def wall_budget_exceeded(started_monotonic: float, limits: AgentSafetyLimits | None = None) -> bool:
    """True when the FSM exceeded AGENT_MAX_WALL_MS — triggers safe fallback."""
    caps = limits or get_agent_safety_limits()
    return elapsed_ms(started_monotonic) >= caps.max_wall_ms
