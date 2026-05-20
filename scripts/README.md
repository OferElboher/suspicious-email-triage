# `scripts/` — repo automation helpers

## Files

- `lint-all.sh` — runs backend eslint, frontend eslint, and `ruff` for Python sources.
- `test-all.sh` — runs backend Jest, frontend CRA tests (CI mode), and Python pytest.
- `setup-local-dev.sh` — checks/install local prerequisites and project dependencies for dev.
- `setup-and-build-dev.sh` — runs `setup-local-dev.sh`, then builds dev Docker Compose images.
- `ensure-ai-service-venv.sh` — creates `ai_service/.venv` and installs Python requirements when imports are missing.

These scripts are intended to be called from Husky hooks and local developer terminals.
