"""Repository guardrails — always run on pre-push (no Docker required)."""

from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def test_pytest_ini_excludes_legacy_django_tests():
    ini = (ROOT / "pytest.ini").read_text(encoding="utf-8")
    assert "backend/core" not in ini or "norecursedirs" in ini
    assert "integration_tests" in ini
    assert "ai_service/tests" in ini


def test_django_admin_uses_sqlite_router():
    settings = (ROOT / "backend/triage_auth/django_admin_settings.py").read_text(encoding="utf-8")
    assert "DATABASE_ROUTERS" in settings
    assert "sqlite3" in settings
    assert '"triage"' in settings or "'triage'" in settings


def test_django_admin_unregisters_contrib_auth_models():
    apps = (ROOT / "backend/triage_auth/apps.py").read_text(encoding="utf-8")
    assert "unregister" in apps
    assert "update_last_login" in apps


def test_test_all_invokes_pytest_with_root_config():
    script = (ROOT / "scripts/test-all.sh").read_text(encoding="utf-8")
    assert "pytest" in script
    ini = (ROOT / "pytest.ini").read_text(encoding="utf-8")
    assert "ai_service/tests" in ini
    assert "integration_tests" in ini
    assert "norecursedirs" in ini and "backend" in ini
