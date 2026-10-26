#!/usr/bin/env bash
# Render docs/diagrams/*.mmd to SVG so Markdown preview shows visible arrowheads (Mermaid fenced blocks often omit markers).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DIAG="$ROOT/docs/diagrams"
cd "$ROOT"
for mmd in "$DIAG"/system-flow*.mmd; do
  base="$(basename "$mmd" .mmd)"
  echo "Rendering $base.svg"
  npx --yes @mermaid-js/mermaid-cli@11.4.0 -i "$mmd" -o "$DIAG/$base.svg" -b transparent
done
echo "Done — commit the .svg files alongside .mmd sources."
