"""Learning tests for mock OpenAI-compatible server (mock_commercial_llm package)."""

from __future__ import annotations

from unittest.mock import patch

from mock_commercial_llm.responses import pick_mock_analysis


def test_pick_mock_analysis_flags_credential_harvesting():
    """
    Pattern: keyword-based canned responses simulate model behavior without API cost.

    Real GPT models would infer intent; our mock uses transparent rules for demos/tests.
    """
    result = pick_mock_analysis(
        "Subject: Action required\nBody: Please verify your password immediately",
        model="gpt-4o-mini",
        temperature=0.2,
    )
    assert result["verdict"] == "likely_phishing"
    assert result["recommendedAction"] == "report_and_block"


def test_pick_mock_analysis_defaults_benign():
    """Benign stock response when no phishing keywords match."""
    result = pick_mock_analysis("Subject: Team lunch\nBody: See you at noon", "gpt-4o-mini", 0.1)
    assert result["verdict"] == "benign"


@patch.dict("os.environ", {"LLM_API_KEY": "dev-mock-key"})
def test_mock_server_health_route():
    """Docker health checks hit GET /health on the mock server."""
    from mock_commercial_llm.server import MockOpenAIHandler

    handler = MockOpenAIHandler.__new__(MockOpenAIHandler)
    sent = {}

    def fake_send_response(code):
        sent["code"] = code

    def fake_send_header(key, value):
        sent.setdefault("headers", {})[key] = value

    def fake_end_headers():
        sent["ended"] = True

    handler.send_response = fake_send_response
    handler.send_header = fake_send_header
    handler.end_headers = fake_end_headers
    handler.path = "/health"
    handler.wfile = type("W", (), {"write": lambda self, b: sent.setdefault("body", b)})()

    handler.do_GET()
    assert sent["code"] == 200
