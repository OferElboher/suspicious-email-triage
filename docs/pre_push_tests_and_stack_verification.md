# Pre-push tests and stack verification

This document describes what runs on **`git push`** (Husky **pre-push** hook → `scripts/test-all.sh`) and how optional **live stack** checks behave.

**Related:** [django_admin_user_management.md](django_admin_user_management.md), [windows_dev_startup_run_guide.md](windows_dev_startup_run_guide.md).

---

## When tests run

| Trigger | Script | Hook |
|---------|--------|------|
| `git commit` | `scripts/lint-all.sh` | pre-commit |
| `git push` | `scripts/test-all.sh` | pre-push |

Run manually anytime:

```bash
bash scripts/test-all.sh
```

---

## Layer 1 — Always run (no Docker required)

### Backend (Jest)

- Location: `backend/__tests__/`
- Covers auth password helpers, link extraction, etc.

### Frontend (React Testing Library)

- Location: `frontend/src/**/*.test.js`
- Covers navigation hash routes, admin link visibility, app shell.

### Python guardrails (`integration_tests/test_repo_guardrails.py`)

- `pytest.ini` scopes discovery to `ai_service/tests` and `integration_tests` only.
- **Legacy Django tests** under `backend/core/tests` and `backend/health/tests` are **excluded** (they need the Poetry Django env, not the ai_service venv).
- Asserts django-admin uses the SQLite/Postgres split and unregisters duplicate admin models.

### Python unit tests (`ai_service/tests/`)

- Rule engine and other ai_service logic.

---

## Layer 2 — Live stack checks (skipped if services are down)

Files: `integration_tests/test_postgres_schema.py`, `test_http_endpoints.py`, `test_databases.py`, `test_django_orm.py`.

Guardrails in `test_repo_guardrails.py` (always run) assert junction models declare `CompositePrimaryKey` so Django never `SELECT`s a non-existent `auth_user_roles.id`.

If **Postgres (:5432)**, **Node API (:3000)**, and **Django admin (:8000)** are not all reachable, these tests **skip** with a message (push still succeeds).

When the dev stack **is** running, tests verify:

### PostgreSQL (`triage_stats`)

| Check | Expectation |
|-------|-------------|
| Node auth tables present | `auth_users`, `auth_roles`, `auth_permissions`, `auth_role_permissions`, `auth_user_roles`, `auth_password_reset_tokens` |
| Metrics table present | `review_stats_events` |
| Django tables **absent** | `auth_user`, `auth_group`, `auth_permission`, `django_session`, `django_content_type`, `django_admin_log`, … |
| `auth_users` columns | Includes `email`, `password_hash`, …; **no** `last_login` |
| Junction tables | `auth_user_roles` and `auth_role_permissions` have **no** `id` column (composite PK only) |

If forbidden Django tables still exist from an older build:

```bash
bash scripts/cleanup-postgres-django-auth-tables.sh
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --build django-admin
```

### HTTP endpoints

| URL | Expectation |
|-----|-------------|
| `http://localhost:3000/health` | JSON `{ "ok": true }` |
| `http://localhost:8000/admin/login/` | HTTP 200, login form |
| `http://localhost:8000/admin/` | Redirect to login when unauthenticated |
| `http://localhost:3000/metrics/*` | HTTP 401 without JWT |

### Optional — React dev server (:3001)

Skipped unless `PORT=3001` dev server is running:

- `/` contains “Suspicious email triage”
- `/#analytics` serves the SPA shell

### Optional — MongoDB (:27018) and Redis (:6379)

Skipped unless ports respond; runs `ping` when up.

---

## Django admin vs PostgreSQL (why tests forbid duplicate tables)

| Store | Holds |
|-------|--------|
| **PostgreSQL** `triage_stats` | Node auth (`auth_users`, …), review stats |
| **SQLite** (django-admin container volume) | Django sessions, admin log, contrib.auth internals |

Django admin UI shows **Triage accounts → Users / Roles** only. The old **Authentication and Authorization → Users / Groups** section came from Django contrib.auth tables being migrated into Postgres; that path is fixed by the database router and SQLite default DB.

---

## Configuration files

| File | Role |
|------|------|
| `pytest.ini` | Test paths and exclusions |
| `scripts/test-all.sh` | Orchestrates Jest + CRA + pytest |
| `.husky/pre-push` | Calls `test-all.sh` |

---

## Troubleshooting pre-push failures

| Failure | Fix |
|---------|-----|
| `ModuleNotFoundError: No module named 'django'` on `backend/core/tests` | Ensure you are on latest `main` with `pytest.ini`; do not run bare `pytest` at repo root without config |
| `Missing expected tables` | Start postgres + backend: `docker compose … up -d postgres backend` |
| `Django-internal tables found in Postgres` | Run `scripts/cleanup-postgres-django-auth-tables.sh` |
| Live HTTP tests skip | Normal when stack is stopped; start full dev stack to exercise them |
| Frontend stack tests skip | Start `PORT=3001 npm start --prefix frontend` |

---

## Related docs

- [django_admin_user_management.md](django_admin_user_management.md) — user CRUD in admin UI
- [AUTHENTICATION_AND_RBAC.md](AUTHENTICATION_AND_RBAC.md) — Node auth model
- [scripts/README.md](../scripts/README.md) — script index
