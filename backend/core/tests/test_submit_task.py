import json

from django.test import Client, TestCase
from unittest.mock import patch


class SubmitTaskViewTests(TestCase):
    """Verify submit_task queues work for GET and POST without blocking."""

    def setUp(self):
        self.client = Client()

    @patch("core.views.send_task")
    def test_post_queues_json_body(self, mock_send):
        response = self.client.post(
            "/api/submit",
            data=json.dumps({"task": "analyze_text", "text": "hello"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "queued")
        mock_send.assert_called_once()
        payload = mock_send.call_args[0][0]
        self.assertEqual(payload["task"], "analyze_text")

    @patch("core.views.send_task")
    def test_get_queues_query_params(self, mock_send):
        response = self.client.get("/api/submit?task=heavy_report&range=7d")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["method"], "GET")
        mock_send.assert_called_once()
        payload = mock_send.call_args[0][0]
        self.assertEqual(payload["task"], "heavy_report")
        self.assertEqual(payload["range"], "7d")

    @patch("core.views.send_task")
    def test_put_queues_json_body(self, mock_send):
        response = self.client.put(
            "/api/submit",
            data=json.dumps({"task": "reindex", "scope": "all"}),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        mock_send.assert_called_once()
