#!/usr/bin/env bash
# docker-entrypoint-with-secrets: fetch credentials from mock AWS Secrets Manager, then exec the app.
set -euo pipefail

DEPLOYMENT="${DEPLOYMENT_ENV:-${APP_ENV:-dev}}"
export DEPLOYMENT_ENV="$DEPLOYMENT"
export APP_ENV="$DEPLOYMENT"

SECRETS_PROVIDER="${SECRETS_PROVIDER:-mock-aws}"
export SECRETS_PROVIDER
export SECRETS_BUNDLE_ID="${SECRETS_BUNDLE_ID:-triage/${DEPLOYMENT}}"
export SECRETS_MANAGER_URL="${SECRETS_MANAGER_URL:-http://mock-secrets-manager:4566}"

echo "[secrets] provider=${SECRETS_PROVIDER} bundle=${SECRETS_BUNDLE_ID} url=${SECRETS_MANAGER_URL}"

# Node services: loadSecrets module merges into process.env before server.js runs.
if [[ "${1:-}" == "node" ]]; then
  export SECRETS_PRELOAD=1
  exec "$@"
fi

# Python services: inject secrets before Celery, kafka_dispatcher, or manage.py start.
if command -v python3 >/dev/null 2>&1; then
  AI_ROOT="${AI_SERVICE_ROOT:-/app}"
  if [[ -f "${AI_ROOT}/app/secrets_provider.py" ]]; then
    eval "$(AI_SERVICE_ROOT="${AI_ROOT}" python3 - <<'PY'
import os, sys
root = os.environ.get("AI_SERVICE_ROOT", "/app")
sys.path.insert(0, root)
from app.secrets_provider import inject_secrets_into_environ
print(inject_secrets_into_environ())
PY
)"
  fi
fi

exec "$@"
