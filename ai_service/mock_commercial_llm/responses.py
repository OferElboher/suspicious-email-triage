"""Stock OpenAI-style analysis payloads for the mock commercial LLM server (zero API cost)."""

from __future__ import annotations

import json
import re
from typing import Any


def _extract_field(text: str, label: str) -> str:
    """Pull a labeled line from the user prompt (Sender/Subject/Body)."""
    pattern = rf"{label}:\s*(.+?)(?:\n|$)"
    match = re.search(pattern, text, re.IGNORECASE)
    return match.group(1).strip() if match else ""


def pick_mock_analysis(user_text: str, model: str, temperature: float) -> dict[str, Any]:
    """
    Choose a canned JSON analysis based on simple keyword rules.

    Mimics a commercial model without calling OpenAI — responses vary by content for demos.
    """
    body = _extract_field(user_text, "Body").lower()
    subject = _extract_field(user_text, "Subject").lower()
    combined = f"{subject} {body}"

    cred_keywords = ("password", "credential", "verify your account", "urgent action")
    phishing_url_hints = (
        "example-phish",
        "phish.test",
        "secure-login",
        "malware",
        "evil.com",
    )
    if any(h in body for h in phishing_url_hints):
        payload = {
            "verdict": "likely_phishing",
            "recommendedAction": "report_and_block",
            "summary": (
                f"[mock {model}] Suspicious link host detected in body (temp={temperature})."
            ),
            "findings": [
                {
                    "severity": "high",
                    "explanation": "URL hostname matches known phishing-demo indicators.",
                    "evidence": "phishing URL pattern in body",
                }
            ],
            "followUpQuestions": ["Validate the link domain with threat intelligence."],
        }
    elif any(k in combined for k in cred_keywords):
        payload = {
            "verdict": "likely_phishing",
            "recommendedAction": "report_and_block",
            "summary": (
                f"[mock {model}] Credential-harvesting language detected (temp={temperature})."
            ),
            "findings": [
                {
                    "severity": "high",
                    "explanation": "Message pressures immediate password or account verification.",
                    "evidence": "keyword: password / verify",
                }
            ],
            "followUpQuestions": [
                "Was this sender expected?",
                "Do links point outside your organization?",
            ],
        }
    elif any(
        k in combined
        for k in ("invoice", "payment", "wire", "bank", "locked", "click here", "urgent")
    ):
        payload = {
            "verdict": "suspicious",
            "recommendedAction": "investigate",
            "summary": f"[mock {model}] Financial-themed message warrants analyst review.",
            "findings": [
                {
                    "severity": "medium",
                    "explanation": "Payment or invoice language can indicate BEC-style fraud.",
                    "evidence": "keyword: invoice/payment",
                }
            ],
            "followUpQuestions": ["Validate payment details out-of-band with the vendor."],
        }
    else:
        payload = {
            "verdict": "benign",
            "recommendedAction": "close",
            "summary": f"[mock {model}] No strong phishing indicators in stock rule set.",
            "findings": [],
            "followUpQuestions": [],
        }

    return payload


def build_chat_completion_response(
    user_text: str,
    *,
    model: str,
    temperature: float,
    max_tokens: int,
) -> dict[str, Any]:
    """Return an OpenAI Chat Completions-shaped JSON body."""
    analysis = pick_mock_analysis(user_text, model, temperature)
    content = json.dumps(analysis)
    prompt_tokens = max(1, len(user_text) // 4)
    completion_tokens = max(1, len(content) // 4)
    total_tokens = min(max_tokens, prompt_tokens + completion_tokens)
    return {
        "id": "chatcmpl-mock-triage",
        "object": "chat.completion",
        "model": model,
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "finish_reason": "stop",
            }
        ],
        "usage": {
            "prompt_tokens": prompt_tokens,
            "completion_tokens": completion_tokens,
            "total_tokens": total_tokens,
        },
        "mock_cost_usd": 0.0,
    }
