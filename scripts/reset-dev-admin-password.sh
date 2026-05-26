#!/usr/bin/env bash
# reset-dev-admin-password: set a dev user's password directly in PostgreSQL (bcrypt via Node API).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/infra/docker/docker-compose.yml")

usage() {
  echo "Usage: bash scripts/reset-dev-admin-password.sh EMAIL NEW_PASSWORD"
  echo "Example: bash scripts/reset-dev-admin-password.sh you@example.com 'MyNewPass1'"
  echo "Requires postgres + backend containers. See docs/dev_manual_admin_password_reset.md"
  exit "${1:-0}"
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage 0
fi

EMAIL="${1:-}"
PASSWORD="${2:-}"

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "Error: email and new password are required." >&2
  usage 1
fi

if [[ ${#PASSWORD} -lt 8 ]]; then
  echo "Error: password must be at least 8 characters." >&2
  exit 1
fi

cd "$ROOT"
export DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-dev}"

echo "Starting postgres + backend if needed..."
"${COMPOSE[@]}" up -d postgres backend >/dev/null
"${COMPOSE[@]}" exec postgres pg_isready -U triage -d triage_stats >/dev/null

# Escape single quotes for safe embedding in node -e string.
SAFE_EMAIL="${EMAIL//\'/\\\'}"
SAFE_PASSWORD="${PASSWORD//\'/\\\'}"
SAFE_PASSWORD="${SAFE_PASSWORD//\\/\\\\}"

"${COMPOSE[@]}" exec -T backend node -e "
const auth = require('./src/auth/authPg');
(async () => {
  await auth.ensureAuthSchema();
  const row = await auth.setUserPasswordByEmail('${SAFE_EMAIL}', '${SAFE_PASSWORD}');
  if (!row) {
    console.error('No active user found for email: ${SAFE_EMAIL}');
    process.exit(1);
  }
  console.log('Password updated for:', row.email);
  process.exit(0);
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
"

echo "Done. Sign in at http://localhost:3001 with the new password."
