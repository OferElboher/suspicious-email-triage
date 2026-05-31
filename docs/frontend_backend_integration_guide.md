# Frontend ↔ backend integration

## Goal

Connect the React frontend to the Node.js Express API so analysts can submit reviews, poll results, and open analytics and graph views.

### In normal language

The browser runs **two separate programs** in local development:

1. **React dev server** (Create React App) — serves HTML/JS on port **3001** by default.
2. **Node API** — serves JSON on port **3000** (Docker `backend` service or `npm start` in `backend/`).

The UI never embeds business logic for Neo4j or MongoDB directly; it calls REST endpoints on the API using a configurable base URL.

**Related:** [neo4j_wsl_windows_setup_guide.md](neo4j_wsl_windows_setup_guide.md) (ports + JWT vs internal token), [AUTHENTICATION_AND_RBAC.md](AUTHENTICATION_AND_RBAC.md).

---

## Port map (local dev)

| Port | Service | Technology | Example URL |
|------|---------|------------|-------------|
| **3000** | Node/Express API | JWT auth, Mongo, Kafka enqueue, `/graph/*` | `http://localhost:3000/health` |
| **3001** | React SPA (CRA) | Browser UI, hash routes `#analytics`, `#graph` | `http://localhost:3001/` |
| **7474** | Neo4j Browser | HTTP UI for Cypher (optional direct access) | `http://localhost:7474` |
| **7687** | Neo4j Bolt | Graph drivers | `bolt://localhost:7687` |

**Common mistake:** `curl http://localhost:3001/graph/status` returns **HTML** (the React index page), not JSON. Always call **`http://localhost:3000`** for API routes.

Start the UI:

```bash
REACT_APP_API_URL=http://localhost:3000 PORT=3001 npm start --prefix frontend
```

Start the API (Docker):

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d backend
```

---

## Step 1 — API call example

Public health check (no login):

```javascript
fetch("http://localhost:3000/health")
  .then((res) => res.json())
```

---

## Step 2 — Use env variable

The frontend client (`frontend/src/api/client.js`) uses:

```javascript
const base = () => process.env.REACT_APP_API_URL || "http://localhost:3000";
```

Set in `frontend/.env` or on the command line when starting CRA:

```bash
REACT_APP_API_URL=http://localhost:3000
```

---

## Step 3 — Authentication pattern

Protected routes expect:

```http
Authorization: Bearer <JWT>
```

Obtain JWT via `POST /auth/login` or the UI sign-in form. Store in `localStorage` as `triage_auth_token` (handled by `AuthContext`).

**Not a JWT:** `GRAPH_INTERNAL_TOKEN` is for Celery worker callbacks only. Using it as `Bearer` on `/graph/*` returns `{"error":"invalid_token"}`.

Helper for graph API demos:

```bash
bash scripts/curl-graph-api.sh YOUR_EMAIL@example.com YOUR_PASSWORD /graph/status
```

---

## Step 4 — CORS (backend)

The API enables CORS for browser dev origins in `backend/src/http/createApp.js` (`cors({ origin: true })`), so the UI on `:3001` can call the API on `:3000`.

---

## Step 5 — Verify

1. `curl -sS http://localhost:3000/health` → JSON.
2. Open `http://localhost:3001` → sign in → Network tab shows API calls to `:3000`.

---

## Common issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| CORS blocked | API not running or wrong URL | Start backend; set `REACT_APP_API_URL` |
| HTML from API path | Wrong port (3001) | Use 3000 for REST |
| `invalid_token` on `/graph/*` | Wrong bearer value | Login first; use JWT not internal token |
| Backend not running | Docker down | `docker compose up -d backend` |
