"""
HTTP server emulating Bedrock Converse for agent triage (PLAN / TOOL_LOOP / SYNTHESIZE).

Run: python -m mock_cloud_llm.server
Technology: stdlib http.server — same pattern as mock_commercial_llm.server.
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer
from typing import Any

from mock_cloud_llm.responses import build_plan, build_synthesis, tool_loop_ack


def _log_unified(level: str, message: str, meta: dict | None = None) -> None:
    """Append one line to merged.log when MERGED_LOG_PATH is configured (Docker volume)."""
    try:
        from app.logutil import log_line

        log_line(level, "mock-cloud-llm", message, **(meta or {}))
    except OSError:
        pass


class MockCloudLlmHandler(BaseHTTPRequestHandler):
    """Serve POST /v1/converse with stage-specific JSON payloads."""

    def log_message(self, format: str, *args: Any) -> None:
        """Suppress default stderr logging in tests."""
        return

    def _json_response(self, status: int, payload: dict[str, Any]) -> None:
        """Write JSON HTTP response."""
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        """Health probe for Docker Compose."""
        if self.path in ("/health", "/"):
            self._json_response(200, {"status": "ok", "service": "mock-cloud-llm"})
            return
        self._json_response(404, {"error": "not_found"})

    def do_POST(self) -> None:
        """Handle agent converse stages posted by MockCloudLlmClient."""
        if self.path != "/v1/converse":
            self._json_response(404, {"error": "not_found"})
            return
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            self._json_response(400, {"error": "invalid_json"})
            return

        stage = str(body.get("stage") or "")
        if stage == "plan":
            review = body.get("review") or {}
            rule_verdict = str(body.get("ruleVerdict") or "benign")
            plan = build_plan(rule_verdict, review)
            _log_unified("info", "mock-cloud-llm plan stage", {"stage": stage})
            self._json_response(200, {"plan": plan, "stopReason": "end_turn"})
            return

        if stage == "tool_loop":
            results = body.get("toolResults") or []
            payload = tool_loop_ack(results)
            _log_unified("info", "mock-cloud-llm tool_loop stage", {"stage": stage})
            self._json_response(200, payload)
            return

        if stage == "synthesize":
            review = body.get("review") or {}
            context = body.get("context") or {}
            synthesis = build_synthesis(review, context)
            _log_unified("info", "mock-cloud-llm synthesize stage", {"stage": stage})
            self._json_response(200, {"synthesis": synthesis, "stopReason": "end_turn"})
            return

        _log_unified("warn", "mock-cloud-llm unknown stage", {"stage": stage})
        self._json_response(400, {"error": "unknown_stage", "stage": stage})


def main() -> None:
    """Bind HTTP server on MOCK_CLOUD_LLM_PORT (default 8091)."""
    port = int(os.environ.get("MOCK_CLOUD_LLM_PORT", "8091"))
    host = os.environ.get("MOCK_CLOUD_LLM_HOST", "0.0.0.0")
    server = HTTPServer((host, port), MockCloudLlmHandler)
    print(f"mock-cloud-llm listening on http://{host}:{port}/v1/converse")
    server.serve_forever()


if __name__ == "__main__":
    main()
