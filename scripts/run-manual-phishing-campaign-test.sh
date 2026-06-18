#!/usr/bin/env bash
# run-manual-phishing-campaign-test.sh — automated version of graph_test_manual_phishing_identification.md
#
# Submits the two secure-login.example-phish.test demo emails, waits for Celery analysis,
# prunes stale Neo4j orphan nodes, and asserts the campaign subgraph has no disconnected nodes.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
API_BASE="${API_BASE:-http://localhost:3000}"
COMPOSE_FILE="${COMPOSE_FILE:-$ROOT/infra/docker/docker-compose.yml}"
EMAIL="${1:-}"
PASSWORD="${2:-}"
INDICATOR="secure-login.example-phish.test"
PRUNE_ORPHANS="${PRUNE_ORPHANS:-true}"
ATTEMPTS="${ATTEMPTS:-40}"
POLL_SECS="${POLL_SECS:-3}"
REQUEUE_AFTER="${REQUEUE_AFTER:-5}"

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  cat >&2 <<EOF
Usage: bash scripts/run-manual-phishing-campaign-test.sh EMAIL PASSWORD

Prerequisites:
  - Docker stack running (backend, ai-celery, ai-kafka-dispatch, neo4j, redpanda)
  - DISABLE_LLM=true in worker (default dev)

Optional env:
  PRUNE_ORPHANS=false   skip POST /dev/prune-graph before checking the subgraph
  API_BASE=http://localhost:3000
  ATTEMPTS=40           max poll iterations per review (default 40 × 3s ≈ 2 min)
  POLL_SECS=3           seconds between status polls
  REQUEUE_AFTER=5       re-publish Kafka event after N pending polls (0 = disable)
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

requeue_review() {
  local review_id="$1"
  local resp
  resp="$(curl -sS -X POST -H "Authorization: Bearer ${TOKEN}" \
    "$API_BASE/dev/requeue-review/${review_id}" 2>/dev/null || true)"
  if printf '%s' "$resp" | grep -q '"ok":true'; then
    echo "  requeued OK"
  elif [[ -n "$resp" ]]; then
    echo "  requeue response: $resp" >&2
  fi
}

preflight_workers() {
  echo "==> Preflight: checking async pipeline services"
  local missing=0
  if ! command -v docker >/dev/null 2>&1; then
    echo "  WARN: docker not in PATH — skipping container checks" >&2
    return 0
  fi
  for svc in ai-celery ai-kafka-dispatch redpanda backend; do
    if ! docker compose -f "$COMPOSE_FILE" ps --status running "$svc" 2>/dev/null | grep -q "$svc"; then
      echo "  FAIL: service '$svc' is not running" >&2
      missing=1
      continue
    fi
    local tail_logs
    tail_logs="$(docker compose -f "$COMPOSE_FILE" logs --tail=8 "$svc" 2>/dev/null || true)"
    if printf '%s' "$tail_logs" | grep -qE 'No such file or directory|exited with code|Error'; then
      if printf '%s' "$tail_logs" | grep -q 'docker-entrypoint-with-secrets'; then
        echo "  FAIL: '$svc' is crash-looping — missing or broken entrypoint script in the image." >&2
        echo "       Rebuild with: DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --build $svc" >&2
        missing=1
        continue
      fi
    fi
    if [[ "$svc" == "ai-kafka-dispatch" ]]; then
      if ! printf '%s' "$tail_logs" | grep -qE 'consumer started|dispatched'; then
        echo "  WARN: '$svc' is up but Kafka consumer may not have started — check: docker compose logs $svc" >&2
        missing=1
      fi
    fi
    echo "  OK: $svc"
  done
  if [[ "$missing" -eq 1 ]]; then
    cat >&2 <<EOF

The async pipeline cannot process reviews while ai-kafka-dispatch is down.
Reviews stay status=pending until Kafka → Celery completes analysis.

Fix:
  cd ~/suspicious-email-triage
  DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --build \\
    ai-kafka-dispatch ai-celery backend

EOF
    exit 1
  fi

  if command -v docker >/dev/null 2>&1; then
    local queue_depth
    queue_depth="$(docker exec triage-redis redis-cli llen celery 2>/dev/null || echo "0")"
    if [[ "${queue_depth:-0}" -gt 50 ]]; then
      echo "  WARN: Celery queue depth is ${queue_depth} — new reviews will wait behind backlog." >&2
      cat >&2 <<EOF

Turn off simulation in the UI, then clear the dev queue:
  curl -sS -X POST -H "Authorization: Bearer TOKEN" http://localhost:3000/dev/reset-local-state
  # or flush only the Celery list (developer/admin JWT required for reset-local-state):
  docker exec triage-redis redis-cli del celery

Then re-run this script.

EOF
      exit 1
    fi
  fi
}

wait_for_completed() {
  local review_id="$1"
  local label="$2"
  local pending_streak=0
  for ((i = 1; i <= ATTEMPTS; i++)); do
    local json http_code
    json="$(curl -sS -w "\n%{http_code}" -H "Authorization: Bearer ${TOKEN}" \
      "$API_BASE/reviews/${review_id}" 2>/dev/null || echo -e "\n000")"
    http_code="$(printf '%s' "$json" | tail -n1)"
    json="$(printf '%s' "$json" | sed '$d')"

    if [[ "$http_code" != "200" ]]; then
      echo "  [$label] attempt ${i}/${ATTEMPTS}: HTTP ${http_code} for GET /reviews/${review_id}" >&2
      printf '%s\n' "$json" >&2
      sleep "$POLL_SECS"
      continue
    fi

    local status verdict
    status="$(printf '%s' "$json" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('status',''))")"
    verdict="$(printf '%s' "$json" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print(d.get('override',{}).get('verdict') or d.get('analysisResult',{}).get('verdict') or '')
")"

    echo "  [$label] attempt ${i}/${ATTEMPTS}: status=${status:-unknown} verdict=${verdict:-pending}"

    if [[ "$status" == "completed" ]]; then
      return 0
    fi
    if [[ "$status" == "failed" ]]; then
      echo "Review ${review_id} failed analysis." >&2
      printf '%s\n' "$json" >&2
      return 1
    fi

    if [[ "$status" == "pending" || "$status" == "processing" ]]; then
      pending_streak=$((pending_streak + 1))
      if [[ "$REQUEUE_AFTER" -gt 0 && "$pending_streak" -eq "$REQUEUE_AFTER" ]]; then
        echo "  [$label] still ${status} — re-publishing Kafka ingest event (POST /dev/requeue-review)"
        requeue_review "$review_id"
      fi
    fi

    sleep "$POLL_SECS"
  done
  echo "Timed out waiting for review ${review_id} (${label}). Last status=${status:-unknown}." >&2
  echo "Check: docker compose logs ai-celery ai-kafka-dispatch" >&2
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

disconnected = [n for n in nodes if not any(
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

preflight_workers

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
ID_A="$(printf '%s' "$RESP_A" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id') or d.get('_id') or '')")"

echo "==> Submitting Message B"
RESP_B="$(submit_review \
  "Your account will be locked" \
  "Click here: https://${INDICATOR}/update" \
  "Attacker B" \
  "attacker-b@other-domain.test")"
ID_B="$(printf '%s' "$RESP_B" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id') or d.get('_id') or '')")"

if [[ -z "$ID_A" || -z "$ID_B" ]]; then
  echo "Failed to create reviews." >&2
  echo "A: $RESP_A" >&2
  echo "B: $RESP_B" >&2
  exit 1
fi

echo "==> Waiting for analysis (review A: ${ID_A})"
wait_for_completed "$ID_A" "A"
echo "==> Waiting for analysis (review B: ${ID_B})"
wait_for_completed "$ID_B" "B"

echo "==> Verifying campaign subgraph for ${INDICATOR}"
assert_subgraph_connected

echo "Manual phishing campaign test passed."
