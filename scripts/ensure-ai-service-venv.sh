#!/usr/bin/env bash
# ensure-ai-service-venv: create ai_service/.venv and install requirements when needed.

set -euo pipefail

ensure_ai_service_venv() {
  local root="${1:?repository root required}"
  local venv_dir="$root/ai_service/.venv"
  local python="$venv_dir/bin/python"
  local pip="$venv_dir/bin/pip"

  if [[ ! -x "$python" ]]; then
    if ! python3 -m venv "$venv_dir" 2>/dev/null; then
      echo "Could not create ai_service/.venv; install python3-venv (e.g. sudo apt install python3-venv)." >&2
      exit 1
    fi
  fi

  if ! "$python" - <<'PY' 2>/dev/null; then
import celery, pymongo, kafka, requests, psycopg, pytest  # noqa: F401
PY
    echo "Installing ai_service Python dependencies into ai_service/.venv ..."
    "$pip" install -r "$root/ai_service/requirements.txt"
  fi

  printf '%s' "$python"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  ensure_ai_service_venv "$ROOT"
fi
