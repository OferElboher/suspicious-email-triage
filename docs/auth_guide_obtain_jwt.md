# How to obtain a JWT for API calls

This guide explains **every supported way** to get a user **JWT** (JSON Web Token) so you can call protected REST routes with:

```http
Authorization: Bearer YOUR_JWT
```

**Who this is for:** developers and QA running `curl`, shell scripts, Postman, or debugging the React app — anyone who needs a bearer token for the Node API on port **3000**.

**Related:** [auth_guide_rbac.md](auth_guide_rbac.md) (roles and permissions), [api_reference_rest.md](api_reference_rest.md) (full route list), [auth_guide_google_oauth.md](auth_guide_google_oauth.md) (Google sign-in), [auth_guide_dev_admin_credentials.md](auth_guide_dev_admin_credentials.md) (bootstrap email and password).

---

## What the JWT is (in this project)

| Concept | Meaning |
|---------|---------|
| **JWT** | A signed string issued after successful login. The API verifies it on each request and loads your roles/permissions from PostgreSQL. |
| **Where it goes** | HTTP header `Authorization: Bearer <token>` on routes under `/reviews`, `/graph`, `/metrics`, `/dev`, etc. |
| **Lifetime** | Default **12 hours** (`JWT_TTL_HOURS` in gitignored secrets). Login returns `expiresIn` in seconds. |
| **Storage key (React UI)** | Browser `localStorage` key `triage_auth_token` (`frontend/src/api/client.js`). |

**Not a JWT:** `GRAPH_INTERNAL_TOKEN` is a **shared service secret** for Celery → `POST /graph/internal/sync` only. Never paste it into `Authorization: Bearer` for user APIs. See [api_reference_rest.md — Authentication](api_reference_rest.md#authentication).

**Security:** This document uses placeholders like `YOUR_EMAIL@example.com` and `YOUR_PASSWORD`. Real credentials live in gitignored `backend/.env` and `backend/dev.secrets` — never commit tokens or passwords to git.

---

## Prerequisites

1. **Backend API running** on `http://localhost:3000` (Docker Compose or local Node).
2. **A user account** in PostgreSQL `auth_users` (bootstrap admin after first clone — see [stack_guide_build_and_run.md](stack_guide_build_and_run.md)).
3. **Your sign-in email and password** (dev default password is documented in [auth_guide_dev_admin_credentials.md](auth_guide_dev_admin_credentials.md); your email is set locally via `scripts/configure-dev-bootstrap-admin.sh`).

The React dev server (`http://localhost:3001`) does **not** issue tokens by itself — it calls the API login endpoint and stores the returned JWT.

---

## Method 1 — `curl` login (recommended for scripts and terminals)

**Technology:** `POST /auth/login` → JSON body with email/password → response field `token`.

### Step 1: Log in and view the full response

```bash
curl -sS -X POST "http://localhost:3000/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"YOUR_EMAIL@example.com","password":"YOUR_PASSWORD"}' \
  | python3 -m json.tool
```

**Expected shape:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 43200,
  "user": {
    "id": 1,
    "email": "YOUR_EMAIL@example.com",
    "roles": ["admin"],
    "permissions": ["reviews.read", "reviews.write", "..."]
  }
}
```

Copy the value of **`token`** — that is your JWT.

### Step 2: Store the token in a shell variable

```bash
TOKEN=$(curl -sS -X POST "http://localhost:3000/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"YOUR_EMAIL@example.com","password":"YOUR_PASSWORD"}' \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('token') or d.get('accessToken') or '')")

echo "Token length: ${#TOKEN} characters"
```

If `TOKEN` is empty, login failed — check email/password and that the backend container is up (`curl -sS http://localhost:3000/health/live`).

### Step 3: Use the token on a protected route

```bash
curl -sS "http://localhost:3000/auth/me" \
  -H "Authorization: Bearer ${TOKEN}" | python3 -m json.tool
```

Other examples:

```bash
curl -sS -H "Authorization: Bearer ${TOKEN}" \
  "http://localhost:3000/reviews?limit=5&page=0"

curl -sS -X POST -H "Authorization: Bearer ${TOKEN}" \
  http://localhost:3000/dev/reset-local-state
```

Use the **`token` from the same login response** for every follow-up call. Pasting an older JWT from a previous session still works until expiry, but logging in again and reusing `${TOKEN}` avoids confusion when debugging auth errors.

---

## Dev routes: `dev.reset` permission vs `developer` role

Some **`POST /dev/*`** routes require **both**:

1. Permission **`dev.reset`** (or **`dev.simulation`** for simulation), **and**
2. Role **`admin`** or **`developer`**

The bootstrap account created by `scripts/configure-dev-bootstrap-admin.sh` typically has role **`admin`** and permissions such as **`dev.reset`**, **`dev.simulation`**, and **`graph.read`**. That is enough for **`POST /dev/reset-local-state`**, **`POST /dev/prune-graph`**, and **`POST /dev/requeue-review/:id`** after the backend image includes the admin-or-developer guard.

### Symptom: login succeeds but reset returns `developer_role_required`

**Example (broken on an older backend build):**

```bash
# Login OK — roles: ["admin"], permissions include "dev.reset"
curl -sS -X POST "http://localhost:3000/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"YOUR_EMAIL@example.com","password":"YOUR_PASSWORD"}' \
  | python3 -m json.tool

# Reset fails even with a fresh token
curl -sS -X POST -H "Authorization: Bearer ${TOKEN}" \
  http://localhost:3000/dev/reset-local-state
# {"error":"developer_role_required"}
```

**Cause:** The route checked only for role **`developer`**, not **`admin`**. Your JWT was valid; the role gate was too narrow.

**Fix:**

1. **Rebuild and restart the backend** so it runs the current code (Docker example):

   ```bash
   DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --build --force-recreate backend
   ```

2. Log in again and call reset with the new **`token`**:

   ```bash
   TOKEN=$(curl -sS -X POST "http://localhost:3000/auth/login" \
     -H "Content-Type: application/json" \
     -d '{"email":"YOUR_EMAIL@example.com","password":"YOUR_PASSWORD"}' \
     | python3 -c "import json,sys; print(json.load(sys.stdin)['token'])")

   curl -sS -X POST -H "Authorization: Bearer ${TOKEN}" \
     http://localhost:3000/dev/reset-local-state | python3 -m json.tool
   ```

**Expected success shape:** JSON with `"ok": true` and a `summary` object (Mongo reviews cleared, Redis flushed, Kafka topic recreated, Neo4j cleared, etc.).

### When to call `reset-local-state`

Use it when local dev data is stale or the async pipeline is backed up — for example after repeated campaign test runs left thousands of Celery tasks in Redis, or Neo4j has orphan nodes that make the phishing graph show duplicate senders. It requires **`DEPLOYMENT_ENV=dev`** (the route returns `dev_only` in non-dev deployments).

**Related graph cleanup (same JWT):**

```bash
curl -sS -X POST -H "Authorization: Bearer ${TOKEN}" \
  http://localhost:3000/dev/prune-graph | python3 -m json.tool
```

`prune-graph` merges duplicate Sender/Url/Domain nodes in Neo4j and deletes zero-relationship orphans — useful if the UI console shows duplicate React keys like `sender:attacker-a@fake-mail.test`.

### Simulation and reset panels (admin or developer)

Bootstrap **admin** users receive permissions `dev.simulation` and `dev.reset`. On a current backend build, **`GET/POST /dev/simulation`**, **`POST /dev/reset-local-state`**, and **`POST /dev/prune-graph`** accept either **`admin`** or **`developer`** role — you do not need a separate developer account for local demos.

The UI **Simulation mode** card and **Reset local databases & queues** button appear when `GET /dev/features` returns `simulation: true` / `resetLocalState: true`. Full UI steps: [stack_guide_versions_builds.md](stack_guide_versions_builds.md#simulation-mode-dev-only--admin-or-developer-role).

If the Simulation panel is missing after login, rebuild the backend Docker image and hard-refresh the browser so `/dev/features` reflects the updated role gate.

---

## Method 2 — React UI (browser localStorage)

**Technology:** Create React App (CRA) sign-in form → `POST /auth/login` via `frontend/src/api/client.js` → JWT saved as `triage_auth_token`.

### Automatic (normal use)

1. Open **`http://localhost:3001`**.
2. Sign in with your email and password.
3. The app stores the JWT automatically; you do not need to copy it for normal UI use.

### Manual copy (for curl / Postman while UI is logged in)

**Chrome / Edge / Firefox dev tools:**

1. Open **Application** (Chrome) or **Storage** (Firefox).
2. **Local Storage** → `http://localhost:3001`.
3. Find key **`triage_auth_token`** — the value is your JWT.

**Network tab alternative:**

1. Dev tools → **Network**.
2. Trigger any API call (e.g. refresh Recent reviews).
3. Select a request to `localhost:3000`.
4. Copy the **`Authorization`** request header value after `Bearer `.

Log out clears the token (`setStoredToken(null)` in `AuthContext`).

---

## Method 3 — Helper script `scripts/curl-graph-api.sh`

**Technology:** Bash wrapper that logs in, extracts `token`, and calls one authenticated endpoint.

This script is the quickest way to prove login + JWT work against the graph API:

```bash
cd ~/suspicious-email-triage

bash scripts/curl-graph-api.sh YOUR_EMAIL@example.com YOUR_PASSWORD

bash scripts/curl-graph-api.sh YOUR_EMAIL@example.com YOUR_PASSWORD /graph/campaigns
```

**What it does internally:**

1. `POST http://localhost:3000/auth/login` with your credentials.
2. Parses `token` or `accessToken` from JSON.
3. `GET http://localhost:3000<ENDPOINT>` with `Authorization: Bearer …`.

To reuse the token yourself, run only the login half (Method 1) or extend the script pattern.

See also [scripts/README.md](../scripts/README.md).

---

## Method 4 — Test / automation scripts (login built in)

Several repo scripts **log in for you** and never print the raw JWT unless you add `echo "$TOKEN"`.

| Script | Purpose |
|--------|---------|
| `scripts/run-manual-phishing-campaign-test.sh` | Submits demo phishing emails, waits for Celery, checks Neo4j campaign graph |
| `scripts/curl-graph-api.sh` | One-shot authenticated graph API call |

Example:

```bash
bash scripts/run-manual-phishing-campaign-test.sh YOUR_EMAIL@example.com YOUR_PASSWORD
```

These use the same `POST /auth/login` flow as Method 1; the token stays inside the script process.

---

## Method 5 — Google OAuth (browser redirect)

**Technology:** OAuth 2.0 authorization code flow → `GET /auth/google/callback` → redirect to React with JWT in query string.

When Google sign-in is configured ([auth_guide_google_oauth.md](auth_guide_google_oauth.md)):

1. User completes Google consent.
2. Browser lands on a URL like:

   ```text
   http://localhost:3001/?googleToken=eyJhbGciOiJIUzI1NiIs...&expiresIn=43200
   ```

3. `AuthContext` reads **`googleToken`**, stores it in `localStorage` as `triage_auth_token`, and removes it from the address bar.

**For API testing:** copy `googleToken` from the redirect URL **before** the app strips it, or read `triage_auth_token` from localStorage (Method 2).

Email/password login (Method 1) does not require Google OAuth.

---

## Method 6 — API clients (Postman, Insomnia, httpie)

**Pattern:** same as Method 1 — one login request, then attach the bearer token to the collection/environment.

**Postman example:**

1. Create request `POST http://localhost:3000/auth/login` with JSON body `{ "email", "password" }`.
2. In **Tests** tab: `pm.environment.set("jwt", pm.response.json().token);`
3. On other requests: Authorization type **Bearer Token**, value `{{jwt}}`.

**httpie example:**

```bash
http POST localhost:3000/auth/login email=YOUR_EMAIL@example.com password=YOUR_PASSWORD

http GET localhost:3000/auth/me "Authorization: Bearer PASTE_TOKEN_HERE"
```

---

## When the token stops working

| Symptom | Cause | Fix |
|---------|-------|-----|
| `401` + `invalid_token` or `authentication_required` | Expired or malformed JWT | Log in again (Method 1) |
| `403` + `forbidden` | Valid JWT but missing permission | Use an account with the right role — see [auth_guide_rbac.md](auth_guide_rbac.md) |
| `403` + `developer_role_required` or `admin_or_developer_required` | Valid JWT; dev route role gate | Bootstrap **admin** needs a rebuilt backend — see [Dev routes: permission vs role](#dev-routes-devreset-permission-vs-developer-role) |
| Login returns `invalid_credentials` | Wrong password or email | [auth_guide_dev_auth_recovery.md](auth_guide_dev_auth_recovery.md) or **Reset dev bootstrap password** in UI |
| Empty `token` in login JSON | Backend down or wrong URL | Use port **3000**, not 3001 |

There is **no refresh-token endpoint** in the current dev stack — obtain a new JWT by logging in again.

---

## Quick reference

| Goal | Method |
|------|--------|
| One-off terminal API call | Method 1 (`curl` + `TOKEN=…`) |
| Already signed in on UI | Method 2 (localStorage `triage_auth_token`) |
| Graph API smoke test | Method 3 (`curl-graph-api.sh`) |
| Campaign / integration script | Method 4 (script logs in internally) |
| Google sign-in | Method 5 (`googleToken` or localStorage) |
| Postman collection | Method 6 |

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — WSL, repository root unless noted</p>

```bash
cd ~/suspicious-email-triage
curl -sS -X POST "http://localhost:3000/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"YOUR_EMAIL@example.com","password":"YOUR_PASSWORD"}' \
  | python3 -m json.tool
```

</div>
