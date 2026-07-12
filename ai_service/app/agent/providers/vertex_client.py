"""
Google Vertex AI adapter — production path for Gemini models.

Pattern: mirrors Bedrock adapter; uses google-cloud-aiplatform only when selected.
Technology: Vertex generate_content with JSON response for synthesis step.
"""

from __future__ import annotations

import json
import os
from typing import Any


class VertexCloudLlmClient:
    """Invoke Vertex Gemini for agent plan and synthesis stages."""

    def __init__(self) -> None:
        """Initialize Vertex model handle — imports google SDK lazily for dev safety."""
        import vertexai  # noqa: PLC0415
        from vertexai.generative_models import GenerativeModel  # noqa: PLC0415

        project = os.environ.get("GCP_PROJECT_ID", "")
        location = os.environ.get("GCP_LOCATION", "us-central1")
        if not project:
            raise RuntimeError("GCP_PROJECT_ID is required when LLM_CLOUD_PROVIDER=vertex")
        vertexai.init(project=project, location=location)
        model_id = os.environ.get("VERTEX_MODEL_ID", "gemini-1.5-flash-001")
        self._model = GenerativeModel(model_id)

    def _generate_json(self, system: str, user: str) -> dict[str, Any]:
        """Call Gemini and parse JSON object from model text."""
        prompt = f"{system}\n\nUSER:\n{user}"
        response = self._model.generate_content(
            prompt,
            generation_config={
                "temperature": float(os.environ.get("AGENT_SYNTHESIS_TEMPERATURE", "0.2")),
                "max_output_tokens": int(os.environ.get("AGENT_MAX_OUTPUT_TOKENS", "1024")),
            },
        )
        raw = (response.text or "").strip()
        return json.loads(raw)

    def converse_plan(self, review: dict, rule_verdict: str) -> dict:
        """PLAN — JSON sub-task list."""
        system = (
            "Return STRICT JSON with keys intent, subTasks (array), "
            "riskHypothesis for email triage."
        )
        user = json.dumps(
            {
                "subject": review.get("subject"),
                "body": review.get("body"),
                "senderEmail": review.get("senderEmail"),
                "ruleVerdict": rule_verdict,
            }
        )
        return self._generate_json(system, user)

    def converse_tool_round(
        self, review: dict, tool_results: list[dict], tools: list[dict]
    ) -> dict:
        """Vertex tool round passthrough — workflow policy drives tool execution."""
        return {"toolResults": tool_results, "tools": tools}

    def converse_synthesize(self, review: dict, context: dict) -> dict:
        """SYNTHESIZE — structured verdict payload."""
        system = (
            "Return STRICT JSON with verdict, recommendedAction, summary, findings, "
            "followUpQuestions, confidence (0-1)."
        )
        user = json.dumps({"review": review, "context": context})
        return self._generate_json(system, user)
