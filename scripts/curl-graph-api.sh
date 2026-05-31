#!/usr/bin/env bash
# curl-graph-api.sh — log in to the Node API and call an authenticated /graph/* route.
#
# Why this script exists:
# - Port 3000 = Express API (JWT-protected /graph/*)
# - Port 3001 = React dev server (returns HTML, not JSON)
# - GRAPH_INTERNAL_TOKEN is for Celery worker callbacks only — not a user JWT
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_BASE="${API_BASE:-http://localhost:3000}"
EMAIL="${1:-}"
PASSWORD="${2:-}"
ENDPOINT="${3:-/graph/status}"

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  cat >&2 <<EOF
Usage: bash scripts/curl-graph-api.sh EMAIL PASSWORD [ENDPOINT_PATH]

Examples:
  bash scripts/curl-graph-api.sh you@example.com YOUR_PASSWORD
  bash scripts/curl-graph-api.sh you@example.com YOUR_PASSWORD /graph/campaigns

Important:
  - Use http://localhost:3000 for API calls (Node/Express).
  - http://localhost:3001 is the React UI only — curl there returns HTML.
  - Do not use GRAPH_INTERNAL_TOKEN as Bearer JWT; it is for worker sync only.
EOF
  exit 1
fi

LOGIN_JSON="$(curl -sS -X POST "$API_BASE/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}")"

TOKEN="$(printf '%s' "$LOGIN_JSON" | python3 -c "
import json, sys
try:
    data = json.load(sys.stdin)
except json.JSONDecodeError:
    sys.exit(0)
print(data.get('token') or data.get('accessToken') or '')
" 2>/dev/null || true)"

if [[ -z "$TOKEN" ]]; then
  echo "Login failed against $API_BASE — is the backend running? Response: $LOGIN_JSON" >&2
  exit 1
fi

curl -sS -H "Authorization: Bearer ${TOKEN}" "${API_BASE}${ENDPOINT}"
echo
