"""
Cloud LLM client factory — selects Bedrock, Vertex, or mock based on env.

Pattern: provider interface hides vendor SDK differences from the orchestrator FSM.
"""

from __future__ import annotations

import os
from typing import Protocol

from app.agent.providers.bedrock_client import BedrockCloudLlmClient
from app.agent.providers.mock_client import MockCloudLlmClient
from app.agent.providers.vertex_client import VertexCloudLlmClient


class CloudLlmClient(Protocol):
    """Minimal converse API used by the agent orchestrator."""

    def converse_plan(self, review: dict, rule_verdict: str) -> dict: ...

    def converse_tool_round(
        self, review: dict, tool_results: list[dict], tools: list[dict]
    ) -> dict: ...

    def converse_synthesize(self, review: dict, context: dict) -> dict: ...


def get_cloud_llm_client() -> CloudLlmClient:
    """Return the configured cloud LLM adapter (mock in dev by default)."""
    provider = os.environ.get("LLM_CLOUD_PROVIDER", "mock").lower()
    if provider == "bedrock":
        return BedrockCloudLlmClient()
    if provider == "vertex":
        return VertexCloudLlmClient()
    return MockCloudLlmClient()
