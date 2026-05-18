# Django settings for the staging slice.
# Staging is a remote rehearsal environment: production-like, but not production data.


# Ruff ignore: Django settings commonly import shared base values with `*`.
# ruff: noqa: F403

# Import shared Django defaults before staging overrides.
from .base import *

# DEBUG stays off in staging to mimic production behavior.
DEBUG = False

# ALLOWED_HOSTS lists staging hostnames accepted by Django.
ALLOWED_HOSTS = ["staging.local", "localhost"]
