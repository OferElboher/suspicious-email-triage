#!/usr/bin/env bash
# bootstrap-auth-admin: create auth tables, roles, and bootstrap admin when auth_users is empty.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/infra/docker/docker-compose.yml")

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: bash scripts/bootstrap-auth-admin.sh"
  echo "Ensures postgres is up, then seeds auth schema/roles and creates bootstrap admin if no users exist."
  echo "Email/password: AUTH_BOOTSTRAP_* in backend/.env (configure with scripts/configure-dev-bootstrap-admin.sh)"
  echo "Auth reset / login recovery: docs/dev_auth_tables_reset_and_admin_recovery.md"
  exit 0
fi

cd "$ROOT"
DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-dev}"
export DEPLOYMENT_ENV

echo "Starting postgres (and backend image for exec)..."
"${COMPOSE[@]}" up -d postgres backend

echo "Waiting for postgres..."
"${COMPOSE[@]}" exec postgres pg_isready -U triage -d triage_stats >/dev/null

echo "Seeding auth schema, roles, and bootstrap admin..."
"${COMPOSE[@]}" exec -T backend node -e "
const auth = require('./src/auth/authPg');
(async () => {
  await auth.ensureAuthSchema();
  await auth.seedRolesAndPermissions();
  const created = await auth.bootstrapAdminUser();
  if (created) {
    console.log('Bootstrap admin created:', created.email);
    console.log('Roles:', (created.roles || []).join(', '));
  } else {
    const users = await auth.listUsers();
    if (users.length === 0) {
      throw new Error('auth_users is empty but bootstrap was skipped unexpectedly');
    }
    console.log('Users already exist; bootstrap skipped. Existing:', users.map((u) => u.email).join(', '));
  }
  process.exit(0);
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
"

echo "Done. Verify with:"
echo "  docker compose -f infra/docker/docker-compose.yml exec postgres psql -U triage -d triage_stats -c \"SELECT email FROM auth_users;\""
