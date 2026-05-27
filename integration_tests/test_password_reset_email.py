"""Live test: forgot-password delivers email to Mailpit (dev SMTP sink)."""

import subprocess
import time
from pathlib import Path

import pytest
import requests

from integration_tests.conftest import COMPOSE_FILE, ROOT, requires_stack
from integration_tests.mailpit_helpers import first_auth_user_email

MAILPIT_API = "http://127.0.0.1:8025/api/v1"


def mailpit_up() -> bool:
    """Return True when Mailpit web/API responds."""
    try:
        resp = requests.get(f"{MAILPIT_API}/messages", timeout=2)
        return resp.status_code == 200
    except requests.RequestException:
        return False


def backend_smtp_delivery_mode() -> str:
    """Read SMTP_DELIVERY from the running backend container (mailpit vs external)."""
    result = subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            str(COMPOSE_FILE),
            "exec",
            "-T",
            "backend",
            "printenv",
            "SMTP_DELIVERY",
        ],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )
    mode = (result.stdout or "").strip().lower()
    return mode or "mailpit"


requires_mailpit = pytest.mark.skipif(
    not mailpit_up(),
    reason="Mailpit not running on localhost:8025 — start docker compose mailpit service",
)

requires_mailpit_delivery = pytest.mark.skipif(
    backend_smtp_delivery_mode() != "mailpit",
    reason="backend SMTP_DELIVERY is not mailpit — run: bash scripts/configure-dev-smtp.sh mailpit",
)


@requires_mailpit
def test_mailpit_api_reachable():
    """Sanity check Mailpit is up for manual dev testing."""
    resp = requests.get(f"{MAILPIT_API}/messages", timeout=5)
    assert resp.status_code == 200


@requires_stack
@requires_mailpit
@requires_mailpit_delivery
def test_forgot_password_sends_email_to_mailpit():
    """POST /auth/forgot-password must deliver a reset link to Mailpit when SMTP_DELIVERY=mailpit."""
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
    assert resp.json().get("ok") is True

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
