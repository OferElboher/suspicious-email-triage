# Central logging and search guide

This guide describes the **free-path central logging** implemented for [TBD §1.3](roadmap_tbd.md#13-central-logging-and-search-p0p1): one **JSON-lines** file shared by Node and Python services, searchable via the API or local tools (**lnav**, **grep**). No OpenSearch or Datadog is required for dev and demos.

**Hands-on viewing (lnav, copy from Docker, curl examples):** [tech_postgresql_dbeaver_auth_logs.md](tech_postgresql_dbeaver_auth_logs.md) — Part 2 and Options A–D.

**Related:** [tech_env_configuration.md](tech_env_configuration.md), [auth_guide_rbac.md](auth_guide_rbac.md).

---

## What is `merged.log`?

Every participating service appends **one JSON object per line** (newline-delimited JSON, NDJSON):

```json
{"ts":"2026-06-01T10:15:00.000Z","level":"info","topic":"reviews","message":"created","id":"..."}
```

| Field | Meaning |
|-------|---------|
| `ts` | ISO-8601 timestamp |
| `level` | `info`, `warn`, `error`, or `critical` |
| `topic` | Logical area (`reviews`, `auth`, `graph`, `ops`, …) |
| `message` | Human-readable summary |
| *(extra keys)* | Structured metadata (ids, errors, hints in non-prod) |

**Implementation:** `backend/src/lib/logger.js` (Node). Python workers use the same path via `ai_service/app/logutil.py` and env alignment.

**Paths:**

| Environment | Typical path |
|-------------|--------------|
| Docker Compose | `/var/log/triage/merged.log` on volume `triage-logs` |
| Local Node (no volume) | `backend/logs/merged.log` (or `MERGED_LOG_PATH` / `LOG_DIR`) |

Configure in `backend/.env.dev` (example):

```bash
MERGED_LOG_PATH=./logs/merged.log
# In containers: MERGED_LOG_PATH=/var/log/triage/merged.log
```

The logger also mirrors lines to **container stdout** for `docker compose logs`; the **authoritative searchable file** for cross-service history is `merged.log`.

---

## Docker volume pattern

`infra/docker/docker-compose.yml` mounts `triage-logs:/var/log/triage` on **backend**, **dispatcher**, **celery-worker**, and related services so all writers share one file.

To browse on the host without API access, copy the file out or bind-mount — see [tech_postgresql_dbeaver_auth_logs.md](tech_postgresql_dbeaver_auth_logs.md#option-b--copy-log-to-wsl-open-in-vs-code--cursor-simple-gui-search).

---

## `GET /logs/search` (authenticated)

**Route:** `GET /logs/search`  
**Permission:** `logs.read` (typically **admin** role)  
**Implementation:** `backend/src/lib/logSearch.js`, registered in `backend/src/http/createApp.js`.

Requires `Authorization: Bearer <JWT>` after login.

### Query parameters

| Parameter | Meaning |
|-----------|---------|
| `keyword` | Case-insensitive match in `message` and full JSON line (unless `regex=true`) |
| `regex` | When `true`, treat `keyword` as a JavaScript regular expression |
| `messagePattern` | Regex applied to the `message` field only |
| `topic` | Substring match on `topic` |
| `level` | Exact match on `level` (`info`, `warn`, `error`, …) |
| `service` | Exact match on optional `service` field |
| `from`, `to` | ISO timestamps filtering `ts` |
| `limit` | Max rows (default 200, maximum 2000) |
| `offset` | Skip first N matching rows (pagination) |

### React UI

Signed-in users with **`logs.read`** (typically admin) open the **Search unified logs** sub-window (`#logs` icon in the navigation bar). The panel mirrors these query parameters and renders matching NDJSON lines. See [ui_guide_app_navigation.md](ui_guide_app_navigation.md).

### Example

```bash
TOKEN="<your-jwt-from-POST-/auth/login>"

curl -sS "http://localhost:3000/logs/search?keyword=simulation&limit=50" \
  -H "Authorization: Bearer ${TOKEN}"

curl -sS "http://localhost:3000/logs/search?topic=reviews&from=2026-06-01T00:00:00Z&limit=100" \
  -H "Authorization: Bearer ${TOKEN}"
```

Response shape:

```json
{
  "path": "/var/log/triage/merged.log",
  "entries": [ { "ts": "...", "level": "info", "topic": "...", "message": "..." } ],
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
  "topics": { "reviews": 120, "auth": 45 },
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
| **grep** / **rg** | Quick one-off searches in CI or scripts |
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
- Use placeholder emails/passwords in docs and examples — never commit real credentials.

---

## Tests

- `backend/__tests__/opsApi.test.js` — `/ops/logs/summary` permission and shape.

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong></p>

```bash
cd ~/suspicious-email-triage/backend
npm test -- --watchAll=false --testPathPattern=opsApi
```

</div>
- Broader stack checks: [stack_guide_pre_push_verification.md](stack_guide_pre_push_verification.md).
