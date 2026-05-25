#!/usr/bin/env bash
# test-all: run backend, frontend, and Python tests before push.
set -euo pipefail

# ROOT: absolute repository path, so Husky and humans can call this safely.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Backend tests: install Node dependencies when missing.
if [[ ! -d "$ROOT/backend/node_modules" ]]; then npm install --prefix "$ROOT/backend"; fi
npm test --prefix "$ROOT/backend" -- --watchAll=false

# Frontend tests: run in CI mode so the command exits instead of watching.
if [[ ! -d "$ROOT/frontend/node_modules" ]]; then npm install --prefix "$ROOT/frontend"; fi
CI=true npm test --prefix "$ROOT/frontend" -- --watchAll=false

# Python: ai_service unit tests + integration_tests (see pytest.ini; legacy backend/core Django tests excluded).
AI_SERVICE_PYTHON="$(bash "$ROOT/scripts/ensure-ai-service-venv.sh")"
PYTHONPATH="$ROOT" "$AI_SERVICE_PYTHON" -m pytest -q
