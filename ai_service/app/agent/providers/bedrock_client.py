"""
Amazon Bedrock adapter — production path using boto3 bedrock-runtime Converse API.

Pattern: same orchestrator code path as mock; only this module imports boto3 at runtime.
Technology: bedrock-runtime.converse with toolConfig for tool-calling rounds.
"""

from __future__ import annotations

import json
import os
from typing import Any


class BedrockCloudLlmClient:
    """Invoke Bedrock Converse for plan, tool, and synthesis agent stages."""

    def __init__(self) -> None:
        """Lazy-import boto3 so dev/CI without AWS credentials still starts workers."""
        import boto3  # noqa: PLC0415 — optional prod dependency

        region = os.environ.get("AWS_REGION", "us-east-1")
        self._client = boto3.client("bedrock-runtime", region_name=region)
        self._model_id = os.environ.get(
            "BEDROCK_MODEL_ID", "anthropic.claude-3-haiku-20240307-v1:0"
        )

    def _converse(self, messages: list[dict[str, Any]], system_text: str) -> str:
        """Low-level Bedrock Converse call returning assistant text content."""
        response = self._client.converse(
            modelId=self._model_id,
            system=[{"text": system_text}],
            messages=messages,
            inferenceConfig={
                "maxTokens": int(os.environ.get("AGENT_MAX_OUTPUT_TOKENS", "1024")),
                "temperature": float(os.environ.get("AGENT_SYNTHESIS_TEMPERATURE", "0.2")),
            },
        )
        parts = response.get("output", {}).get("message", {}).get("content") or []
        texts = [p.get("text", "") for p in parts if "text" in p]
        return "\n".join(texts).strip()

    def converse_plan(self, review: dict, rule_verdict: str) -> dict:
        """Ask the model for a JSON investigation plan."""
        system = (
            "You are a security email triage planner. Return STRICT JSON with keys: "
            "intent, subTasks[], riskHypothesis."
        )
        user = json.dumps(
            {
                "subject": review.get("subject"),
                "body": review.get("body"),
                "senderEmail": review.get("senderEmail"),
                "ruleVerdict": rule_verdict,
            }
        )
        raw = self._converse([{"role": "user", "content": [{"text": user}]}], system)
        return json.loads(raw)

    def converse_tool_round(
        self, review: dict, tool_results: list[dict], tools: list[dict]
    ) -> dict:
        """Bedrock tool round — orchestrator primarily uses workflow policy; passthrough here."""
        return {"toolResults": tool_results, "tools": tools, "reviewId": str(review.get("_id"))}

    def converse_synthesize(self, review: dict, context: dict) -> dict:
        """Produce final structured verdict JSON for merge_results."""
        system = (
            "You are a cybersecurity email analyst. Return STRICT JSON with keys: "
            "verdict, recommendedAction, summary, findings[], followUpQuestions[], confidence."
        )
        user = json.dumps({"review": review, "context": context})
        raw = self._converse([{"role": "user", "content": [{"text": user}]}], system)
        return json.loads(raw)
