# Elasticsearch review search guide

This guide explains **what Elasticsearch (ES) is**, how this project uses it for **full-text search over email reviews**, and how to run it on a **laptop-friendly** Docker setup without paid cloud services.

**Related:** [roadmap_tbd.md §1.6](roadmap_tbd.md#16-review-full-text-search-elasticsearch--implemented-free-dev-path), [api_reference_rest.md](api_reference_rest.md), [tech_env_configuration.md](tech_env_configuration.md), [stack_guide_windows_docker_databases.md](stack_guide_windows_docker_databases.md).

---

## What is Elasticsearch?

**Elasticsearch** is an open-source **search and analytics engine**. It stores JSON documents in **indexes** (like tables) and answers **full-text queries** quickly — “find reviews whose subject or body mentions *password*.”

In this project, ES is **optional**:

- When enabled, the Node backend **indexes** each review after create, override, and Celery completion.
- When disabled or unreachable, triage still works; search APIs return empty or degraded results (same pattern as Neo4j graceful degradation).

You do **not** need Elasticsearch for basic paste-and-triage demos. Turn it on when you want keyword search across many reviews.

---

## Laptop-friendly Docker settings

The dev stack runs a **single-node** Elasticsearch 8 container with a **256 MB JVM heap** so it fits on typical WSL laptops.

| Setting | Value | Why |
|---------|-------|-----|
| Image | `docker.elastic.co/elasticsearch/elasticsearch:8.15.0` | Matches `@elastic/elasticsearch` client in backend |
| `discovery.type` | `single-node` | No cluster coordination overhead |
| `xpack.security.enabled` | `false` | Dev-only; no TLS/auth setup on localhost |
| `ES_JAVA_OPTS` | `-Xms256m -Xmx256m` | Caps memory use |
| `mem_limit` | `512m` | Docker cgroup limit for the container |
| Port | `9200` | HTTP API (backend and curl) |
| Volume | `elasticsearch-data` | Index survives `docker compose` rebuilds |

Service definition: `infra/docker/docker-compose.yml` (service `elasticsearch`, container `triage-elasticsearch`).

### Start Elasticsearch with the API

From the repository root in WSL:

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d elasticsearch backend
```

Verify the cluster responds:

```bash
curl -s http://localhost:9200 | python3 -m json.tool
```

**Expected:** JSON with `"cluster_name": "triage-dev"` (or similar) and a version number.

### Disable ES entirely (CI or low RAM)

In `backend/.env.dev` or gitignored `backend/.env`:

```bash
ELASTICSEARCH_ENABLED=false
```

Recreate the backend container so it picks up the change. The backend skips indexing and search calls; the `elasticsearch` container can stay stopped.

---

## Environment variables

Read values from **`backend/.env.dev`** (committed template) and optional **`backend/.env`** (local overrides). **Do not paste production URLs or secrets into documentation or chat.**

| Variable | Purpose |
|----------|---------|
| `ELASTICSEARCH_ENABLED` | When `false`, all search features are skipped. Default in template: `true`. |
| `ELASTICSEARCH_URL` | HTTP URL for the ES node. Inside Docker Compose: `http://elasticsearch:9200`. From WSL curl on the host: `http://localhost:9200`. |
| `ELASTICSEARCH_REVIEWS_INDEX` | Index name for review documents. Default: `triage-reviews`. |

Example block in `backend/.env.dev` (placeholders only — open the file on your machine for real values):

```bash
ELASTICSEARCH_ENABLED=true
ELASTICSEARCH_URL=http://elasticsearch:9200
ELASTICSEARCH_REVIEWS_INDEX=triage-reviews
```

**Pattern:** The backend uses a **singleton client** (`backend/src/search/elasticClient.js`) that connects on first use and logs warnings if the cluster is down.

---

## Index: `triage-reviews`

One index keeps the dev footprint small (no per-tenant index sprawl).

| Stored field | ES type | Search use |
|--------------|---------|------------|
| `reviewId` | keyword | MongoDB `_id` (document id in ES) |
| `senderEmail` | keyword | Exact sender |
| `senderName` | text + keyword subfield | Display name |
| `subject` | text | Boosted in multi-match (`^2`) |
| `body` | text | Full email body |
| `status` | keyword | `pending`, `completed`, … |
| `verdict` | keyword | From `analysisResult` or analyst `override` |
| `links` | keyword | Extracted URLs |
| `updatedAt` | date | Sort when query is empty |

Mappings and upsert logic: `backend/src/search/reviewSearchIndex.js`.

The index is **created automatically** on first upsert (`ensureReviewIndex`). Clearing the index drops and recreates it with the same mappings.

---

## When indexing happens

Indexing is **fire-and-forget** (does not block the HTTP response), mirroring the Neo4j graph sync pattern.

| Event | Trigger | Code path |
|-------|---------|-----------|
| **Review created** | `POST /reviews` | `scheduleSearchIndex(review._id)` in `backend/src/api/reviews.js` |
| **Analyst override** | `POST /reviews/:id/override` | Same `scheduleSearchIndex` after save |
| **Analysis completed** | Celery → `POST /graph/internal/sync/:id` | `scheduleSearchIndex` in `backend/src/api/graphInternal.js` after graph sync |

Each run loads the review from **MongoDB** and upserts one document into ES (`indexReviewDocument`). Failures are logged as warnings; triage and Mongo data are unaffected.

**Note:** The first index after create may show `verdict: null` until Celery finishes; the internal sync path re-indexes with the final verdict.

---

## REST API routes

All routes are mounted at **`/search`** (see `backend/src/api/search.js`). They require a **JWT** from `POST /auth/login` unless noted.

| Method | Path | Permission | Description |
|--------|------|------------|-------------|
| GET | `/search/status` | `reviews.read` | Whether ES is enabled, reachable, index name, document count |
| GET | `/search/reviews?q=` | `reviews.read` | Full-text search with optional advanced filters (see below) |
| DELETE | `/search/index` | `dev.reset` **and** role `developer` or `admin` | Wipes the index (drop + recreate) |

### Query parameters (simple + advanced)

| Parameter | Meaning |
|-----------|---------|
| `q` or `query` | Full-text keyword (multi_match on subject, body, sender, links) |
| `limit` | 1–100 (default 20) |
| `offset` | Pagination skip |
| `verdict` | Exact filter: `benign`, `suspicious`, `likely_phishing` |
| `status` | Exact filter: `pending`, `processing`, `completed`, `failed` |
| `senderEmail` | Exact sender address (lowercase) |
| `updatedFrom`, `updatedTo` | ISO date range on `updatedAt` |
| `subjectRegex`, `bodyRegex`, `linksRegex` | Lucene regexp filters on individual fields |

Empty `q` with filters still returns matching documents sorted by `updatedAt`.

### React UI

The Triage workspace includes **Search past reviews** (`ReviewSearchPanel.jsx`) for any user with `reviews.read`. It exposes keyword search plus verdict, status, sender, date range, and regex fields — the same parameters as the REST API.

### Examples (replace email, password, and token)

**Login:**

```bash
curl -sS -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"YOUR_EMAIL@example.com","password":"YOUR_PASSWORD"}'
```

**Status:**

```bash
curl -s -H "Authorization: Bearer YOUR_JWT" \
  http://localhost:3000/search/status | python3 -m json.tool
```

**Search** (keyword in subject/body/links):

```bash
curl -s -G -H "Authorization: Bearer YOUR_JWT" \
  --data-urlencode "q=verify account" \
  http://localhost:3000/search/reviews | python3 -m json.tool
```

**Clear index** (destructive — developer/admin only):

```bash
curl -sS -X DELETE -H "Authorization: Bearer YOUR_JWT" \
  http://localhost:3000/search/index | python3 -m json.tool
```

Use **`http://localhost:3000`** (Node API). Port **3001** is the React dev server and will not serve these routes correctly.

Automated route tests: `backend/__tests__/searchApi.test.js`, `backend/__tests__/reviewSearchIndex.test.js`.

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — Elasticsearch API tests (<code>searchApi.js</code> / <code>reviewSearchIndex.js</code>)</p>

```bash
cd ~/suspicious-email-triage/backend
npm test -- --watchAll=false --testPathPattern=searchApi
npm test -- --watchAll=false --testPathPattern=reviewSearchIndex
```

</div>

---

## UI: Search index panel and clear button

Users with permission **`dev.reset`** see the **Search index (Elasticsearch)** card on the triage workspace (`frontend/src/components/SearchIndexPanel.jsx`, rendered when `canDevReset` in `TriageApp.jsx`).

The panel shows:

- Index name (from `/search/status`)
- Connection status and **document count**
- **Refresh status** — reload stats
- **Clear search index** — confirms, then calls `DELETE /search/index`

If `ELASTICSEARCH_ENABLED` is false, the panel does not render (`stats.enabled` is false).

There is **no separate search box in the React UI yet**; analysts use the API (`GET /search/reviews`) or future UI work. The panel is for **administration and demos** of the index lifecycle.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `reachable: false` in status | ES container down or wrong `ELASTICSEARCH_URL` | `docker compose ps elasticsearch`; start service; recreate `backend` |
| Document count stays 0 | ES disabled or indexing errors | Check `merged.log` topic `elasticsearch`; confirm reviews were created |
| Search returns nothing | Index empty or typo in `q` | Submit a review; wait for completion; try a word from the body |
| Clear returns 403 | User lacks `dev.reset` or not admin/developer | Sign in as bootstrap admin |
| OOM on laptop | Heap too large for RAM | Already 256m; stop other heavy containers or set `ELASTICSEARCH_ENABLED=false` |

---

## Code map

| Area | Path |
|------|------|
| ES client singleton | `backend/src/search/elasticClient.js` |
| Index mappings, search, clear | `backend/src/search/reviewSearchIndex.js` |
| Background sync scheduler | `backend/src/services/reviewSearchSync.js` |
| REST routes | `backend/src/api/search.js` |
| Admin UI panel | `frontend/src/components/SearchIndexPanel.jsx` |
| Docker service | `infra/docker/docker-compose.yml` → `elasticsearch` |

---

## Security notes (dev vs production)

- Dev compose disables ES security (`xpack.security.enabled=false`) — acceptable **only on localhost**.
- Production should enable TLS, authentication, and network isolation; managed offerings (Elastic Cloud, OpenSearch on AWS) are paid paths — see [roadmap_tbd.md](roadmap_tbd.md).
- Search routes respect **RBAC**; wiping the index requires elevated permissions by design.

---

## Next steps

- Run tests: [stack_guide_running_tests.md](stack_guide_running_tests.md) (`searchApi`, `reviewSearchIndex`).
- Broader API listing: [api_reference_rest.md](api_reference_rest.md).
- Log lines for indexing failures: [ops_guide_central_logging.md](ops_guide_central_logging.md).
