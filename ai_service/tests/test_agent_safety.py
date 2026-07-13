"""Tests for agent safety limits — wall-clock budget and env caps."""

from __future__ import annotations

import time

from app.agent.safety import (
    AgentSafetyLimits,
    elapsed_ms,
    get_agent_safety_limits,
    wall_budget_exceeded,
)


def test_get_agent_safety_limits_defaults(monkeypatch):
    """Conservative defaults protect hosts when env vars are unset."""
    monkeypatch.delenv("AGENT_MAX_TOOL_STEPS", raising=False)
    monkeypatch.delenv("AGENT_MAX_WALL_MS", raising=False)
    limits = get_agent_safety_limits()
    assert limits.max_tool_steps == 3
    assert limits.max_wall_ms == 30000
    assert limits.max_body_chars == 8000


def test_get_agent_safety_limits_reads_env(monkeypatch):
    """Operators can tune caps via environment without code changes."""
    monkeypatch.setenv("AGENT_MAX_TOOL_STEPS", "2")
    monkeypatch.setenv("AGENT_MAX_WALL_MS", "5000")
    limits = get_agent_safety_limits()
    assert limits.max_tool_steps == 2
    assert limits.max_wall_ms == 5000


def test_wall_budget_exceeded_false_at_start():
    """Fresh FSM runs should not immediately trip the wall budget."""
    started = time.monotonic()
    limits = AgentSafetyLimits(
        max_tool_steps=3,
        max_wall_ms=30000,
        max_body_chars=8000,
        max_input_tokens=6000,
        max_output_tokens=1024,
    )
    assert wall_budget_exceeded(started, limits) is False
    assert elapsed_ms(started) >= 0


def test_wall_budget_exceeded_true_when_over_cap():
    """Orchestrator uses this to fall back to rules instead of hanging."""
    started = time.monotonic() - 60.0
    limits = AgentSafetyLimits(
        max_tool_steps=3,
        max_wall_ms=1000,
        max_body_chars=8000,
        max_input_tokens=6000,
        max_output_tokens=1024,
    )
    assert wall_budget_exceeded(started, limits) is True
