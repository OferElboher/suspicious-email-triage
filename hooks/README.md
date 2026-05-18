# `hooks/` — pre-commit helper scripts

This folder holds shell scripts that are called by git hook tooling.

## Files

- `run-tests.sh` — legacy pre-push test runner used by `.pre-commit-config.yaml`.

The newer Husky hooks call the scripts in `scripts/`, while this folder remains for compatibility with the existing pre-commit configuration.
