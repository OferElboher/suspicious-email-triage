"""Optional live-stack ORM smoke test via django-admin container."""

import subprocess

import pytest

from integration_tests.conftest import COMPOSE_FILE, ROOT, requires_stack


@requires_stack
def test_django_admin_can_query_user_role_inlines():
    """
    Regression: user change form loads role assignments without auth_user_roles.id error.

    Runs manage.py shell inside triage-django-admin (same DB router as the admin UI).
    """
    script = """
from triage_auth.models import TriageUser, TriageUserRole
user = TriageUser.objects.order_by("id").first()
if user is None:
    print("SKIP_NO_USERS")
else:
    count = TriageUserRole.objects.filter(user=user).count()
    print(f"OK roles={count}")
"""
    result = subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            str(COMPOSE_FILE),
            "exec",
            "-T",
            "django-admin",
            "python",
            "backend/manage.py",
            "shell",
            "-c",
            script,
        ],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    if result.returncode != 0:
        pytest.fail(
            f"django-admin ORM smoke test failed (exit {result.returncode}):\n"
            f"{result.stderr or result.stdout}"
        )
    out = (result.stdout or "").strip()
    if "SKIP_NO_USERS" in out:
        pytest.skip("No users in auth_users to exercise role inline query")
    assert "OK roles=" in out, out
