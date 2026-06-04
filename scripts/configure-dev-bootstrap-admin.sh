#!/usr/bin/env bash
# configure-dev-bootstrap-admin: set the dev bootstrap admin email (gitignored backend/.env).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_ENV="$ROOT/backend/.env"
DEV_ENV="$ROOT/backend/.env.dev"
DEFAULT_PASSWORD="temp-admin-pswd"

usage() {
  echo "Usage: bash scripts/configure-dev-bootstrap-admin.sh YOUR_EMAIL@example.com"
  echo "   or: AUTH_BOOTSTRAP_ADMIN_EMAIL=you@example.com bash scripts/configure-dev-bootstrap-admin.sh"
  echo ""
  echo "Writes AUTH_BOOTSTRAP_ADMIN_EMAIL and AUTH_BOOTSTRAP_ADMIN_PASSWORD into backend/.env"
  echo "(gitignored). Docker Compose loads backend/.env after backend/.env.dev so your email"
  echo "overrides the shared dev profile without committing personal data."
  exit "${1:-0}"
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage 0
fi

email="${1:-${AUTH_BOOTSTRAP_ADMIN_EMAIL:-}}"
if [[ -z "$email" ]]; then
  read -r -p "Enter your real admin email for local dev bootstrap: " email
fi

email="$(echo "$email" | tr '[:upper:]' '[:lower:]' | xargs)"
password="${AUTH_BOOTSTRAP_ADMIN_PASSWORD:-$DEFAULT_PASSWORD}"

if [[ -z "$email" || "$email" == "admin@local.test" || "$email" == *"@local.test" ]]; then
  echo "Error: use a real email address you can receive (or use for password reset in dev logs)." >&2
  echo "Example: bash scripts/configure-dev-bootstrap-admin.sh you@gmail.com" >&2
  exit 1
fi

if [[ ! "$email" =~ ^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$ ]]; then
  echo "Error: '$email' does not look like a valid email address." >&2
  exit 1
fi

mkdir -p "$(dirname "$LOCAL_ENV")"
if [[ ! -f "$LOCAL_ENV" ]]; then
  cp "$DEV_ENV" "$LOCAL_ENV"
  echo "Created backend/.env from backend/.env.dev"
fi

upsert_var() {
  local file="$1"
  local key="$2"
  local value="$3"
  if grep -q "^${key}=" "$file" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$file"
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$file"
  fi
}

upsert_var "$LOCAL_ENV" "AUTH_BOOTSTRAP_ADMIN_EMAIL" "$email"
upsert_var "$LOCAL_ENV" "AUTH_BOOTSTRAP_ADMIN_PASSWORD" "$password"

echo "Configured bootstrap admin in backend/.env:"
echo "  AUTH_BOOTSTRAP_ADMIN_EMAIL=$email"
echo "  AUTH_BOOTSTRAP_ADMIN_PASSWORD=$password"
echo ""
echo "If auth_users is still empty, create the admin with:"
echo "  bash scripts/bootstrap-auth-admin.sh"
echo "If login fails but auth_users has rows, see docs/auth_guide_dev_auth_recovery.md"
