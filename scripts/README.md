# `scripts/` — repo automation helpers

## Files

- `lint-all.sh` — runs backend eslint, frontend eslint, and `ruff` for Python sources.
- `test-all.sh` — runs backend Jest, frontend CRA tests (CI mode), and Python pytest.
- `setup-local-dev.sh` — checks/install local prerequisites and project dependencies for dev.

These scripts are intended to be called from Husky hooks and local developer terminals.
