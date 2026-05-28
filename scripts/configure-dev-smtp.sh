#!/usr/bin/env bash
# configure-dev-smtp: switch password-reset email between Mailpit (local) and real SMTP (external).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCAL_ENV="$ROOT/backend/.env"
DEV_ENV="$ROOT/backend/.env.dev"
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
  echo "See docs/google_oauth_email_and_signin.md"
  exit "${1:-0}"
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" || -z "${1:-}" ]]; then
  usage 0
fi

mode="$(echo "$1" | tr '[:upper:]' '[:lower:]')"

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

if [[ "$mode" == "mailpit" ]]; then
  upsert_var "$LOCAL_ENV" "EMAIL_DELIVERY" "mailpit"
  upsert_var "$LOCAL_ENV" "SMTP_DELIVERY" "mailpit"
  upsert_var "$LOCAL_ENV" "SMTP_HOST" "mailpit"
  upsert_var "$LOCAL_ENV" "SMTP_PORT" "1025"
  upsert_var "$LOCAL_ENV" "SMTP_SECURE" "false"
  upsert_var "$LOCAL_ENV" "SMTP_FROM" "noreply@local.test"
  # Remove external/Gmail SMTP creds so mailpit mode is not overridden to external.
  sed -i '/^SMTP_USER=/d;/^SMTP_PASS=/d' "$LOCAL_ENV" 2>/dev/null || true
  echo "Configured Mailpit in backend/.env (inbox UI: http://localhost:8025)"
  echo ""
  echo "IMPORTANT: recreate backend — Docker reads env only at container create time:"
  echo "  $COMPOSE up -d --force-recreate backend"
  echo ""
  echo "Verify mode inside container:"
  echo "  docker compose -f infra/docker/docker-compose.yml exec backend printenv EMAIL_DELIVERY SMTP_HOST"
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

if [[ "$host" == *gmail.com* ]] && [[ ${#pass} -lt 16 ]]; then
  echo "Warning: Gmail App Passwords are usually 16 characters. If send fails, create one at:" >&2
  echo "  https://myaccount.google.com/apppasswords (2-Step Verification must be on)" >&2
fi

upsert_var "$LOCAL_ENV" "EMAIL_DELIVERY" "external"
upsert_var "$LOCAL_ENV" "SMTP_DELIVERY" "external"
upsert_var "$LOCAL_ENV" "SMTP_HOST" "$host"
upsert_var "$LOCAL_ENV" "SMTP_PORT" "587"
upsert_var "$LOCAL_ENV" "SMTP_SECURE" "false"
upsert_var "$LOCAL_ENV" "SMTP_USER" "$user"
upsert_var "$LOCAL_ENV" "SMTP_PASS" "$pass"
upsert_var "$LOCAL_ENV" "SMTP_FROM" "$from"

echo "Configured external SMTP in backend/.env:"
echo "  SMTP_DELIVERY=external"
echo "  SMTP_HOST=$host"
echo "  SMTP_USER=$user"
echo "  SMTP_FROM=$from"
echo ""
echo "Recreate backend (env is read at container create time):"
echo "  $COMPOSE up -d --force-recreate backend"
echo ""
echo "Then POST /auth/forgot-password or use the UI Forgot password link."
echo "If Gmail rejects credentials, use an App Password — not temp-admin-pswd."
echo "See docs/dev_smtp_password_recovery_email.md"
