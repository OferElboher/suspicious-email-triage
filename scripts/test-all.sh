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

# Go: mailbox ingest-gateway unit tests (stdlib + prometheus client only).
# Runs when `go` is on PATH; CI/dev machines without Go skip with a warning.
# Alternative: docker run --rm -v "$ROOT/ingest-gateway:/src" -w /src golang:1.22-alpine go test ./...
if command -v go >/dev/null 2>&1; then
  (cd "$ROOT/ingest-gateway" && go test ./...)
else
  echo "WARN: go not installed — skipping ingest-gateway tests"
fi

# Python: ai_service unit tests + integration_tests (see pytest.ini; legacy backend/core Django tests excluded).
AI_SERVICE_PYTHON="$(bash "$ROOT/scripts/ensure-ai-service-venv.sh")"
PYTHONPATH="$ROOT" "$AI_SERVICE_PYTHON" -m pytest -q
