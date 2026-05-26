# `scripts/` — repo automation helpers

## Files

- `lint-all.sh` — runs backend eslint, frontend eslint, and `ruff` for Python sources.
- `test-all.sh` — runs backend Jest, frontend CRA tests (CI mode), and pytest (`ai_service/tests` + `integration_tests`; see [pre_push_tests_and_stack_verification.md](../docs/pre_push_tests_and_stack_verification.md)).
- `reset-dev-admin-password.sh` — set a user's password in PostgreSQL via bcrypt (dev script).
- `cleanup-postgres-django-auth-tables.sh` — removes mistaken Django contrib.auth tables from PostgreSQL after the SQLite admin split.
- `setup-local-dev.sh` — checks/install local prerequisites and project dependencies for dev.
- `setup-and-build-dev.sh` — runs `setup-local-dev.sh`, then builds dev Docker Compose images.
- `ensure-ai-service-venv.sh` — creates `ai_service/.venv` and installs Python requirements when imports are missing.
- `bootstrap-auth-admin.sh` — seeds PostgreSQL auth tables/roles and creates bootstrap admin when `auth_users` is empty.
- `configure-dev-bootstrap-admin.sh` — writes bootstrap admin email/password to gitignored `backend/.env`.

Auth table reset and login recovery: [docs/dev_auth_tables_reset_and_admin_recovery.md](../docs/dev_auth_tables_reset_and_admin_recovery.md).

These scripts are intended to be called from Husky hooks and local developer terminals.
