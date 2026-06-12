#!/usr/bin/env bash
# configure-dev-smtp: switch password-reset email between Mailpit (local) and real SMTP (external).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SECRETS_FILE="$ROOT/backend/dev.secrets"
COMPOSE="DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml"

usage() {
  echo "Usage:"
  echo "  bash scripts/configure-dev-smtp.sh mailpit"
  echo "  bash scripts/configure-dev-smtp.sh external SMTP_HOST SMTP_USER SMTP_PASS [SMTP_FROM]"
  echo ""
  echo "Examples:"
  echo "  bash scripts/configure-dev-smtp.sh mailpit"
  echo "  bash scripts/configure-dev-smtp.sh external smtp.gmail.com you@gmail.com 'xxxx-xxxx-xxxx-xxxx' you@gmail.com"
  echo ""
  echo "Gmail: do NOT use temp-admin-pswd. Prefer Google OAuth instead:"
  echo "  bash scripts/configure-dev-google-oauth.sh email CLIENT_ID CLIENT_SECRET you@gmail.com"
  echo "See docs/auth_guide_google_oauth.md"
  exit "${1:-0}"
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" || -z "${1:-}" ]]; then
  usage 0
fi

mode="$(echo "$1" | tr '[:upper:]' '[:lower:]')"

bash "$ROOT/scripts/ensure-dev-secrets.sh"

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

remove_var() {
  local file="$1"
  local key="$2"
  sed -i "/^${key}=/d" "$file" 2>/dev/null || true
}

if [[ "$mode" == "mailpit" ]]; then
  upsert_var "$SECRETS_FILE" "EMAIL_DELIVERY" "mailpit"
  upsert_var "$SECRETS_FILE" "SMTP_DELIVERY" "mailpit"
  upsert_var "$SECRETS_FILE" "SMTP_HOST" "mailpit"
  upsert_var "$SECRETS_FILE" "SMTP_PORT" "1025"
  upsert_var "$SECRETS_FILE" "SMTP_SECURE" "false"
  upsert_var "$SECRETS_FILE" "SMTP_FROM" "noreply@local.test"
  remove_var "$SECRETS_FILE" "SMTP_USER"
  remove_var "$SECRETS_FILE" "SMTP_PASS"
  echo "Configured Mailpit in backend/dev.secrets (inbox UI: http://localhost:8025)"
  echo ""
  echo "IMPORTANT: recreate backend — Docker reads env only at container create time:"
  echo "  $COMPOSE up -d --force-recreate backend mock-secrets-manager"
  exit 0
fi

if [[ "$mode" != "external" ]]; then
  echo "Error: first argument must be 'mailpit' or 'external' (got '$1')." >&2
  usage 1
fi

host="${2:-}"
user="${3:-}"
pass="${4:-}"
from="${5:-$user}"

if [[ -z "$host" || -z "$user" || -z "$pass" ]]; then
  echo "Error: external mode requires SMTP_HOST SMTP_USER SMTP_PASS [SMTP_FROM]." >&2
  usage 1
fi

if [[ "$host" == *gmail.com* ]] && [[ "$pass" == "temp-admin-pswd" ]]; then
  echo "Error: SMTP_PASS cannot be temp-admin-pswd (that is the triage app login password)." >&2
  echo "Gmail requires a separate App Password from https://myaccount.google.com/apppasswords" >&2
  exit 1
fi

upsert_var "$SECRETS_FILE" "EMAIL_DELIVERY" "external"
upsert_var "$SECRETS_FILE" "SMTP_DELIVERY" "external"
upsert_var "$SECRETS_FILE" "SMTP_HOST" "$host"
upsert_var "$SECRETS_FILE" "SMTP_PORT" "587"
upsert_var "$SECRETS_FILE" "SMTP_SECURE" "false"
upsert_var "$SECRETS_FILE" "SMTP_USER" "$user"
upsert_var "$SECRETS_FILE" "SMTP_PASS" "$pass"
upsert_var "$SECRETS_FILE" "SMTP_FROM" "$from"

echo "Configured external SMTP in backend/dev.secrets (credentials are gitignored)."
echo "Recreate backend and mock-secrets-manager:"
echo "  $COMPOSE up -d --force-recreate backend mock-secrets-manager"
echo "See docs/auth_guide_dev_smtp_recovery.md"
