"""Optional live-stack ORM smoke tests via django-admin container."""

import subprocess

import pytest

from integration_tests.conftest import COMPOSE_FILE, ROOT, requires_stack


def _django_shell(script: str) -> subprocess.CompletedProcess:
    """Run a short Python snippet inside the django-admin container."""
    return subprocess.run(
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


@requires_stack
def test_django_admin_can_query_user_role_assignments():
    """Regression: ORM reads auth_user_roles without selecting a non-existent id column."""
    script = """
from triage_auth.models import TriageUser, TriageUserRole
user = TriageUser.objects.order_by("id").first()
if user is None:
    print("SKIP_NO_USERS")
else:
    count = TriageUserRole.objects.filter(user=user).count()
    print(f"OK roles={count}")
"""
    result = _django_shell(script)
    if result.returncode != 0:
        pytest.fail(
            f"django-admin ORM smoke test failed (exit {result.returncode}):\n"
            f"{result.stderr or result.stdout}"
        )
    out = (result.stdout or "").strip()
    if "SKIP_NO_USERS" in out:
        pytest.skip("No users in auth_users to exercise role query")
    assert "OK roles=" in out, out


@requires_stack
def test_django_admin_form_syncs_password_and_roles():
    """
    Regression: saving user password + roles must not use CompositePrimaryKey inlines.

    Exercises the same ORM paths as TriageUserAdminForm._sync_user_roles.
    """
    script = """
import bcrypt
from triage_auth.models import TriageRole, TriageUser, TriageUserRole

user = TriageUser.objects.order_by("id").first()
role = TriageRole.objects.order_by("id").first()
if user is None or role is None:
    print("SKIP_NO_DATA")
else:
    user.password_hash = bcrypt.hashpw(b"SyncTestPass1", bcrypt.gensalt(rounds=12)).decode("utf-8")
    user.save(update_fields=["password_hash", "updated_at"])
    TriageUserRole.objects.filter(user=user).exclude(role=role).delete()
    TriageUserRole.objects.get_or_create(user=user, role=role)
    assert TriageUserRole.objects.filter(user=user, role=role).exists()
    print("OK")
"""
    result = _django_shell(script)
    if result.returncode != 0:
        pytest.fail(
            f"django-admin sync smoke test failed (exit {result.returncode}):\n"
            f"{result.stderr or result.stdout}"
        )
    out = (result.stdout or "").strip()
    if "SKIP_NO_DATA" in out:
        pytest.skip("Need at least one user and role in Postgres")
    assert "OK" in out, out


@requires_stack
def test_django_admin_log_change_does_not_write_sqlite_audit_row():
    """
    Regression: password/role save must not call LogEntry (FK to SQLite auth_user fails).

    Exercises TriageAdminLoggingMixin.log_change as a no-op.
    """
    script = """
from triage_auth.admin import TriageUserAdmin
from triage_auth.admin_logging import TriageAdminLoggingMixin
from triage_auth.models import TriageUser

assert issubclass(TriageUserAdmin, TriageAdminLoggingMixin)
user = TriageUser.objects.order_by("id").first()
if user is None:
    print("SKIP_NO_USERS")
else:
    class Req:
        pass
    req = Req()
    req.user = user
    admin = TriageUserAdmin(TriageUser, None)
    admin.log_change(req, user, "test-no-op")
    print("OK")
"""
    result = _django_shell(script)
    if result.returncode != 0:
        pytest.fail(
            f"django-admin audit-log smoke test failed (exit {result.returncode}):\n"
            f"{result.stderr or result.stdout}"
        )
    out = (result.stdout or "").strip()
    if "SKIP_NO_USERS" in out:
        pytest.skip("No users in auth_users")
    assert "OK" in out, out
