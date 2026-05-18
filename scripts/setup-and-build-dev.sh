#!/usr/bin/env bash
# setup-and-build-dev: install missing local prerequisites, then build dev Docker images.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT/infra/docker/docker-compose.yml"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: bash scripts/setup-and-build-dev.sh"
  echo "Runs setup-local-dev.sh, then builds the dev Docker Compose images."
  echo "Start the stack afterward with:"
  echo "  DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up"
  exit 0
fi

bash "$ROOT/scripts/setup-local-dev.sh"

cd "$ROOT"
echo "Building dev Docker Compose images..."
DEPLOYMENT_ENV=dev docker compose -f "$COMPOSE_FILE" build

echo "Dev setup and image build completed."
echo "Start services with: DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up"
