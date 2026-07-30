# Central logging and search guide

This guide describes the **free-path central logging** implemented for [TBD §1.3](roadmap_tbd.md#13-central-logging-and-search-p0p1): one **JSON-lines** file shared by **every application container** in dev, searchable via the REST API, the React **#logs** tab, or local tools (**lnav**, **grep**). You do not need OpenSearch or Datadog to debug cross-service flows locally.

**Hands-on viewing (lnav, copy from Docker, curl examples):** [tech_postgresql_dbeaver_auth_logs.md](tech_postgresql_dbeaver_auth_logs.md) — Part 2 and Options A–D.

**Related:** [tech_env_configuration.md](tech_env_configuration.md), [auth_guide_rbac.md](auth_guide_rbac.md), [data_guide_mailbox_ingest_gateway.md](data_guide_mailbox_ingest_gateway.md) (Go `service=ingest-gateway` filter).

---

## What problem does this solve?

In a microservice-style stack, each container normally logs only to its own stdout. When a mailbox webhook fails halfway through the pipeline, you might grep `docker compose logs backend` and `docker compose logs ingest-gateway` separately and still miss the Celery task that retried. **Central logging** means every service writes the same JSON shape into **one append-only file** on a **shared Docker volume**, so a SOC lead can ask: “show me all `error` lines mentioning `graph` in the last hour” without knowing which container emitted them.

---

## What is `merged.log`?

Every participating service appends **one JSON object per line** (NDJSON — newline-delimited JSON):

```json
{"ts":"2026-06-01T10:15:00.000Z","level":"info","topic":"ingest","message":"internal mailbox review created","service":"backend","reviewId":"507f..."}
```

| Field | Meaning |
|-------|---------|
| `ts` | ISO-8601 timestamp in UTC — used for `from` / `to` filters in `/logs/search`. |
| `level` | Severity: `info`, `warn`, `error`, or `critical` (Node also uses these; Go uses info/warn/error). |
| `topic` | Logical area inside the service — e.g. `reviews`, `auth`, `ingest`, `celery`, `mock-llm`. |
| `message` | Short human-readable summary (what happened). |
| `service` | **Which container wrote the line** — use this to isolate one component (see table below). |
| *(extra keys)* | Structured metadata: `reviewId`, `source`, `error`, `model`, etc. |

### Which `service` values exist in dev Compose?

| `service` value | Container | Implementation module |
|-----------------|-----------|------------------------|
| `backend` | `triage-backend` | `backend/src/lib/logger.js` |
| `ai-celery` | `triage-ai-celery` | `ai_service/app/logutil.py` |
| `ai-kafka-dispatch` | `triage-ai-kafka-dispatch` | `ai_service/app/logutil.py` |
| `ingest-gateway` | `triage-ingest-gateway` | `ingest-gateway/internal/logger/logger.go` |
| `mock-llm` | `triage-mock-llm` | `ai_service/mock_commercial_llm/server.py` → `logutil` |
| `mock-cloud-llm` | `triage-mock-cloud-llm` | `ai_service/mock_cloud_llm/server.py` → `logutil` |
| `django-admin` | `triage-django-admin` | `ensure_dev_bootstrap_admin` → `app.logutil` |
| `legacy-bullmq-worker` | `triage-worker` (optional profile) | same Node logger as backend |

**Pattern:** Twelve-factor app configuration — `MERGED_LOG_PATH` and `SERVICE_NAME` are **environment variables** set in `infra/docker/docker-compose.yml`, not hard-coded paths. Locally (without Docker), services fall back to `backend/logs/merged.log` or `ai_service/logs/merged.log` unless you export `MERGED_LOG_PATH`.

**Technology:** append-only file I/O (`fs.appendFileSync` in Node, `open(O_APPEND)` in Go, Python `open(..., "a")`). Concurrent writers on the shared volume are safe because each write is one atomic line; in-process mutexes (Go) prevent torn lines from a single process.

---

## Paths and Docker volume

| Environment | Typical path |
|-------------|--------------|
| Docker Compose | `/var/log/triage/merged.log` on named volume `triage-logs` |
| Local Node (no volume) | `backend/logs/merged.log` (override with `MERGED_LOG_PATH` or `LOG_DIR`) |

`backend/.env.dev` documents the variable name (not secret values):

```bash
MERGED_LOG_PATH=/var/log/triage/merged.log
# Host-only dev without volume: MERGED_LOG_PATH=./logs/merged.log
```

Each service **also mirrors** lines to container stdout for `docker compose logs <service>`. The **authoritative cross-service timeline** for search APIs is `merged.log`.

`infra/docker/docker-compose.yml` mounts `triage-logs:/var/log/triage` on **backend**, **ai-celery**, **ai-kafka-dispatch**, **ingest-gateway**, **mock-llm**, **mock-cloud-llm**, **django-admin**, and the optional **worker** profile.

To browse on the host without the API, copy the file out — see [tech_postgresql_dbeaver_auth_logs.md](tech_postgresql_dbeaver_auth_logs.md#option-b--copy-log-to-wsl-open-in-vs-code--cursor-simple-gui-search).

---

## `GET /logs/search` (authenticated)

**Route:** `GET /logs/search`  
**Permission:** `logs.read` (typically **admin** role)  
**Implementation:** `backend/src/lib/logSearch.js`, registered in `backend/src/http/createApp.js`.

Requires `Authorization: Bearer <JWT>` after login. Only the **backend** reads the file; other services **write** to it. That keeps RBAC in one place.

### Query parameters

| Parameter | Meaning |
|-----------|---------|
| `keyword` | Case-insensitive match in `message` and full JSON line (unless `regex=true`) |
| `regex` | When `true`, treat `keyword` as a JavaScript regular expression |
| `messagePattern` | Regex applied to the `message` field only |
| `topic` | Substring match on `topic` |
| `level` | Exact match on `level` (`info`, `warn`, `error`, …) |
| `service` | **Exact match** on `service` — e.g. `ingest-gateway` for Go mailbox logs only |
| `from`, `to` | ISO timestamps filtering `ts` |
| `limit` | Max rows (default 200, maximum 2000) |
| `offset` | Skip first N matching rows (pagination) |

### React UI

Signed-in users with **`logs.read`** open **Search unified logs** (`#logs` in the navigation bar). The panel exposes the same filters, including **Service**. See [ui_guide_app_navigation.md](ui_guide_app_navigation.md).

### Examples

```bash
TOKEN="<your-jwt-from-POST-/auth/login>"

# Go mailbox ingest-gateway only
curl -sS "http://localhost:3000/logs/search?service=ingest-gateway&limit=100" \
  -H "Authorization: Bearer ${TOKEN}"

# Mock commercial LLM completions
curl -sS "http://localhost:3000/logs/search?service=mock-llm&topic=mock-llm&limit=50" \
  -H "Authorization: Bearer ${TOKEN}"

# All services — simulation errors
curl -sS "http://localhost:3000/logs/search?keyword=simulation&level=error&limit=50" \
  -H "Authorization: Bearer ${TOKEN}"

curl -sS "http://localhost:3000/logs/search?topic=reviews&from=2026-06-01T00:00:00Z&limit=100" \
  -H "Authorization: Bearer ${TOKEN}"
```

Response shape:

```json
{
  "path": "/var/log/triage/merged.log",
  "entries": [
    {
      "ts": "...",
      "level": "info",
      "topic": "ingest",
      "message": "...",
      "service": "ingest-gateway"
    }
  ],
  "truncated": false
}
```

If the file does not exist yet, `entries` is empty and `path` still reflects the configured location.

---

## `GET /ops/logs/summary` (authenticated)

**Route:** `GET /ops/logs/summary`  
**Permission:** `logs.read`  
**Implementation:** `backend/src/lib/logSummary.js`, `backend/src/api/ops.js`.

Aggregates the **tail** of the merged file (default scan up to 5000 lines, query `limit` capped at 50000):

```bash
curl -sS "http://localhost:3000/ops/logs/summary?limit=5000" \
  -H "Authorization: Bearer ${TOKEN}"
```

Example response:

```json
{
  "path": "/var/log/triage/merged.log",
  "exists": true,
  "topics": { "reviews": 120, "auth": 45, "ingest": 30 },
  "levels": { "info": 150, "warn": 10, "error": 5 },
  "totalLinesScanned": 5000
}
```

Use this for a quick “what topics are noisy?” overview before drilling into `/logs/search` or **lnav**.

---

## Free path: lnav and grep (no cloud cost)

You do **not** need a log SaaS to debug locally.

| Tool | Best for |
|------|----------|
| **lnav** | Interactive filtering, timestamps, JSON pretty-print on WSL |
| **grep** / **rg** | Quick one-off searches — e.g. `grep '"service":"ingest-gateway"' merged.log` |
| **VS Code / Cursor** | Open copied `backend/logs/merged.log`, Ctrl+F |

Workflow summary:

1. Copy from container: `docker compose cp backend:/var/log/triage/merged.log backend/logs/merged.log`
2. `lnav backend/logs/merged.log` or pipe `docker compose exec backend tail -f /var/log/triage/merged.log | lnav`

Full commands and Windows paths: [tech_postgresql_dbeaver_auth_logs.md](tech_postgresql_dbeaver_auth_logs.md).

---

## Production direction (TBD context)

The same **JSON-lines** format can be shipped to OpenSearch, Grafana Loki, Datadog, or CloudWatch by forwarding stdout/file tails. Retention (30 days dev, 1 year prod) is a policy choice outside this repo’s free path.

| Layer | Free path (this repo) | Paid / scale path |
|-------|----------------------|-------------------|
| Storage | Shared file + Docker volume | Managed log index |
| Search | `/logs/search`, lnav, grep | SIEM / Loki / Datadog |
| Summary | `/ops/logs/summary` | Dashboards in Grafana |

---

## Security notes

- Log search routes require JWT and **`logs.read`** — do not expose admin tokens in tickets or screenshots.
- Dev logs may include non-production hints in console output; production should set `DEPLOYMENT_ENV=prod` so sensitive hints stay out of console formatting (file JSON still contains structured fields you choose to log).
- Documentation and examples use **placeholder** tokens and emails — never copy values from `backend/dev.secrets` (gitignored) into markdown.

---

## Tests

Automated coverage verifies the `service` field and Compose wiring:

- `backend/__tests__/logger.test.js` — Node `SERVICE_NAME` in NDJSON
- `backend/__tests__/logSearch.test.js` — `?service=` filter
- `ingest-gateway/internal/logger/logger_test.go` — Go NDJSON shape
- `ai_service/tests/test_logutil.py`, `test_mock_unified_log.py` — Python mocks
- `integration_tests/test_repo_guardrails.py` — Compose volume + env guardrails
- `backend/__tests__/opsApi.test.js` — `/ops/logs/summary` permission and shape

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong></p>

```bash
cd ~/suspicious-email-triage
bash scripts/test-all.sh
```

</div>

Broader stack checks: [stack_guide_pre_push_verification.md](stack_guide_pre_push_verification.md).
