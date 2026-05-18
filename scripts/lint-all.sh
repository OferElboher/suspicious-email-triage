#!/usr/bin/env bash
# lint-all: run every project linter, installing local libraries only when missing.
set -euo pipefail

# ROOT: absolute repository path, so the script works from any caller directory.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Backend JavaScript lint: install dependencies only when backend/node_modules is absent.
cd "$ROOT/backend"
if [[ ! -d node_modules ]]; then npm install; fi
npm run lint

# Frontend React lint: install dependencies only when frontend/node_modules is absent.
cd "$ROOT/frontend"
if [[ ! -d node_modules ]]; then npm install; fi
npm run lint

# Python lint: install Ruff only if the CLI is unavailable.
cd "$ROOT/ai_service"
python3 -m ruff --version >/dev/null 2>&1 || python3 -m pip install -q ruff
python3 -m ruff check .
