# Neo4j on WSL (Docker) and Windows 11 GUI access

This guide is for developers who are **new to Neo4j** and use **Windows 11 + WSL**. It explains how Neo4j runs in this project, how environment variables connect the app to the database, and how to browse or edit graph data from Windows — **without copying passwords or secrets into this document**.

**Related:** [neo4j_phishing_graph_guide.md](neo4j_phishing_graph_guide.md) (architecture), [neo4j_phishing_graph_demo_guide.md](neo4j_phishing_graph_demo_guide.md) (hands-on demo), [windows_docker_databases_start_and_verify.md](windows_docker_databases_start_and_verify.md) (Docker basics).

---

## What you are installing (and what you are not)

In this repository, Neo4j is **not** installed as a native Linux package on WSL. Instead:

1. **Docker Compose** pulls the official **Neo4j Community** image.
2. The container named `triage-neo4j` stores graph data in a Docker volume.
3. The **Node backend** and **Python Celery worker** connect over the **Bolt** protocol (port **7687** inside Docker; **7687** on Windows `localhost` when the container is running).

You do **not** need to download Neo4j tarballs or run `apt install neo4j` on WSL for normal development.

---

## Prerequisites

Complete these once (or after every Windows restart):

1. **Docker Desktop** running on Windows — see [windows_docker_databases_start_and_verify.md](windows_docker_databases_start_and_verify.md) Step 0a.
2. **WSL integration** enabled for your distro (Docker Desktop → Settings → Resources → WSL integration).
3. Repository checked out in WSL (for example `~/suspicious-email-triage`).

---

## Step 1 — Start Neo4j in Docker (WSL)

Open a WSL terminal at the repository root:

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d neo4j
```

Wait a few seconds, then verify:

```bash
docker compose -f infra/docker/docker-compose.yml ps neo4j
```

**Expected:** container `triage-neo4j` with state **running** / **Up**.

Check published ports:

```bash
docker compose -f infra/docker/docker-compose.yml ps neo4j
```

**Expected PORTS column includes:**

| Mapping | Purpose |
|---------|---------|
| `0.0.0.0:7474->7474/tcp` | Neo4j Browser (HTTP web UI) |
| `0.0.0.0:7687->7687/tcp` | Bolt protocol (drivers, DBeaver, backend) |

### Health check from WSL

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:7474
```

**Expected:** `200` (or another success code once Neo4j has finished booting — retry after 10–20 seconds on first start).

To start Neo4j together with the API and workers (recommended for graph demos):

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d neo4j backend ai-celery ai-kafka-dispatch
```

---

## Step 2 — How `.env` configures Neo4j (read locally, do not paste secrets here)

Configuration lives in **profile files** under `backend/`. The committed template is `backend/.env.dev`. Your machine may also have a **gitignored** `backend/.env` that overrides values — that file is **never** pushed to GitHub.

Open these files **on your workstation** when you need actual values:

```bash
grep -E '^NEO4J_|^GRAPH_|^BACKEND_INTERNAL' backend/.env.dev
# Optional overrides:
grep -E '^NEO4J_|^GRAPH_|^BACKEND_INTERNAL' backend/.env 2>/dev/null || true
```

Also see `infra/docker/docker-compose.yml` service `neo4j` for how the container itself is bootstrapped (`NEO4J_AUTH`).

### Variable reference (names and meaning only)

| Variable | Who reads it | What it controls |
|----------|--------------|------------------|
| `NEO4J_ENABLED` | Backend + Celery | When `false`, graph sync is skipped (useful in CI without a graph container). |
| `NEO4J_URI` | Backend (`neo4j-driver`) | Bolt URL. Inside Docker network: `bolt://neo4j:7687`. From Windows GUI tools: `bolt://localhost:7687`. |
| `NEO4J_USER` | Backend | Neo4j username (default role name is usually `neo4j`). |
| `NEO4J_PASSWORD` | Backend + Neo4j container | Database password — **copy from your local `.env.dev` / `.env`, not from this doc**. |
| `GRAPH_INTERNAL_TOKEN` | Backend + Celery | Shared secret so the worker can call `/graph/internal/sync` without a user JWT. **Keep private.** |
| `BACKEND_INTERNAL_URL` | Celery | Base URL for worker → API callbacks (Docker: `http://backend:3000`). |

**Important:** After changing any of these variables, recreate affected containers so they pick up new values:

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --force-recreate backend ai-celery
```

---

## Step 3 — Recommended free Windows 11 tools

### Option A — Neo4j Browser (built-in web UI) — **recommended first**

Neo4j ships a web interface inside the container. **No extra Windows install.**

1. On **Windows**, open a browser (Edge, Chrome, Firefox).
2. Go to: **http://localhost:7474**
3. When prompted to connect:
   - **Connect URL:** `bolt://localhost:7687` (or `neo4j://localhost:7687` — Browser accepts both in recent versions)
   - **Username:** value of `NEO4J_USER` from your local `backend/.env.dev`
   - **Password:** value of `NEO4J_PASSWORD` from your local `backend/.env.dev`
4. Click **Connect**.

**What you can do:** run **Cypher** queries, visualize nodes and relationships, create/update/delete data for local experiments.

Example read-only query:

```cypher
MATCH (n)-[r]->(m) RETURN n, r, m LIMIT 50
```

### Option B — DBeaver Community (same tool as PostgreSQL)

If you already use [DBeaver for PostgreSQL](dbeaver_postgresql_windows_setup.md), you can add a **Neo4j** connection in the same app.

1. Install [DBeaver Community](https://dbeaver.io/download/) on Windows (skip if already installed).
2. Ensure Neo4j container is running ([Step 1](#step-1--start-neo4j-in-docker-wsl)).
3. **Database → New Database Connection**.
4. Search for **Neo4j** (or **Neo4j (Embedded)** / **Neo4j** driver — pick the standard Neo4j connection type).
5. On the connection dialog:

| Field | Value |
|-------|--------|
| Host | `localhost` |
| Port | `7687` |
| Database | `neo4j` (default graph) |
| Username | from `NEO4J_USER` in your local `backend/.env.dev` |
| Password | from `NEO4J_PASSWORD` in your local `backend/.env.dev` |

6. Download drivers if prompted → **Test Connection** → **Finish**.

**What you can do:** browse labels, run Cypher in an SQL-style editor, export results. Good if you prefer one desktop app for Postgres + Neo4j.

### Option C — Neo4j Browser only from WSL (no Windows GUI)

From WSL you can open the same URL if you run a browser inside WSL, or use `curl` against the HTTP API. Most Windows developers use **Option A** in a Windows browser because port `7474` is forwarded automatically.

---

## Dev ports — API (3000) vs React UI (3001)

This project runs **two HTTP servers** in local development. Mixing them up is the most common curl mistake.

| Port | Process | What it serves | Example |
|------|---------|----------------|---------|
| **3000** | Node/Express **backend** (Docker `backend` or local `npm start` in `backend/`) | JSON REST API: `/health`, `/auth/login`, `/graph/*`, `/reviews/*` | `curl http://localhost:3000/health` |
| **3001** | **React** dev server (`npm start` in `frontend/`) | HTML + JavaScript bundle for the browser | Open `http://localhost:3001` in Edge/Chrome |

When `npm start` prints:

```text
Local: http://localhost:3001
```

that URL is **only the UI**. It does **not** implement `/graph/status`. Calling `curl http://localhost:3001/graph/status` returns the React **HTML shell** (DOCTYPE, `<div id="root">`), not JSON.

The frontend talks to the API using `REACT_APP_API_URL` (default `http://localhost:3000`) — see [frontend_backend_integration_guide.md](frontend_backend_integration_guide.md).

---

## Authentication — JWT vs worker internal token

Two different secrets are used for two different purposes. **Do not swap them.**

| Credential | Used for | HTTP pattern |
|------------|----------|--------------|
| **JWT** (from login) | Human users and curl demos calling `/graph/status`, `/graph/campaigns`, etc. | `Authorization: Bearer <JWT from POST /auth/login>` |
| **`GRAPH_INTERNAL_TOKEN`** | Celery worker only — sync after analysis | `POST /graph/internal/sync/:id` with header `X-Graph-Internal-Token` |

If you send `Authorization: Bearer <GRAPH_INTERNAL_TOKEN>` to `/graph/status`, the API responds with:

```json
{"error":"invalid_token"}
```

That is expected: the internal token is **not** a JWT signed with `JWT_SECRET`.

### Recommended: helper script (login + graph call)

From the repository root (use **your** admin email and password — never commit them):

```bash
bash scripts/curl-graph-api.sh YOUR_EMAIL@example.com YOUR_PASSWORD
bash scripts/curl-graph-api.sh YOUR_EMAIL@example.com YOUR_PASSWORD /graph/campaigns
```

The script POSTs to `http://localhost:3000/auth/login`, extracts the JWT, then calls the graph endpoint.

### Manual curl (two steps)

**Step 1 — login** (port **3000**):

```bash
curl -sS -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"YOUR_EMAIL@example.com","password":"YOUR_PASSWORD"}'
```

Copy the `"token"` field from the JSON response.

**Step 2 — graph status**:

```bash
curl -sS -H "Authorization: Bearer PASTE_JWT_HERE" \
  http://localhost:3000/graph/status
```

**Expected:** `{"enabled":true,"service":"neo4j-phishing-graph"}` (or `"enabled":false` if Neo4j is disabled).

**Public health check** (no JWT required):

```bash
curl -sS http://localhost:3000/health
```

---

## Step 4 — Connect the triage application to Neo4j

The React app does **not** talk to Neo4j directly. Flow:

```text
Browser → Node API (/graph/*) → neo4j-driver (Bolt) → Neo4j container
Celery worker → Node API (/graph/internal/sync) → same driver
```

Ensure:

1. `NEO4J_ENABLED` is not `false` in your active env profile.
2. `neo4j`, `backend`, and `ai-celery` containers are running.
3. Your signed-in user has permission **`graph.read`** (admin, analyst, manager, developer, and viewer roles include it by default after auth seed).

Use [scripts/curl-graph-api.sh](../scripts/curl-graph-api.sh) or the **JWT** steps in [Dev ports — API (3000) vs React UI (3001)](#dev-ports--api-3000-vs-react-ui-3001) above — not `GRAPH_INTERNAL_TOKEN`.

---

## Troubleshooting

| Problem | What to check |
|---------|----------------|
| `{"error":"invalid_token"}` on `/graph/status` | You likely used `GRAPH_INTERNAL_TOKEN` instead of a **JWT** from `/auth/login`, or an expired token |
| curl to `:3001/graph/*` returns HTML | Wrong port — use **3000** for API; **3001** is React only |
| `Connection refused` on `:7474` or `:7687` | Docker Desktop running? Container up? `docker compose ps neo4j` |
| Authentication failed in Browser | Username/password must match **your local** `.env.dev` / compose `NEO4J_AUTH`, not an old password |
| Empty graph in the React UI | Submit reviews with URLs; wait for Celery to finish; see [neo4j_phishing_graph_demo_guide.md](neo4j_phishing_graph_demo_guide.md) |
| Backend logs `connect failed — graph features degraded` | Wrong `NEO4J_URI` inside container (should use hostname `neo4j`, not `localhost`, in backend env) |
| Changed `.env` but no effect | Recreate containers with `--force-recreate` |

---

## Stop Neo4j

```bash
cd ~/suspicious-email-triage
docker compose -f infra/docker/docker-compose.yml stop neo4j
```

To remove the graph volume (wipes all nodes — dev only):

```bash
docker compose -f infra/docker/docker-compose.yml down
docker volume rm docker_neo4j-data 2>/dev/null || true
```

Volume name may differ; list with `docker volume ls | grep neo4j`.

---

## Security reminder

- Treat `NEO4J_PASSWORD` and `GRAPH_INTERNAL_TOKEN` like any dev secret: store in local env files, rotate for staging/production, never commit real production values.
- This documentation intentionally **does not** repeat secret values so copies of the repo stay safe to share.
