"""
Minimal OpenAI-compatible HTTP server for local demos (no paid API calls).

Implements POST /v1/chat/completions with Bearer auth (LLM_API_KEY).
Run: python -m mock_commercial_llm.server
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

from mock_commercial_llm.responses import build_chat_completion_response


def expected_api_key() -> str:
    """API key clients must send as Authorization: Bearer <key>."""
    return os.environ.get("LLM_API_KEY", "dev-mock-key")


class MockOpenAIHandler(BaseHTTPRequestHandler):
    """Handle OpenAI-style chat completion requests."""

    def log_message(self, format: str, *args) -> None:  # noqa: A003 — stdlib name
        """Reduce default stderr noise; ops can enable verbose logging separately."""

    def do_GET(self) -> None:
        """Health check for Docker and integration tests."""
        if self.path.rstrip("/") in ("/health", "/v1/health"):
            self._json_response(200, {"status": "ok", "service": "mock-commercial-llm"})
            return
        self.send_error(404)

    def do_POST(self) -> None:
        """OpenAI Chat Completions endpoint."""
        if self.path != "/v1/chat/completions":
            self.send_error(404)
            return

        auth = self.headers.get("Authorization", "")
        if auth != f"Bearer {expected_api_key()}":
            self._json_response(
                401,
                {"error": {"message": "Invalid API key", "type": "auth_error"}},
            )
            return

        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            self._json_response(400, {"error": {"message": "Invalid JSON body"}})
            return

        model = body.get("model") or os.environ.get("LLM_MODEL", "gpt-4o-mini")
        temperature = float(body.get("temperature", os.environ.get("LLM_TEMPERATURE", "0.2")))
        max_tokens = int(body.get("max_tokens", os.environ.get("LLM_MAX_TOKENS", "512")))
        messages = body.get("messages") or []
        user_text = ""
        for msg in reversed(messages):
            if msg.get("role") == "user":
                user_text = str(msg.get("content") or "")
                break

        response = build_chat_completion_response(
            user_text,
            model=model,
            temperature=temperature,
            max_tokens=max_tokens,
        )
        self._json_response(200, response)

    def _json_response(self, status: int, payload: dict) -> None:
        """Write JSON HTTP response."""
        data = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    """Bind mock server (default port 8090)."""
    port = int(os.environ.get("MOCK_LLM_PORT", "8090"))
    host = os.environ.get("MOCK_LLM_HOST", "0.0.0.0")
    server = HTTPServer((host, port), MockOpenAIHandler)
    print(f"mock-commercial-llm listening on http://{host}:{port}/v1/chat/completions")
    server.serve_forever()


if __name__ == "__main__":
    main()
