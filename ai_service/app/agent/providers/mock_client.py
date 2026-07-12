"""
Mock cloud LLM client — talks to mock-cloud-llm container (zero API cost).

Pattern: Bedrock Converse-shaped HTTP API; dev replacement for paid Bedrock/Vertex.
Technology: requests POST /v1/converse; responses emulate tool_use + JSON synthesis.
"""

from __future__ import annotations

import json
import os
from typing import Any

import requests


class MockCloudLlmClient:
    """HTTP adapter for the in-repo mock-cloud-llm service."""

    def _base_url(self) -> str:
        """Mock service root — defaults to docker-compose service name."""
        return os.environ.get("MOCK_CLOUD_LLM_URL", "http://mock-cloud-llm:8091").rstrip("/")

    def _post(self, payload: dict[str, Any]) -> dict[str, Any]:
        """POST /v1/converse and parse JSON response body."""
        url = f"{self._base_url()}/v1/converse"
        response = requests.post(url, json=payload, timeout=30)
        response.raise_for_status()
        return response.json()

    def converse_plan(self, review: dict, rule_verdict: str) -> dict:
        """PLAN state — structured sub-task decomposition JSON."""
        body = {
            "stage": "plan",
            "review": {
                "id": str(review.get("_id") or review.get("id") or ""),
                "subject": review.get("subject"),
                "senderEmail": review.get("senderEmail"),
                "body": review.get("body"),
            },
            "ruleVerdict": rule_verdict,
        }
        data = self._post(body)
        content = data.get("plan") or {}
        if isinstance(content, str):
            content = json.loads(content)
        return content

    def converse_tool_round(
        self, review: dict, tool_results: list[dict], tools: list[dict]
    ) -> dict:
        """TOOL_LOOP — mock may return additional tool hints (optional in minimal path)."""
        body = {
            "stage": "tool_loop",
            "reviewId": str(review.get("_id") or review.get("id") or ""),
            "toolResults": tool_results,
            "tools": tools,
        }
        return self._post(body)

    def converse_synthesize(self, review: dict, context: dict) -> dict:
        """SYNTHESIZE — final structured verdict JSON."""
        body = {
            "stage": "synthesize",
            "review": {
                "subject": review.get("subject"),
                "body": review.get("body"),
                "senderEmail": review.get("senderEmail"),
            },
            "context": context,
        }
        data = self._post(body)
        synthesis = data.get("synthesis") or {}
        if isinstance(synthesis, str):
            synthesis = json.loads(synthesis)
        return synthesis
