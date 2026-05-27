"""Tests for unified LLM client and mock commercial provider."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

from app.llm_client import analyze_with_llm, analyze_with_mock_commercial


def test_analyze_with_llm_disabled_returns_stub(monkeypatch):
    """DISABLE_LLM=true must skip network (CI-safe default)."""
    monkeypatch.setenv("DISABLE_LLM", "true")
    result = analyze_with_llm({"senderEmail": "a@b.com", "subject": "Hi", "body": "x"})
    assert result["verdict"] == "benign"
    assert "disabled" in result["summary"].lower()


def test_mock_commercial_parses_openai_response(monkeypatch):
    """Mock commercial path expects OpenAI chat/completions JSON shape."""
    monkeypatch.setenv("LLM_BASE_URL", "http://mock-llm:8090/v1")
    monkeypatch.setenv("LLM_API_KEY", "dev-mock-key")
    payload = {
        "choices": [
            {
                "message": {
                    "content": (
                        '{"verdict":"likely_phishing","recommendedAction":"report_and_block",'
                        '"summary":"mock","findings":[],"followUpQuestions":[]}'
                    )
                }
            }
        ],
        "usage": {"prompt_tokens": 10, "completion_tokens": 20},
        "mock_cost_usd": 0.0,
    }
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = payload

    with patch("app.llm_client.requests.post", return_value=mock_response):
        result = analyze_with_mock_commercial(
            {"_id": "1", "senderEmail": "x", "subject": "password", "body": "verify password"}
        )

    assert result["verdict"] == "likely_phishing"
    assert result["_llmMeta"]["provider"] == "mock_commercial"
    assert result["_llmMeta"]["mockCostUsd"] == 0.0
