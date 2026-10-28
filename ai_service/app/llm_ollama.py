"""
This module calls a local Ollama HTTP API when OLLAMA_BASE_URL is configured for offline or lab
scoring.

It formats review text into prompts and parses model responses into structured fields.

It is an alternative to llm_client.py commercial paths when teams self-host models.

Disabled by default in favor of mock-llm or OpenAI-compatible endpoints in most dev profiles.
"""

import json
import os
import re
from typing import Any, Dict

import requests


def _ollama_url() -> str:
    return os.environ.get(
        "OLLAMA_URL", "http://host.docker.internal:11434/api/generate"
    )


def analyze_with_ollama(review: Dict[str, Any]) -> Dict[str, Any]:
    if os.environ.get("DISABLE_LLM", "").lower() == "true":
        return {
            "_llmDisabled": True,
            "summary": "LLM disabled (python stub)",
            "findings": [],
            "followUpQuestions": [],
        }

    prompt = (
        "Return STRICT JSON only with keys verdict, recommendedAction, summary, "
        "findings[], followUpQuestions[]. Analyze phishing risk.\n"
        f"Sender: {review.get('senderEmail')}\n"
        f"Subject: {review.get('subject')}\nBody: {review.get('body')}\n"
    )
    r = requests.post(
        _ollama_url(),
        json={
            "model": os.environ.get("OLLAMA_MODEL", "llama3"),
            "prompt": prompt,
            "stream": False,
            "format": "json",
        },
        timeout=120,
    )
    r.raise_for_status()
    data = r.json()
    raw = data.get("response", "")
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        m = re.search(r"\{[\s\S]*\}", raw)
        if not m:
            raise
        parsed = json.loads(m.group(0))
    return parsed
