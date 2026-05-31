"""Validate Django settings for dev/staging/prod — used by CI via django-admin container."""
import os
import sys
from pathlib import Path

# Standalone execution (CI: python backend/scripts/check_settings.py) must add backend/ to path
# the same way manage.py does — PYTHONPATH=/app alone does not expose triage_auth.
_BACKEND_DIR = Path(__file__).resolve().parent.parent
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "triage_auth.django_admin_settings")

import django

django.setup()

from django.conf import settings


# Prevent silent misconfiguration acceptance.
env = settings.ENVIRONMENT
assert env in {"dev", "staging", "prod"}, f"Invalid ENVIRONMENT: {env}"

# Enforce basic configuration safety.
if env == "dev":
    assert settings.DEBUG is True
else:
    assert settings.DEBUG is False

assert isinstance(settings.ALLOWED_HOSTS, list)

# Enforce production safety.
if env == "prod":
    assert settings.ALLOWED_HOSTS, "ALLOWED_HOSTS must not be empty in production"

    is_ci = os.getenv("CI") == "true"
    if not is_ci:
        assert not any(
            host in ("localhost", "127.0.0.1") for host in settings.ALLOWED_HOSTS
        ), "ALLOWED_HOSTS must not contain localhost in real production"

print(f"{env}: OK")
