#!/usr/bin/env bash
# setup-and-build-dev: install missing local prerequisites, then build dev Docker images.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT/infra/docker/docker-compose.yml"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: bash scripts/setup-and-build-dev.sh"
  echo "Runs setup-local-dev.sh, prompts for bootstrap admin email, then builds the dev Docker Compose images."
  echo "Start the stack afterward with:"
  echo "  DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up"
  exit 0
fi

bash "$ROOT/scripts/setup-local-dev.sh"
bash "$ROOT/scripts/ensure-dev-secrets.sh"
bash "$ROOT/scripts/configure-dev-bootstrap-admin.sh"

cd "$ROOT"
echo "Building dev Docker Compose images..."
DEPLOYMENT_ENV=dev docker compose -f "$COMPOSE_FILE" build

echo "Dev setup and image build completed."
echo "Start services with: DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up"
echo "User administration (Django admin) requires the django-admin service on port 8000 — see docs/auth_guide_django_admin_users.md"
