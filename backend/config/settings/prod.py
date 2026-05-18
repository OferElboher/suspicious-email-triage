# Django settings for the production slice.
# Production should use remote managed services and secret-manager supplied values.


# Ruff ignore: Django settings commonly import shared base values with `*`.
# ruff: noqa: F403

# Import shared Django defaults before production overrides.
from .base import *

# DEBUG is always off in production.
DEBUG = False

# ALLOWED_HOSTS should list real production domains, supplied during deployment.
# ALLOWED_HOSTS = ["<company-domain-url>"]
