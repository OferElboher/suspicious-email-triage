#!/usr/bin/env bash
# run-manual-phishing-campaign-test.sh — automated version of graph_test_manual_phishing_identification.md
#
# Submits the two secure-login.example-phish.test demo emails, waits for Celery analysis,
# prunes stale Neo4j orphan nodes, and asserts the campaign subgraph has no disconnected nodes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_BASE="${API_BASE:-http://localhost:3000}"
EMAIL="${1:-}"
PASSWORD="${2:-}"
INDICATOR="secure-login.example-phish.test"
PRUNE_ORPHANS="${PRUNE_ORPHANS:-true}"

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  cat >&2 <<EOF
Usage: bash scripts/run-manual-phishing-campaign-test.sh EMAIL PASSWORD

Prerequisites:
  - Docker stack running (backend, ai-celery, ai-kafka-dispatch, neo4j)
  - DISABLE_LLM=true in worker (default dev)

Optional env:
  PRUNE_ORPHANS=false   skip POST /dev/prune-graph before checking the subgraph
  API_BASE=http://localhost:3000
EOF
  exit 1
fi

login() {
  curl -sS -X POST "$API_BASE/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}"
}

extract_token() {
  python3 -c "
import json, sys
data = json.load(sys.stdin)
print(data.get('token') or data.get('accessToken') or '')
"
}

submit_review() {
  local subject="$1"
  local body="$2"
  local sender_name="$3"
  local sender_email="$4"
  curl -sS -X POST "$API_BASE/reviews" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    -d "{\"subject\":\"${subject}\",\"body\":\"${body}\",\"senderName\":\"${sender_name}\",\"senderEmail\":\"${sender_email}\"}"
}

wait_for_completed() {
  local review_id="$1"
  local attempts=60
  local delay=3
  for ((i = 1; i <= attempts; i++)); do
    local json
    json="$(curl -sS -H "Authorization: Bearer ${TOKEN}" "$API_BASE/reviews/${review_id}")"
    local status
    status="$(printf '%s' "$json" | python3 -c "import json,sys; print(json.load(sys.stdin).get('status',''))")"
    if [[ "$status" == "completed" ]]; then
      return 0
    fi
    if [[ "$status" == "failed" ]]; then
      echo "Review ${review_id} failed analysis." >&2
      printf '%s\n' "$json" >&2
      return 1
    fi
    sleep "$delay"
  done
  echo "Timed out waiting for review ${review_id} to complete." >&2
  return 1
}

assert_subgraph_connected() {
  local json
  json="$(curl -sS -H "Authorization: Bearer ${TOKEN}" \
    "$API_BASE/graph/campaign-subgraph?indicator=$(python3 -c "import urllib.parse; print(urllib.parse.quote('${INDICATOR}'))")")"
  python3 - <<'PY' "$json"
import json, sys

payload = json.loads(sys.argv[1])
nodes = payload.get("nodes") or []
edges = payload.get("edges") or []
node_ids = {n["id"] for n in nodes}
connected = set()
for edge in edges:
    connected.add(edge.get("source"))
    connected.add(edge.get("target"))

disconnected = [n for n in nodes if n["id"] not in connected or not any(
    e.get("source") == n["id"] or e.get("target") == n["id"] for e in edges
)]
if disconnected:
    print("FAIL: subgraph contains nodes without edges:", file=sys.stderr)
    for n in disconnected:
        print(f"  - {n.get('type')} {n.get('id')}", file=sys.stderr)
    sys.exit(1)

if len(nodes) < 2 or len(edges) < 1:
    print("FAIL: expected a connected campaign subgraph with nodes and edges.", file=sys.stderr)
    print(json.dumps(payload, indent=2), file=sys.stderr)
    sys.exit(1)

print(f"OK: {len(nodes)} nodes, {len(edges)} edges, dropped={payload.get('droppedOrphanCount', 0)}")
PY
}

echo "==> Logging in to ${API_BASE}"
LOGIN_JSON="$(login)"
TOKEN="$(printf '%s' "$LOGIN_JSON" | extract_token)"
if [[ -z "$TOKEN" ]]; then
  echo "Login failed: $LOGIN_JSON" >&2
  exit 1
fi

if [[ "$PRUNE_ORPHANS" == "true" ]]; then
  echo "==> Pruning orphan Neo4j nodes (dev route)"
  curl -sS -X POST -H "Authorization: Bearer ${TOKEN}" "$API_BASE/dev/prune-graph" >/dev/null || true
fi

echo "==> Submitting Message A"
RESP_A="$(submit_review \
  "Urgent: verify your account" \
  "Please verify immediately: https://${INDICATOR}/reset" \
  "Attacker A" \
  "attacker-a@fake-mail.test")"
ID_A="$(printf '%s' "$RESP_A" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('_id') or d.get('id') or '')")"

echo "==> Submitting Message B"
RESP_B="$(submit_review \
  "Your account will be locked" \
  "Click here: https://${INDICATOR}/update" \
  "Attacker B" \
  "attacker-b@other-domain.test")"
ID_B="$(printf '%s' "$RESP_B" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('_id') or d.get('id') or '')")"

if [[ -z "$ID_A" || -z "$ID_B" ]]; then
  echo "Failed to create reviews." >&2
  echo "A: $RESP_A" >&2
  echo "B: $RESP_B" >&2
  exit 1
fi

echo "==> Waiting for analysis (review A: ${ID_A})"
wait_for_completed "$ID_A"
echo "==> Waiting for analysis (review B: ${ID_B})"
wait_for_completed "$ID_B"

echo "==> Verifying campaign subgraph for ${INDICATOR}"
assert_subgraph_connected

echo "Manual phishing campaign test passed."
