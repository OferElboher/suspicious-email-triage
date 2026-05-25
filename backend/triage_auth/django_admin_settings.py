"""
Minimal Django settings for the django-admin container.

Uses only triage_auth and Django built-ins — no Celery, REST framework, or legacy core apps.
The full backend.config.settings stack is for the historical Django API/worker image.

Postgres holds Node/triage data; SQLite holds Django admin sessions and internal tables so we
do not duplicate auth tables in PostgreSQL.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent

ENVIRONMENT = os.getenv("ENVIRONMENT", "dev")
load_dotenv(BASE_DIR / f".env.{ENVIRONMENT}", override=False)
load_dotenv(BASE_DIR / ".env", override=False)

SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "dev-secret")
DEBUG = ENVIRONMENT == "dev"
ALLOWED_HOSTS = ["*"] if DEBUG else [h for h in os.getenv("ALLOWED_HOSTS", "").split(",") if h]

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "triage_auth.apps.TriageAuthConfig",
]

MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "triage_auth.admin_urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

# Default SQLite: Django sessions, admin log, contrib.auth (unused UI — see apps.py).
_sqlite_dir = Path(os.getenv("DJANGO_ADMIN_SQLITE_PATH", str(BASE_DIR / "data" / "django_admin.sqlite3")))
_sqlite_dir.parent.mkdir(parents=True, exist_ok=True)

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": str(_sqlite_dir),
    },
    "triage": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.getenv("POSTGRES_DB", "triage_stats"),
        "USER": os.getenv("POSTGRES_USER", "triage"),
        "PASSWORD": os.getenv("POSTGRES_PASSWORD", "triage"),
        "HOST": os.getenv("POSTGRES_HOST", "postgres"),
        "PORT": os.getenv("POSTGRES_PORT", "5432"),
    },
}

DATABASE_ROUTERS = ["triage_auth.db_router.TriageAuthRouter"]

AUTHENTICATION_BACKENDS = ["triage_auth.backends.TriageAuthBackend"]

TRIAGE_APP_PUBLIC_URL = os.getenv("APP_PUBLIC_URL", "http://localhost:3001")
DJANGO_ADMIN_PUBLIC_URL = os.getenv("DJANGO_ADMIN_PUBLIC_URL", "http://localhost:8000/admin/")

LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = "/app/staticfiles"

DEFAULT_AUTO_FIELD = "django.db.models.AutoField"
