# CI/CD environments and build commands

This document describes the three environment slices in a softer, practical way. The short version is:

- **dev** is local and friendly: local MongoDB, PostgreSQL, Redis, and Redpanda/Kafka through Docker Compose.
- **staging** is remote and rehearsal-like: remote databases/queues/statistics stores with staging credentials.
- **prod** is remote and careful: production databases/queues/statistics stores with production credentials.

## Selector variables

The Node API prefers:

```bash
# Selects the product deployment slice; defaults to dev when unset.
DEPLOYMENT_ENV=dev
```

Some Django-oriented scripts may still use:

```bash
# Django-oriented selector used by older settings checks.
ENVIRONMENT=dev
```

When in doubt, set both to the same value during mixed Node/Django checks.

## Install checks before CI-style commands

These checks are safe to paste into a terminal. They do not install anything by surprise; they tell you what is already present and what is missing.

```bash
# Docker is required for local databases, local PostgreSQL stats, and containerized services.
command -v docker >/dev/null 2>&1 && docker --version || echo "Docker is missing"

# Docker Compose starts the multi-service dev stack.
docker compose version >/dev/null 2>&1 && docker compose version || echo "Docker Compose plugin is missing"

# Node runs backend/frontend JavaScript tooling.
command -v node >/dev/null 2>&1 && node --version || echo "Node.js is missing"

# npm installs JavaScript package dependencies.
command -v npm >/dev/null 2>&1 && npm --version || echo "npm is missing"

# Python runs ai_service and the Django tree.
command -v python3 >/dev/null 2>&1 && python3 --version || echo "Python is missing"

# pip installs Python package dependencies when needed.
python3 -m pip --version >/dev/null 2>&1 && python3 -m pip --version || echo "pip is missing"
```

## Local dependency setup (skip when already installed)

Run from the repository root:

```bash
# Root Husky tooling.
test -d node_modules || npm install --prefix .

# Node API dependencies.
test -d backend/node_modules || npm install --prefix backend

# React UI dependencies.
test -d frontend/node_modules || npm install --prefix frontend

# Python async-service dependencies (project venv; avoids PEP 668 system pip blocks).
bash scripts/ensure-ai-service-venv.sh >/dev/null && echo "ai_service/.venv ready"
```

## Development (`dev`)

Development is intentionally local. It should not require remote database credentials.

```bash
# One-shot: install missing tools/libraries and build dev images.
bash scripts/setup-and-build-dev.sh
# or: npm run build:dev
```

```bash
# Start local MongoDB, PostgreSQL, Redis, Redpanda/Kafka, API, Celery worker, and dispatcher.
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up --build
```

Expected healthy signs:

- API logs mention `listening on 3000`.
- MongoDB, PostgreSQL, and Redis containers stay running.
- Celery worker starts without tracebacks.
- Dispatcher logs mention it started consuming.

## Staging (`staging`)

Staging should point at remote staging infrastructure. Use private secrets or CI environment variables; do not commit credentials.

```bash
# Build images with staging intent; actual remote credentials should be injected by CI/secrets.
DEPLOYMENT_ENV=staging docker compose -f infra/docker/docker-compose.yml build
```

## Production (`prod`)

Production should be deployed by controlled automation, not by hand-edited local credentials.

```bash
# Build production-intended images. Deployment should inject production secrets outside git.
DEPLOYMENT_ENV=prod docker compose -f infra/docker/docker-compose.yml build
```

## GitHub Actions CI (`.github/workflows/ci.yml`)

Pull requests and pushes to `main` run:

1. **Settings validation** — `python backend/scripts/check_settings.py` inside the **`django-admin`** Python image (with explicit `django.setup()` and `sys.path` bootstrap for `triage_auth`).
2. **Lint and tests** — `bash scripts/lint-all.sh` and `bash scripts/test-all.sh` (same as local pre-push).

The workflow uses **`actions/checkout@v5`**, which targets Node.js 24 on GitHub runners and avoids Node 20 deprecation warnings from older action versions.

## Django checks (optional, when that tree is active)

The repository contains Django files under `backend/config`, `backend/core`, and `backend/health`. Run Django checks only after the Python/Django dependency set is installed.

```bash
# Check first whether Django can import. If not, skip naturally with a clear message.
python3 - <<'PY'
try:
    import django
    print("Django is installed; settings checks may run")
except ImportError:
    print("Django is not installed; skipping Django-specific checks")
PY
```
