# This module is imported by Django when the settings module is loaded.
# It's being run by Django:
# - Every time Django starts a process that needs settings, i.e., DJANGO_SETTINGS_MODULE.
# - Upon the execution of django.setup(), which again triggers the import of the settings module chain, including <base.py>.
# - On Docker container startup (if Django runs inside container).


from dotenv import load_dotenv
import os
from pathlib import Path
import sys

import sentry_sdk
from sentry_sdk.integrations.django import DjangoIntegration


# Debug off by default.
# Overriden by the settings file of current configuration (<dev.py>/<staging.py>/<prod.py>).
DEBUG = False

# BASE_DIR: root of the backend project.
BASE_DIR = Path(__file__).resolve().parent.parent

# Environment configuration.
ENVIRONMENT = os.getenv("ENVIRONMENT", "dev")
IS_DEV = ENVIRONMENT == "dev"
IS_STAGING = ENVIRONMENT == "staging"
IS_PROD = ENVIRONMENT == "prod"

# Test mode detection (recommended single source of truth).
IS_TEST = "test" in sys.argv or "pytest" in sys.modules or "unittest" in sys.modules

# Celery execution mode.
if IS_TEST:
    # ALWAYS deterministic for tests.
    CELERY_TASK_ALWAYS_EAGER = True
    CELERY_TASK_EAGER_PROPAGATES = True
elif ENVIRONMENT == "dev":
    CELERY_TASK_ALWAYS_EAGER = False
else:
    CELERY_TASK_ALWAYS_EAGER = False

# In development load environment variables from the file backend/.env, if present.
# In staging & production this usually comes from real environment variables.
# (See further info at "Environment configuration" above.)
load_dotenv(
    BASE_DIR / f".env.{ENVIRONMENT}", override=False
)  # Unsetting override makes real env vars override .env, which is correct for Docker & Kubernetes.

# Django secret key.
# This key is used for cryptographic signing (sessions, CSRF tokens, etc.).
# Along development it is set to a fallback value.
# The staging & production secret key must never be stored in Git repositories, but loaded from environment variable instead.
# (See further info at "Environment configuration" above.)
SECRET_KEY = os.getenv(
    "DJANGO_SECRET_KEY", "dev-secret"
)  # Sample real world secret key: "django-insecure-0^m&-j-(eapfa@f#a9eyl&wp8*44cyks^((-eqblemye7j6+%9"

# Hosts allowed to connect, that is, a list of hostnames or IP addresses that Django will accept HTTP requests from.
# Overriden by the settings file of current configuration (<dev.py>/<staging.py>/<prod.py>).
# When DEBUG is True, an empty list only allows a limited set of development-related hosts (e.g., localhost, 127.0.0.1, api.company.com).
# If DEBUG is False, an empty list will prevent the application from serving any requests not using those specific hosts.
# Django raises a DisallowedHost error (400 response) for incoming requests from non-allowed hosts.
# Along development it is set empty (see above).
# In staging & production must be set using an environment variable in order to prevent connections with restricted hosts.
# Django uses it to prevent HTTP Host header attacks, which are a type of security vulnerability where a request can pretend to be sent to the server from a fake host.
# (See further info at "Environment configuration" above.)
ALLOWED_HOSTS = os.getenv("ALLOWED_HOSTS", "").split(",")

# Installed applications.
# - Django core apps: admin, auth, contenttypes, sessions, messages, staticfiles
# - REST framework: for API endpoints
# - core: custom app containing Kafka producers/consumers and Celery tasks
# - health: custom app containing health checks
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "core",
    "health",
    "triage_auth",
]

# Middleware stack.
# Handles requests/responses: security, sessions, CSRF, auth, messages, clickjacking protection.
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# Root URL configuration for the project (REST API endpoints).
# The Python module that Django loads to know how to route incoming HTTP requests to the appropriate views.
# 'xxx.urls' refers to the Python module xxx/urls.py.
# In other words, it tells Django where the URL patterns live.
# Django will import this module, and look for a variable called urlpatterns, the list of all URL patterns for the project.
ROOT_URLCONF = "backend.config.urls"

# Templates configuration.
# A list of template engine configurations.
# Templates are HTML files or other text formats that Django can render and send as HTTP responses.
# Even in case of a REST API that primarily returns JSON, TEMPLATES is still used for:
# - The admin interface (/admin)
# - Any HTML pages you may render in views
# - Error pages (404.html, 500.html)
# Backend: DjangoTemplates
# APP_DIRS: True to load templates from apps (e.g., admin)
# Context processors: request, auth, messages
TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",  # The template engine to use — here, Django’s default engine.
        "DIRS": [],  # Additional directories for templates
        "APP_DIRS": True,  # True, so Django will look for templates inside each installed app under the templates/ folder.
        "OPTIONS": {  # Functions that inject variables into all templates automatically.
            "context_processors": [
                "django.template.context_processors.request",  # Adds the request object to templates.
                "django.contrib.auth.context_processors.auth",  # Adds user, perms objects.
                "django.contrib.messages.context_processors.messages",  # Adds messages for the user.
            ],
        },
    },
]

# WSGI entrypoint: used in production deployment to run the API layer.
WSGI_APPLICATION = "backend.config.wsgi.application"

# Database configuration.
# PostgreSQL: structured storage
# Matches docker-compose credentials.
# While along deveopment the defaults are used, in production systems environment variables are used.
# All credentials are read from environment variables to avoid storing secrets in source code.
# With HOST, the service name defined in docker-compose should be used, not "localhost".
# Defaults allow local development without configuration.
# Along development it is set empty (see above).
# In production must be set using an environment variable in order to prevent connections with restricted hosts;
# (See further info at "Environment configuration" above.)
# Optional fallback to SQLITE (instead of PosetgreSQL along local development).
# Activated ONLY when explicitly requested:
#     poetry run env USE_SQLITE=true python backend/manage.py test -v 2
# Why:
# - Allows lightweight local dev without Docker/Postgres
# - Keeps CI and production using Postgres
USE_SQLITE = os.getenv("USE_SQLITE", "false").lower() == "true" or IS_TEST
if USE_SQLITE:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.sqlite3",
            "NAME": BASE_DIR / "db.sqlite3",
        }
    }
else:
    DATABASES = {
        "default": {
            "ENGINE": "django.db.backends.postgresql",
            "NAME": os.getenv("POSTGRES_DB", "demo"),
            "USER": os.getenv("POSTGRES_USER", "demo"),
            "PASSWORD": os.getenv("POSTGRES_PASSWORD", "demo"),
            "HOST": os.getenv("POSTGRES_HOST", "postgres"),
            "PORT": os.getenv("POSTGRES_PORT", "5432"),
        }
    }

# Password validators for strong admin credentials.
AUTH_PASSWORD_VALIDATORS = [
    {
        "NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"
    },
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Django admin authenticates against Node-owned auth_users via triage_auth backend.
AUTHENTICATION_BACKENDS = ["triage_auth.backends.TriageAuthBackend"]

# Link shown in admin UI back to the React triage app (override in env for staging/prod).
TRIAGE_APP_PUBLIC_URL = os.getenv("APP_PUBLIC_URL", "http://localhost:3001")
DJANGO_ADMIN_PUBLIC_URL = os.getenv("DJANGO_ADMIN_PUBLIC_URL", "http://localhost:8000/admin/")

# Internationalization.
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# Static files (CSS, JavaScript, Images).
STATIC_URL = "/static/"
STATIC_ROOT = "/app/staticfiles"

# RabbitMQ configuration.
# RabbitMQ credentials and vhost.
RABBITMQ_USER = os.getenv("RABBITMQ_USER", "demo")
RABBITMQ_PASSWORD = os.getenv("RABBITMQ_PASSWORD", "demo")
RABBITMQ_VHOST = os.getenv("RABBITMQ_VHOST", f"/{ENVIRONMENT}")
RABBITMQ_HOST = os.getenv("RABBITMQ_HOST", "rabbitmq")
RABBITMQ_PORT = os.getenv("RABBITMQ_PORT", "5672")

# Celery configuration.
# The broker connects Celery to RabbitMQ.
CELERY_BROKER_URL = os.getenv(
    "CELERY_BROKER_URL",
    f"amqp://{RABBITMQ_USER}:{RABBITMQ_PASSWORD}@{RABBITMQ_HOST}:{RABBITMQ_PORT}{RABBITMQ_VHOST}",
)
# Ensure tasks (Kafka -> Celery) are serialized in JSON.
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"

# Sentry error tracking.
# Sentry collects runtime exceptions and performance metrics.
# Enabled only when SENTRY_DSN is defined.
# Automatically tagged with environment (dev/staging/prod).
SENTRY_ENABLED = os.getenv("SENTRY_ENABLED", "False") == "True"
SENTRY_DSN = os.getenv("SENTRY_DSN")
if SENTRY_ENABLED and SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=ENVIRONMENT,
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "1.0")),
        send_default_pii=False,
        enable_logs=True,
        integrations=[DjangoIntegration()],
    )
