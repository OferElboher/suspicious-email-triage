# `scripts/` — repo automation helpers

## Files

- `lint-all.sh` — runs backend eslint, frontend eslint, and `ruff` for Python sources.
- `test-all.sh` — runs backend Jest, frontend CRA tests (CI mode), and pytest (`ai_service/tests` + `integration_tests`; see [stack_guide_running_tests.md](../docs/stack_guide_running_tests.md) and [stack_guide_pre_push_verification.md](../docs/stack_guide_pre_push_verification.md)).
- `reset-dev-admin-password.sh` — set a user's password in PostgreSQL via bcrypt (dev script).
- `cleanup-postgres-django-auth-tables.sh` — removes mistaken Django contrib.auth tables from PostgreSQL after the SQLite admin split.
- `setup-local-dev.sh` — checks/install local prerequisites and project dependencies for dev.
- `setup-and-build-dev.sh` — runs `setup-local-dev.sh`, then builds dev Docker Compose images.
- `ensure-ai-service-venv.sh` — creates `ai_service/.venv` and installs Python requirements when imports are missing.
- `bootstrap-auth-admin.sh` — seeds PostgreSQL auth tables/roles and creates bootstrap admin when `auth_users` is empty.
- `configure-dev-bootstrap-admin.sh` — writes bootstrap admin email/password to gitignored `backend/.env`.
- `configure-dev-smtp.sh` — Mailpit or legacy SMTP password delivery (Gmail: prefer `configure-dev-google-oauth.sh`).
- `configure-dev-google-oauth.sh` — Sign in with Google OAuth for Gmail send + app login (no App Passwords).

Auth table reset and login recovery: [docs/auth_guide_dev_auth_recovery.md](../docs/auth_guide_dev_auth_recovery.md).

These scripts are intended to be called from Husky hooks and local developer terminals.
