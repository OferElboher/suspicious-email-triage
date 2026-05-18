#!/usr/bin/env bash
# test-all: run backend, frontend, and Python tests before push.
set -euo pipefail

# ROOT: absolute repository path, so Husky and humans can call this safely.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Backend tests: install Node dependencies only when missing.
cd "$ROOT/backend"
if [[ ! -d node_modules ]]; then npm install; fi
npm test -- --watchAll=false

# Frontend tests: run in CI mode so the command exits instead of watching.
cd "$ROOT/frontend"
if [[ ! -d node_modules ]]; then npm install; fi
CI=true npm test -- --watchAll=false

# Python tests: install ai_service libraries only when key imports fail.
cd "$ROOT/ai_service"
python3 - <<'PY' || python3 -m pip install -q -r requirements.txt
import celery, pymongo, kafka, requests, pytest  # noqa: F401
print("ai_service test dependencies already installed")
PY
PYTHONPATH="$ROOT/ai_service" python3 -m pytest -q
