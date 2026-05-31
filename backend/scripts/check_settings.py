"""Validate Django settings for dev/staging/prod — used by CI via django-admin container."""
from django.conf import settings
import os


# Prevent silent misconfiguration acceptance.
env = settings.ENVIRONMENT
assert env in {"dev", "staging", "prod"}, f"Invalid ENVIRONMENT: {env}"

# Enforce basic onfiguration-common safety.
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
