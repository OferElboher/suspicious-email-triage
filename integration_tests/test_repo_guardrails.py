"""Repository guardrails — always run on pre-push (no Docker required)."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_pytest_ini_excludes_legacy_django_tests():
    """pytest.ini must not collect backend/core Django tests (Poetry env only)."""
    ini = (ROOT / "pytest.ini").read_text(encoding="utf-8")
    assert "integration_tests" in ini
    assert "ai_service/tests" in ini
    assert "norecursedirs" in ini and "backend" in ini


def test_django_admin_uses_sqlite_router():
    """django-admin must not migrate contrib.auth into Postgres."""
    settings = (ROOT / "backend/triage_auth/django_admin_settings.py").read_text(encoding="utf-8")
    assert "DATABASE_ROUTERS" in settings
    assert "sqlite3" in settings


def test_django_admin_unregisters_contrib_auth_models():
    """apps.py disables last_login update and hides duplicate User/Group admin entries."""
    apps = (ROOT / "backend/triage_auth/apps.py").read_text(encoding="utf-8")
    assert "unregister" in apps
    assert "update_last_login" in apps


def test_test_all_invokes_pytest_with_root_config():
    """test-all.sh delegates Python coverage to pytest.ini paths."""
    script = (ROOT / "scripts/test-all.sh").read_text(encoding="utf-8")
    assert "pytest" in script
    ini = (ROOT / "pytest.ini").read_text(encoding="utf-8")
    assert "ai_service/tests" in ini
    assert "integration_tests" in ini


def test_junction_models_use_composite_primary_key():
    """auth_user_roles has no id column — models must declare CompositePrimaryKey."""
    models_src = (ROOT / "backend/triage_auth/models.py").read_text(encoding="utf-8")
    assert "class TriageUserRole" in models_src
    assert "CompositePrimaryKey" in models_src
    assert 'CompositePrimaryKey("user", "role")' in models_src
    assert "class TriageRolePermission" in models_src
    assert 'CompositePrimaryKey("role", "permission")' in models_src


def test_user_admin_avoids_composite_pk_inlines():
    """
    Django admin inlines POST composite PKs as '(2, 1)' but CompositePrimaryKey expects JSON.

    User roles must be edited via the main form multi-select, not TabularInline.
    """
    admin_src = (ROOT / "backend/triage_auth/admin.py").read_text(encoding="utf-8")
    assert "TriageUserRoleInline" not in admin_src
    assert "class TriageUserRoleInline" not in admin_src
    assert "inlines = [" not in admin_src
    assert "_sync_user_roles" in admin_src
    assert "ModelMultipleChoiceField" in admin_src
