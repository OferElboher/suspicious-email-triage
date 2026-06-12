#!/usr/bin/env bash
# ensure-dev-secrets: create gitignored backend/dev.secrets from the example template.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXAMPLE="$ROOT/backend/dev.secrets.example"
TARGET="$ROOT/backend/dev.secrets"

if [[ ! -f "$EXAMPLE" ]]; then
  echo "Missing $EXAMPLE" >&2
  exit 1
fi

if [[ ! -f "$TARGET" ]]; then
  cp "$EXAMPLE" "$TARGET"
  echo "Created backend/dev.secrets from dev.secrets.example"
else
  echo "backend/dev.secrets already exists — leaving unchanged"
fi
