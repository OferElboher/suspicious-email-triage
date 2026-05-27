#!/usr/bin/env bash
# configure-dev-google-oauth: Sign in with Google for email (Gmail API) or app login — no App Passwords.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  echo "Usage:"
  echo "  bash scripts/configure-dev-google-oauth.sh email CLIENT_ID CLIENT_SECRET YOUR@gmail.com"
  echo "  bash scripts/configure-dev-google-oauth.sh login CLIENT_ID CLIENT_SECRET"
  echo ""
  echo "Prerequisites (one-time in Google Cloud Console):"
  echo "  1. Create OAuth 2.0 Client ID (Desktop app or Web application)."
  echo "  2. Add redirect URI: http://localhost:3333/oauth/callback (setup script listener)."
  echo "  3. For login mode, also add: http://localhost:3000/auth/google/callback"
  echo ""
  echo "See docs/google_oauth_email_and_signin.md"
  exit "${1:-0}"
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" || -z "${1:-}" ]]; then
  usage 0
fi

mode="$1"
client_id="${2:-}"
client_secret="${3:-}"
sender="${4:-}"

if [[ "$mode" != "email" && "$mode" != "login" ]]; then
  echo "Error: mode must be 'email' or 'login'." >&2
  usage 1
fi

if [[ -z "$client_id" || -z "$client_secret" ]]; then
  echo "Error: CLIENT_ID and CLIENT_SECRET are required." >&2
  usage 1
fi

if [[ "$mode" == "email" && -z "$sender" ]]; then
  echo "Error: email mode requires YOUR@gmail.com as the fourth argument." >&2
  usage 1
fi

if [[ "$mode" == "email" ]]; then
  node "$ROOT/scripts/google-oauth-setup.js" email "$client_id" "$client_secret" "$sender"
else
  node "$ROOT/scripts/google-oauth-setup.js" login "$client_id" "$client_secret"
fi
