#!/usr/bin/env bash
# bootstrap-auth-admin: create auth tables, roles, and bootstrap admin when auth_users is empty.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE=(docker compose -f "$ROOT/infra/docker/docker-compose.yml")

RESET_PASSWORD=false
if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: bash scripts/bootstrap-auth-admin.sh [--reset-password]"
  echo "Ensures postgres is up, then seeds auth schema/roles and creates bootstrap admin if no users exist."
  echo "  --reset-password  Also reset bootstrap admin password to AUTH_BOOTSTRAP_* (fixes login after rebuild)."
  echo "Email/password: AUTH_BOOTSTRAP_* in backend/.env (configure with scripts/configure-dev-bootstrap-admin.sh)"
  echo "Full build → login flow: docs/stack_guide_build_and_run.md"
  exit 0
fi
if [[ "${1:-}" == "--reset-password" ]]; then
  RESET_PASSWORD=true
fi

cd "$ROOT"
DEPLOYMENT_ENV="${DEPLOYMENT_ENV:-dev}"
export DEPLOYMENT_ENV

echo "Starting postgres (and backend image for exec)..."
"${COMPOSE[@]}" up -d postgres backend

echo "Waiting for postgres..."
"${COMPOSE[@]}" exec postgres pg_isready -U triage -d triage_stats >/dev/null

echo "Seeding auth schema, roles, and bootstrap admin..."
NODE_SCRIPT='
const auth = require("./src/auth/authPg");
const resetMode = process.env.BOOTSTRAP_RESET_PASSWORD === "true";
(async () => {
  await auth.ensureAuthSchema();
  await auth.seedRolesAndPermissions();
  if (resetMode) {
    const result = await auth.resetBootstrapAdminForDev();
    if (!result.ok) {
      throw new Error(result.error || "bootstrap reset failed");
    }
    console.log("Bootstrap admin", result.action + ":", result.email);
    process.exit(0);
  }
  const created = await auth.bootstrapAdminUser();
  if (created) {
    console.log("Bootstrap admin created:", created.email);
    console.log("Roles:", (created.roles || []).join(", "));
  } else {
    const users = await auth.listUsers();
    if (users.length === 0) {
      throw new Error("auth_users is empty but bootstrap was skipped — run configure-dev-bootstrap-admin.sh");
    }
    console.log("Users already exist; bootstrap skipped. Existing:", users.map((u) => u.email).join(", "));
    console.log("Tip: bash scripts/bootstrap-auth-admin.sh --reset-password");
  }
  process.exit(0);
})().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
'
BOOTSTRAP_RESET_PASSWORD="$RESET_PASSWORD" "${COMPOSE[@]}" exec -T -e BOOTSTRAP_RESET_PASSWORD backend node -e "$NODE_SCRIPT"

echo "Done. Verify with:"
echo "  docker compose -f infra/docker/docker-compose.yml exec postgres psql -U triage -d triage_stats -c \"SELECT email FROM auth_users;\""
