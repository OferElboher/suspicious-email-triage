"""Live test: forgot-password delivers email to Mailpit (dev SMTP sink)."""

import time

import pytest
import requests

from integration_tests.conftest import requires_stack
from integration_tests.mailpit_helpers import first_auth_user_email

MAILPIT_API = "http://127.0.0.1:8025/api/v1"


def mailpit_up() -> bool:
    """Return True when Mailpit web/API responds."""
    try:
        resp = requests.get(f"{MAILPIT_API}/messages", timeout=2)
        return resp.status_code == 200
    except requests.RequestException:
        return False


requires_mailpit = pytest.mark.skipif(
    not mailpit_up(),
    reason="Mailpit not running on localhost:8025 — start docker compose mailpit service",
)


@requires_mailpit
def test_mailpit_api_reachable():
    """Sanity check Mailpit is up for manual dev testing."""
    resp = requests.get(f"{MAILPIT_API}/messages", timeout=5)
    assert resp.status_code == 200


@requires_stack
@requires_mailpit
def test_forgot_password_sends_email_to_mailpit():
    """POST /auth/forgot-password must deliver a reset link to Mailpit for a real user."""
    email = first_auth_user_email()
    if not email:
        pytest.skip("auth_users is empty — run scripts/bootstrap-auth-admin.sh")

    requests.delete(f"{MAILPIT_API}/messages", timeout=5)

    resp = requests.post(
        "http://127.0.0.1:3000/auth/forgot-password",
        json={"email": email},
        timeout=10,
    )
    assert resp.status_code == 200

    found = False
    for _ in range(15):
        inbox = requests.get(f"{MAILPIT_API}/messages", timeout=5).json()
        for msg in inbox.get("messages", []):
            recipients = [r.get("Address", "") for r in msg.get("To", [])]
            if email.lower() in [a.lower() for a in recipients]:
                detail = requests.get(f"{MAILPIT_API}/message/{msg['ID']}", timeout=5).json()
                assert "reset-password?token=" in detail.get("Text", "")
                found = True
                break
        if found:
            break
        time.sleep(0.4)

    assert found, f"No reset email in Mailpit for {email}"
