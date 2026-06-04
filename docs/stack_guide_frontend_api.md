# Frontend ↔ backend integration

## Goal

Connect the React frontend to the Node.js Express API so analysts can submit reviews, poll results, and open analytics and graph views.

### In normal language

The browser runs **two separate programs** in local development:

1. **React dev server** (Create React App, port **3001**) — serves HTML/JS and, via a **dev proxy**, forwards API paths to the backend.
2. **Node API** (port **3000**) — serves JSON (Docker `backend` service or `npm start` in `backend/`).

The UI never embeds business logic for Neo4j or MongoDB directly; it calls REST endpoints using `frontend/src/api/client.js`.

**Related:** [tech_neo4j_setup_wsl_windows.md](tech_neo4j_setup_wsl_windows.md), [auth_guide_rbac.md](auth_guide_rbac.md), [stack_guide_windows_startup.md](stack_guide_windows_startup.md).

---

## Port map (local dev)

| Port | Service | Technology | Example URL |
|------|---------|------------|-------------|
| **3000** | Node/Express API | JWT auth, Mongo, Kafka enqueue, `/graph/*` | `http://localhost:3000/health/live` |
| **3001** | React SPA (CRA) | Browser UI, hash routes `#analytics`, `#graph` | `http://localhost:3001/` |
| **7474** | Neo4j Browser | HTTP UI for Cypher | `http://localhost:7474` |
| **7687** | Neo4j Bolt | Graph drivers | `bolt://localhost:7687` |

**Common mistake:** `curl http://localhost:3001/graph/status` returns **HTML** (the React index page), not JSON. Always call **`http://localhost:3000`** for direct API access.

---

## Dev proxy (fixes “Failed to fetch” on sign-in)

### Problem

If the UI on `:3001` calls `http://localhost:3000` directly (cross-origin `fetch`), some environments (Windows 11 + WSL, strict browsers, API temporarily down) show a red **“Failed to fetch”** with no useful detail.

### Solution — `setupProxy.js`

Create React App loads `frontend/src/setupProxy.js` automatically when you run `npm start`. It uses **`http-proxy-middleware`** to forward these path prefixes to `http://127.0.0.1:3000`:

`/auth`, `/health`, `/reviews`, `/metrics`, `/graph`, `/dev`, `/logs`, `/ops`, `/test`

The browser then calls **same-origin** URLs like `/auth/login` on port 3001; the dev server proxies them to the API. No CORS preflight, fewer localhost edge cases.

`frontend/src/lib/apiBase.js` returns an **empty base URL** in development (unless you set `REACT_APP_API_URL`), so `fetch("/auth/login")` hits the proxy.

### Start commands

```bash
# Terminal A — API + databases (Docker)
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --build

# Terminal B — React UI (proxy enabled by default)
PORT=3001 npm start --prefix frontend
```

You **do not** need `REACT_APP_API_URL=http://localhost:3000` for normal local dev anymore. Optional override still works for custom setups.

**Google OAuth** still uses an absolute API URL (`resolveOAuthApiBase()`) because the browser navigates to `/auth/google/start` on the API host, not through JSON fetch.

---

## API client and network errors

`frontend/src/api/client.js` wraps `fetch` and converts browser **“Failed to fetch”** into a message that mentions starting Docker backend and checking `curl http://localhost:3000/health/live`.

---

## Step 1 — API call example

Public health check (no login):

```javascript
fetch("http://localhost:3000/health/live")
  .then((res) => res.json())
```

From the UI dev server (proxied):

```javascript
fetch("/health/live").then((res) => res.json())
```

---

## Step 2 — Environment variable (production builds)

Production `npm run build` bakes `REACT_APP_API_URL` into the bundle. If unset, the client defaults to `http://localhost:3000`.

```bash
REACT_APP_API_URL=https://api.example.com npm run build --prefix frontend
```

---

## Step 3 — Authentication pattern

Protected routes expect:

```http
Authorization: Bearer <JWT>
```

Obtain JWT via `POST /auth/login` or the UI sign-in form. Stored in `localStorage` as `triage_auth_token` (`AuthContext`).

Password fields use **`PasswordInput`** with a Show/Hide toggle on sign-in and password reset screens.

**Not a JWT:** `GRAPH_INTERNAL_TOKEN` is for Celery worker callbacks only.

```bash
bash scripts/curl-graph-api.sh YOUR_EMAIL@example.com YOUR_PASSWORD /graph/status
```

---

## Step 4 — CORS (backend)

The API enables CORS in `createApp.js` (`cors({ origin: true })`) for direct `:3001` → `:3000` calls when not using the proxy. The dev proxy is preferred for local work.

---

## Step 5 — Login survives Docker rebuilds

PostgreSQL stores `auth_users` (bcrypt password hashes). **`postgres-data`** and **`mongo-data`** named volumes in `infra/docker/docker-compose.yml` persist data across `docker compose up --build`. Without them, every rebuild wiped users and forced bootstrap password `temp-admin-pswd` again.

---

## Step 6 — Verify

1. `curl -sS http://localhost:3000/health/live` → `"status":"ok"`.
2. Open `http://localhost:3001` → sign in → Network tab shows `/auth/login` on **3001** (proxied).
3. Change password → rebuild Docker → same password still works.

---

## Common issues

| Symptom | Cause | Fix |
|---------|-------|-----|
| **Failed to fetch** on sign-in | Backend not running or not ready | `docker compose up -d backend`; wait for health; see message in UI |
| Password reset after every rebuild | Old compose without `postgres-data` | Pull latest compose; volumes retain hashes |
| CORS blocked | Direct cross-origin without proxy | Use default `npm start` (proxy) or start API |
| HTML from API path | Wrong port (3001) in curl | Use 3000 for REST |
| `invalid_token` on `/graph/*` | Wrong bearer | Login; use JWT not internal token |
