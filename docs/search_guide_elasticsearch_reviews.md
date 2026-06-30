# Elasticsearch review search guide

This guide explains **what Elasticsearch (ES) is**, how this project indexes email reviews for **full-text search**, how to **open the search UI** as an admin, and how to ask questions in **everyday language** (not just Lucene syntax).

**Related:** [roadmap_tbd.md §1.6](roadmap_tbd.md#16-review-full-text-search-elasticsearch--implemented-free-dev-path), [ui_guide_app_navigation.md](ui_guide_app_navigation.md), [api_reference_rest.md](api_reference_rest.md), [ops_guide_central_logging.md](ops_guide_central_logging.md).

---

## What is Elasticsearch?

**Elasticsearch** is an open-source **search engine**. It stores each review as a JSON **document** inside an **index** (similar to a database table). When you type keywords, ES finds documents whose subject, body, sender, or links contain those words — quickly, even across thousands of emails.

In this project:

| Role | Technology |
|------|------------|
| Document store (full reviews) | MongoDB |
| Search index (search-optimized copy) | Elasticsearch index `triage-reviews` |
| Index writer | Node API (`scheduleSearchIndex` after create/override/completion) |
| Search API | `GET /search/reviews` |
| Analyst UI | **Search past reviews** tab (`#search`) |

Elasticsearch is **optional**. Triage works without it; search returns empty or a clear error until you start the `elasticsearch` Docker service.

---

## Where to find search in the UI

### Search past reviews tab (every analyst with `reviews.read`)

1. Sign in at `http://localhost:3001`.
2. Click the **envelope + magnifying glass** icon in the header (hover label: **Search past reviews**).
3. Or open directly: `http://localhost:3001/#search`.

This opens **`SearchReviewsView`** with the **Search past reviews** form (`ReviewSearchPanel.jsx`).

**Permission:** `reviews.read` — bootstrap **admin** includes this.

### Search index admin card (admin / developer with `dev.reset`)

On the same **#search** tab, scroll below the search form to **Search index (Elasticsearch)** (`SearchIndexPanel.jsx`).

| Control | What it does |
|---------|----------------|
| **Refresh status** | Calls `GET /search/status` — connection + document count |
| **Clear search index** | Calls `DELETE /search/index` — wipes all indexed docs (destructive) |

**Permissions:** `dev.reset` **and** role **`admin`** or **`developer`**.

**Important fix:** the index admin panel **always renders** for `dev.reset` users. If Elasticsearch is disabled or down, you still see **setup instructions** instead of a blank screen.

---

## Plain-language search (free-text questions)

You do **not** need query syntax for normal investigations.

1. Go to **Search past reviews** (`#search`).
2. Type everyday words in **Keywords (plain language)** — ES matches the important terms across subject, body, sender, and links.

| You might type (natural language) | What Elasticsearch does |
|-----------------------------------|-------------------------|
| `verify your account password` | Finds reviews containing words like *verify*, *account*, *password* |
| `urgent wire transfer` | Matches any of those terms in subject/body |
| `suspicious link example-phish` | Matches body text and extracted URLs |

Click an **example chip** under the intro paragraph to fill Keywords, then **Search reviews**.

**How it works technically:** the backend runs a **`multi_match`** query (`reviewSearchIndex.js`) over text fields. ES **analyzes** your phrase into tokens (words), scores documents by relevance, and returns the best matches. Combine Keywords with **Verdict**, **Status**, **Sender**, or **date range** filters to narrow results.

**Advanced (optional):** **Subject regex** and **Body regex** accept **Lucene** regular expressions for power users — not required for plain-language search.

---

## Start Elasticsearch (dev laptop)

Single-node ES 8 with **256 MB heap** — see `infra/docker/docker-compose.yml` service `elasticsearch`.

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d elasticsearch backend
```

Verify:

```bash
curl -s http://localhost:9200 | python3 -m json.tool
```

**Expected:** JSON with `"cluster_name": "triage-dev"`.

### Environment variables (committed template only)

From `backend/.env.dev` — **never paste secrets from gitignored files into docs:**

| Variable | Purpose |
|----------|---------|
| `ELASTICSEARCH_ENABLED` | `true` to index and search; `false` skips ES entirely |
| `ELASTICSEARCH_URL` | `http://elasticsearch:9200` inside Docker; `http://localhost:9200` from host curl |
| `ELASTICSEARCH_REVIEWS_INDEX` | Default `triage-reviews` |

After changing env, **recreate the backend container** so it picks up values.

---

## When documents get indexed

Fire-and-forget (does not block API responses):

| Event | Trigger |
|-------|---------|
| Review created | `POST /reviews` |
| Analyst override | `POST /reviews/:id/override` |
| Analysis completed | Celery → graph internal sync |

Submit a review (or run simulation), wait until status **completed**, then search for words from the email body.

---

## REST API (for scripts and curl)

JWT required — see [auth_guide_obtain_jwt.md](auth_guide_obtain_jwt.md).

| Method | Path | Permission |
|--------|------|------------|
| GET | `/search/status` | `reviews.read` |
| GET | `/search/reviews?q=` | `reviews.read` |
| DELETE | `/search/index` | `dev.reset` + admin/developer |

Use **`http://localhost:3000`** (Node API), not port 3001 (React dev server).

Example plain-language search:

```bash
curl -sG -H "Authorization: Bearer YOUR_JWT" \
  --data-urlencode "q=verify account password" \
  http://localhost:3000/search/reviews | python3 -m json.tool
```

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| No **Search past reviews** icon | Missing `reviews.read` | Sign in as admin/analyst; check roles in Settings |
| Tab opens but search errors | ES container stopped | `docker compose … up -d elasticsearch backend` |
| **Search index** shows disabled | `ELASTICSEARCH_ENABLED=false` | Set `true` in `.env.dev`, recreate backend |
| Index admin missing | Looking on dashboard footer (old layout) | Use **#search** tab — index panel is below the form |
| Clear index 403 | Not admin/developer role | Bootstrap admin has both `dev.reset` and `admin` role |
| Zero results | Index empty or typo | Submit reviews; wait for `completed`; try example chips |
| Document count 0 after reviews | Indexing lag or ES down | Check `merged.log` topic `elasticsearch` |

---

## Code map

| Area | Path |
|------|------|
| ES client | `backend/src/search/elasticClient.js` |
| Index + search logic | `backend/src/search/reviewSearchIndex.js` |
| REST routes | `backend/src/api/search.js` |
| Search UI | `frontend/src/components/ReviewSearchPanel.jsx` |
| Index admin UI | `frontend/src/components/SearchIndexPanel.jsx` |
| Dedicated tab | `frontend/src/views/SearchReviewsView.jsx` |
| Nav hash | `#search` in `appScreenNavigation.js` |

---

## Tests

```bash
cd ~/suspicious-email-triage/backend
npm test -- --watchAll=false --testPathPattern=searchApi

cd ~/suspicious-email-triage/frontend
npm test -- --watchAll=false --testPathPattern="SearchIndex|SearchReviews|ReviewSearch"
```

---

## Security (dev vs production)

- Dev disables ES security (`xpack.security.enabled=false`) — **localhost only**.
- Production should use TLS, auth, and network isolation (Amazon OpenSearch Service — see [roadmap_tbd.md](roadmap_tbd.md)).
- Wiping the index requires elevated permissions by design.

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — start ES and open the search tab</p>

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d elasticsearch backend
# Browser: http://localhost:3001/#search (sign in as admin)
```

</div>
