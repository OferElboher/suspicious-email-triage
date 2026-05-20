#!/usr/bin/env bash
# lint-all: run every project linter, installing local libraries only when missing.
set -euo pipefail

# ROOT: absolute repository path, so the script works from any caller directory.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Backend JavaScript lint: install dependencies when backend/node_modules is absent.
if [[ ! -d "$ROOT/backend/node_modules" ]]; then npm install --prefix "$ROOT/backend"; fi
npm run lint --prefix "$ROOT/backend"

# Frontend React lint: install dependencies when frontend/node_modules is absent.
if [[ ! -d "$ROOT/frontend/node_modules" ]]; then npm install --prefix "$ROOT/frontend"; fi
npm run lint --prefix "$ROOT/frontend"

# Python lint: Ruff runs from ai_service/.venv (avoids PEP 668 system pip restrictions).
AI_SERVICE_PYTHON="$(bash "$ROOT/scripts/ensure-ai-service-venv.sh")"
"$AI_SERVICE_PYTHON" -m ruff --version >/dev/null 2>&1 || "$AI_SERVICE_PYTHON" -m pip install -q ruff
cd "$ROOT/ai_service"
"$AI_SERVICE_PYTHON" -m ruff check .
