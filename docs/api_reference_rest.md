# REST API Reference

A beginner-friendly guide to every HTTP route exposed by the **Suspicious Email Triage** backend. Use this document when integrating tools, writing scripts, or debugging the React UI.

---

## Quick start

| Service | Default URL | Purpose |
|---------|-------------|---------|
| **Backend API** | `http://localhost:3000` | REST endpoints (this document) |
| **React UI** | `http://localhost:3001` | Web dashboard; obtains JWT via login or Google OAuth |

All JSON request and response bodies use `Content-Type: application/json` unless noted otherwise.

---

## How authentication works

Most routes require a **JWT** (JSON Web Token). A few routes are public; one internal route uses a **shared service token** instead.

### JWT (user sessions)

After a successful login (`POST /auth/login`) or Google OAuth callback, the API returns a `token` string. Send it on every protected request:

```http
Authorization: Bearer YOUR_JWT_TOKEN
```

The server verifies the token, loads the user from PostgreSQL, and attaches roles and permissions to the request. If the token is missing, expired, or invalid, you get **401** with `{ "error": "authentication_required" }` or `{ "error": "invalid_token" }`.

If the token is valid but your user lacks a required permission, you get **403** with `{ "error": "forbidden", "missing": ["permission.code"] }`.

**Typical workflow:**

1. `POST /auth/login` with email and password → receive `token`.
2. Store the token (the React app keeps it in memory/local storage).
3. Pass `Authorization: Bearer YOUR_JWT_TOKEN` on subsequent calls.

JWT lifetime defaults to **12 hours** (`JWT_TTL_HOURS` env). The login response includes `expiresIn` in seconds.

### GRAPH_INTERNAL_TOKEN (service-to-service)

Background workers (for example Celery) sync review data into Neo4j **without** a user login. They call:

```http
POST /graph/internal/sync/:id
X-Graph-Internal-Token: YOUR_GRAPH_INTERNAL_TOKEN
```

This header must match the `GRAPH_INTERNAL_TOKEN` environment variable on the server. It is **not** a JWT — it is a static shared secret known only to trusted internal services.

| | JWT | GRAPH_INTERNAL_TOKEN |
|---|-----|----------------------|
| **Who uses it** | Humans (via UI) and scripts acting as a user | Internal workers only |
| **How sent** | `Authorization: Bearer …` | `X-Graph-Internal-Token: …` |
| **Contains user identity** | Yes (email, roles, permissions) | No |
| **Expires** | Yes (hours) | No (until rotated in env) |
| **Routes** | Most `/reviews`, `/metrics`, `/graph`, etc. | `/graph/internal/sync/:id` only |

Never expose either token in client-side code committed to git or in public documentation — use placeholders like `YOUR_JWT_TOKEN`.

---

## Permissions

Permissions are strings checked by the API. Your JWT embeds the user id; the server loads the current permission list from PostgreSQL on each request.

| Permission | Description | Typical roles |
|------------|-------------|---------------|
| `reviews.read` | List and read review documents | analyst, manager, developer, viewer |
| `reviews.write` | Create reviews, use `/test` | analyst, developer |
| `reviews.override` | Save analyst manual verdict overrides | analyst, developer |
| `metrics.read` | Analytics charts, `/ops/alerts` | admin, manager |
| `graph.read` | Neo4j graph, campaigns, visualization | analyst, manager, developer, viewer |
| `logs.read` | Search logs, log summary | admin |
| `dev.simulation` | Dev traffic simulation controls | developer |
| `dev.reset` | Reset local dev databases/queues | developer |
| `admin.users` | User provisioning (admin UI) | admin |

Default role mappings live in `backend/src/auth/constants.js`.

---

## Common error responses

| HTTP | `error` field | Meaning |
|------|---------------|---------|
| 400 | varies | Invalid input (missing fields, bad theme id, etc.) |
| 401 | `authentication_required` | No `Authorization` header |
| 401 | `invalid_token` | Bad or expired JWT |
| 401 | `invalid_credentials` | Wrong email/password on login |
| 401 | `invalid_internal_token` | Wrong or missing graph internal token |
| 403 | `forbidden` | Valid JWT but missing permission |
| 403 | `dev_only` | Route requires dev deployment slice |
| 404 | `not_found` / `Review not found` | Resource missing |
| 500 | varies | Server error |

---

## Route map (overview)

```
Public (no JWT)
├── GET  /health/live
├── GET  /health/ready
├── GET  /health
├── GET  /ops/prometheus
├── GET  /auth/config
├── POST /auth/dev/bootstrap-reset   (dev only)
├── GET  /auth/google/start
├── GET  /auth/google/callback
├── POST /auth/login
├── POST /auth/forgot-password
├── POST /auth/reset-password
└── POST /graph/internal/sync/:id   (X-Graph-Internal-Token)

Protected (JWT + permission where noted)
├── GET  /ops/alerts                    (metrics.read)
├── GET  /ops/logs/summary              (logs.read)
├── GET  /auth/me
├── GET  /auth/preferences
├── PUT  /auth/preferences
├── GET  /reviews                       (reviews.read)
├── POST /reviews                       (reviews.write)
├── GET  /reviews/:id                   (reviews.read)
├── POST /reviews/:id/override          (reviews.override)
├── GET  /metrics/timeseries            (metrics.read)
├── GET  /metrics/status-breakdown      (metrics.read)
├── GET  /graph/status                  (graph.read)
├── GET  /graph/campaigns               (graph.read)
├── GET  /graph/review/:id/neighborhood (graph.read)
├── GET  /graph/visualization           (graph.read)
├── POST /graph/sync/:id                (graph.read)
├── GET  /dev/features
├── GET  /dev/simulation                (dev.simulation + developer role)
├── POST /dev/simulation                (dev.simulation + developer role)
├── POST /dev/reset-local-state         (dev.reset + developer role)
├── GET  /logs/search                   (logs.read)
└── POST /test                          (reviews.write)
```

---

## Health probes

Used by Docker, Kubernetes, and load balancers. **No authentication.**

**Related tests:** `backend/__tests__/healthApi.test.js`

### GET /health/live

**Auth:** None (public)

**Purpose:** Liveness — confirms the Node process is running. Does not check databases.

**Response (200):**

```json
{
  "status": "ok",
  "probe": "live",
  "service": "triage-api",
  "timestamp": "2026-06-01T12:00:00.000Z"
}
```

**curl:**

```bash
curl -s http://localhost:3000/health/live
```

---

### GET /health/ready

**Auth:** None (public)

**Purpose:** Readiness — pings MongoDB, PostgreSQL, Redis (if configured), and Neo4j (if enabled). Returns **503** when any dependency is unhealthy.

**Response (200 when healthy):**

```json
{
  "status": "ok",
  "probe": "ready",
  "service": "triage-api",
  "timestamp": "2026-06-01T12:00:00.000Z",
  "checks": [
    { "name": "mongodb", "ok": true, "detail": "connected" },
    { "name": "postgres", "ok": true, "detail": "connected" },
    { "name": "redis", "ok": true, "detail": "skipped" },
    { "name": "neo4j", "ok": true, "detail": "disabled" }
  ]
}
```

**Response (503 when degraded):**

```json
{
  "status": "degraded",
  "probe": "ready",
  "checks": [
    { "name": "mongodb", "ok": false, "detail": "readyState=0" }
  ]
}
```

**curl:**

```bash
curl -s http://localhost:3000/health/ready
```

---

### GET /health

**Auth:** None (public)

**Purpose:** Backward-compatible summary combining readiness with service metadata.

**Response (200 or 503):**

```json
{
  "status": "ok",
  "service": "triage-api",
  "auth": "required_for_api",
  "checks": [
    { "name": "mongodb", "ok": true, "detail": "connected" }
  ]
}
```

**curl:**

```bash
curl -s http://localhost:3000/health
```

---

## Operations (`/ops`)

**Related tests:** `backend/__tests__/opsApi.test.js`

### GET /ops/prometheus

**Auth:** None (public) — standard Prometheus scrape pattern

**Permission:** None

**Purpose:** Returns in-process metrics in Prometheus text exposition format.

**Response (200, `text/plain`):**

```
triage_http_requests_total 42
triage_http_errors_total 0
...
```

**curl:**

```bash
curl -s http://localhost:3000/ops/prometheus
```

---

### GET /ops/alerts

**Auth:** JWT required (`Authorization: Bearer YOUR_JWT_TOKEN`)

**Permission:** `metrics.read`

**Purpose:** Evaluates simple alert rules from readiness checks and in-process counters (graph sync failures, HTTP 5xx count).

**Query parameters:** None

**Response (200):**

```json
{
  "evaluatedAt": "2026-06-01T12:00:00.000Z",
  "alertCount": 0,
  "alerts": [],
  "readiness": "ok",
  "metrics": {
    "httpRequestsTotal": 100,
    "httpErrorsTotal": 0,
    "reviewsCreatedTotal": 5,
    "graphSyncFailuresTotal": 0
  }
}
```

**Example alert when readiness fails:**

```json
{
  "id": "readiness_degraded",
  "severity": "critical",
  "message": "Readiness degraded: mongodb",
  "since": "2026-06-01T12:00:00.000Z"
}
```

**curl:**

```bash
curl -s http://localhost:3000/ops/alerts \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### GET /ops/logs/summary

**Auth:** JWT required

**Permission:** `logs.read`

**Purpose:** Aggregates the merged JSON-lines log file by topic and log level.

**Query parameters:**

| Param | Default | Max | Description |
|-------|---------|-----|-------------|
| `limit` | `5000` | `50000` | Max log lines to scan |

**Response (200):**

```json
{
  "path": "/var/log/triage/merged.log",
  "exists": true,
  "topics": { "api": 120, "reviews": 45, "auth": 12 },
  "levels": { "info": 150, "warn": 20, "error": 7 },
  "totalLinesScanned": 177,
  "truncated": false
}
```

**curl:**

```bash
curl -s "http://localhost:3000/ops/logs/summary?limit=1000" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Authentication (`/auth`)

Public routes for login and password reset; profile and preferences require JWT.

**Related tests:**

- `backend/__tests__/authPreferences.test.js` — GET/PUT `/auth/preferences`
- `backend/__tests__/authPassword.test.js` — password hashing helpers (unit tests for reset flow)
- `backend/__tests__/authEmail.test.js` — password-reset email delivery (supports `/auth/forgot-password` behavior)

### GET /auth/config

**Auth:** None (public)

**Purpose:** Tells the React SPA whether Google login is enabled and which email delivery mode is configured.

**Response (200):**

```json
{
  "googleLoginEnabled": true,
  "emailDelivery": "mailpit",
  "devLoginAssist": true,
  "bootstrapEmailConfigured": true,
  "maskedBootstrapEmail": "yo***@example.com",
  "bootstrapPasswordHint": "temp-admin-pswd"
}
```

`devLoginAssist`, `maskedBootstrapEmail`, and `bootstrapPasswordHint` are present only when `DEPLOYMENT_ENV=dev`. The SPA uses them on the sign-in screen; they do not expose the full bootstrap email.

**curl:**

```bash
curl -s http://localhost:3000/auth/config
```

---

### POST /auth/dev/bootstrap-reset

**Auth:** None (public, **dev deployment only**)

**Purpose:** Resets the bootstrap admin password to `AUTH_BOOTSTRAP_ADMIN_PASSWORD` (or creates the admin if missing). Fixes login after Docker rebuild when Postgres volume `postgres-data` persists but env/password drifted.

**Response (200):**

```json
{
  "ok": true,
  "action": "password_reset",
  "email": "you@example.com",
  "message": "Bootstrap admin is ready...",
  "passwordHint": "temp-admin-pswd"
}
```

**Errors:**

- **403** `{ "error": "dev_only" }` — not `DEPLOYMENT_ENV=dev`
- **400** `{ "error": "bootstrap_email_not_configured" }` — set email via `configure-dev-bootstrap-admin.sh`

**curl:**

```bash
curl -sS -X POST http://localhost:3000/auth/dev/bootstrap-reset \
  -H "content-type: application/json" -d '{}'
```

**Related:** [stack_guide_build_and_run.md](stack_guide_build_and_run.md), `bash scripts/bootstrap-auth-admin.sh --reset-password`

---

### GET /auth/google/start

**Auth:** None (public)

**Purpose:** Redirects the browser to Google's OAuth consent screen. Used by the "Sign in with Google" button.

**Response:** HTTP **302 redirect** to Google (not JSON).

**Errors:**

- **503** `{ "error": "google_login_disabled" }` when Google OAuth is not configured.

**curl (follow redirects in browser; curl shows redirect URL):**

```bash
curl -sI http://localhost:3000/auth/google/start
```

---

### GET /auth/google/callback

**Auth:** None (public)

**Purpose:** Google redirects here after consent. The API exchanges the code, creates or links the user, and redirects to the React app with a JWT in query parameters.

**Query parameters (from Google):**

| Param | Description |
|-------|-------------|
| `code` | OAuth authorization code |
| `state` | CSRF state token |

**Success:** Redirect to `http://localhost:3001/?googleToken=YOUR_JWT_TOKEN&expiresIn=43200`

**Failure:** Redirect to `http://localhost:3001/?error=...&email=...`

**Errors (JSON instead of redirect when state/code invalid):**

- **400** `{ "error": "invalid_oauth_state" }`
- **503** `{ "error": "google_login_disabled" }`

This route is intended for browser redirects, not direct API scripting.

---

### POST /auth/login

**Auth:** None (public)

**Purpose:** Email/password login. Returns a JWT and user profile.

**Request body:**

```json
{
  "email": "analyst@example.com",
  "password": "your-password"
}
```

**Response (200):**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 43200,
  "user": {
    "id": 1,
    "email": "analyst@example.com",
    "roles": ["analyst"],
    "permissions": ["reviews.read", "reviews.write", "reviews.override", "graph.read"],
    "uiTheme": "default-light"
  }
}
```

**Errors:**

- **400** `{ "error": "email_and_password_required" }`
- **401** `{ "error": "invalid_credentials" }`

**curl:**

```bash
curl -s -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"analyst@example.com","password":"your-password"}'
```

Save the `token` value for subsequent requests.

---

### POST /auth/forgot-password

**Auth:** None (public)

**Purpose:** Request a password reset email. Always returns the same message whether or not the email exists (security best practice).

**Request body:**

```json
{
  "email": "user@example.com"
}
```

**Response (200):**

```json
{
  "ok": true,
  "message": "If an account exists for that email, password reset instructions were sent."
}
```

In dev, if email delivery fails, the reset link may be logged server-side. See `authEmail.test.js` for delivery modes (Mailpit vs external SMTP).

**curl:**

```bash
curl -s -X POST http://localhost:3000/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{"email":"user@example.com"}'
```

---

### POST /auth/reset-password

**Auth:** None (public)

**Purpose:** Set a new password using the token from the reset email.

**Request body:**

```json
{
  "token": "reset-token-from-email",
  "password": "newSecurePassword1"
}
```

**Response (200):**

```json
{
  "ok": true,
  "message": "Password updated. You can sign in now."
}
```

**Errors:**

- **400** `{ "error": "token_and_password_required" }`
- **400** `{ "error": "password_too_short" }` (minimum 8 characters)
- **400** `{ "error": "invalid_or_expired_token" }`

**curl:**

```bash
curl -s -X POST http://localhost:3000/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{"token":"reset-token-from-email","password":"newSecurePassword1"}'
```

---

### GET /auth/me

**Auth:** JWT required

**Permission:** None (any authenticated user)

**Purpose:** Returns the current user profile, roles, permissions, and UI theme.

**Response (200):**

```json
{
  "user": {
    "id": 1,
    "email": "analyst@example.com",
    "roles": ["analyst"],
    "permissions": ["reviews.read", "reviews.write", "reviews.override", "graph.read"],
    "isActive": true,
    "uiTheme": "ocean-dark"
  }
}
```

**curl:**

```bash
curl -s http://localhost:3000/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### GET /auth/preferences

**Auth:** JWT required

**Permission:** None

**Purpose:** Returns the user's current UI theme plus the full theme catalog for the settings picker.

**Response (200):**

```json
{
  "uiTheme": "ocean-dark",
  "defaultTheme": "default-light",
  "themes": [
    { "id": "default-light", "label": "Default light", "category": "light" },
    { "id": "nord", "label": "Nord", "category": "dark" }
  ]
}
```

**Related test:** `authPreferences.test.js` — expects 10+ themes in catalog.

**curl:**

```bash
curl -s http://localhost:3000/auth/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### PUT /auth/preferences

**Auth:** JWT required

**Permission:** None

**Purpose:** Persist UI theme selection to PostgreSQL (`auth_users.ui_theme`).

**Request body:**

```json
{
  "uiTheme": "nord"
}
```

**Response (200):**

```json
{
  "ok": true,
  "uiTheme": "nord"
}
```

**Errors:**

- **400** `{ "error": "invalid_ui_theme", "allowed": ["default-light", "nord", "..."] }`

**curl:**

```bash
curl -s -X PUT http://localhost:3000/auth/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"uiTheme":"nord"}'
```

---

## Reviews (`/reviews`)

Email triage documents stored in MongoDB. Creating a review enqueues async analysis (Kafka/worker pipeline) and schedules Neo4j graph sync.

**Default page size:** 20 (`REVIEW_PAGE_SIZE` in `shared/config/pagination.js`)

### GET /reviews

**Auth:** JWT required

**Permission:** `reviews.read`

**Query parameters:**

| Param | Default | Description |
|-------|---------|-------------|
| `page` | `0` | Zero-based page index |
| `limit` | `20` | Page size (max 20) |

**Response (200):**

```json
{
  "data": [
    {
      "_id": "665a1b2c3d4e5f6789012345",
      "senderEmail": "sender@evil.com",
      "subject": "Urgent: verify your account",
      "status": "completed",
      "analysisResult": { "verdict": "likely_phishing" },
      "updatedAt": "2026-06-01T11:30:00.000Z"
    }
  ],
  "page": 0,
  "limit": 20,
  "total": 42,
  "hasMore": true
}
```

**curl:**

```bash
curl -s "http://localhost:3000/reviews?page=0&limit=20" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### POST /reviews

**Auth:** JWT required

**Permission:** `reviews.write`

**Request body:**

```json
{
  "senderName": "Jane Doe",
  "senderEmail": "jane@company.com",
  "subject": "Invoice attached",
  "body": "Please review the attached invoice.\n\nhttp://suspicious-link.example/invoice",
  "referenceSources": [
    { "type": "text", "title": "Known vendor list", "content": "Acme Corp billing" }
  ]
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `senderName` | Yes | Display name of sender |
| `senderEmail` | Yes | Sender email address |
| `subject` | Yes | Email subject line |
| `body` | Yes | Email body (URLs are auto-extracted to `links`) |
| `referenceSources` | No | Optional analyst reference material |

**Response (201):**

```json
{
  "id": "665a1b2c3d4e5f6789012345",
  "status": "pending"
}
```

**Errors:**

- **400** `{ "error": "missing_fields" }`

**curl:**

```bash
curl -s -X POST http://localhost:3000/reviews \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "senderName": "Jane Doe",
    "senderEmail": "jane@company.com",
    "subject": "Invoice attached",
    "body": "Please review http://example.com/invoice"
  }'
```

---

### GET /reviews/:id

**Auth:** JWT required

**Permission:** `reviews.read`

**Purpose:** Full review document for detail view and status polling.

**Response (200):** Full MongoDB document including `analysisResult`, `override`, timestamps, etc.

```json
{
  "_id": "665a1b2c3d4e5f6789012345",
  "senderName": "Jane Doe",
  "senderEmail": "jane@company.com",
  "subject": "Invoice attached",
  "body": "...",
  "links": ["http://example.com/invoice"],
  "status": "completed",
  "analysisResult": {
    "verdict": "suspicious",
    "recommendedAction": "investigate",
    "summary": "Sender domain mismatch with known vendor.",
    "findings": [
      {
        "severity": "high",
        "explanation": "URL domain recently registered",
        "evidence": "http://example.com/invoice"
      }
    ],
    "followUpQuestions": []
  },
  "createdAt": "2026-06-01T10:00:00.000Z",
  "updatedAt": "2026-06-01T10:05:00.000Z"
}
```

**Errors:**

- **404** `{ "error": "Review not found" }`

**curl:**

```bash
curl -s http://localhost:3000/reviews/665a1b2c3d4e5f6789012345 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### POST /reviews/:id/override

**Auth:** JWT required

**Permission:** `reviews.override`

**Purpose:** Analyst manual verdict override with audit trail (`analystEmail` taken from JWT).

**Request body:**

```json
{
  "verdict": "benign",
  "recommendedAction": "close",
  "reason": "Confirmed legitimate vendor after phone verification"
}
```

| Field | Values |
|-------|--------|
| `verdict` | `benign`, `suspicious`, `likely_phishing` |
| `recommendedAction` | `close`, `investigate`, `report_and_block` |
| `reason` | Free-text explanation |

**Response (200):**

```json
{
  "ok": true,
  "review": {
    "_id": "665a1b2c3d4e5f6789012345",
    "override": {
      "verdict": "benign",
      "recommendedAction": "close",
      "reason": "Confirmed legitimate vendor after phone verification",
      "analystEmail": "analyst@example.com",
      "timestamp": "2026-06-01T12:00:00.000Z"
    }
  }
}
```

**curl:**

```bash
curl -s -X POST http://localhost:3000/reviews/665a1b2c3d4e5f6789012345/override \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"verdict":"benign","recommendedAction":"close","reason":"Verified by phone"}'
```

---

## Metrics (`/metrics`)

Chart data backed by PostgreSQL statistics events (not full MongoDB scans).

### GET /metrics/timeseries

**Auth:** JWT required

**Permission:** `metrics.read`

**Query parameters:**

| Param | Default | Description |
|-------|---------|-------------|
| `from` | 7 days ago | ISO timestamp start |
| `to` | now | ISO timestamp end |
| `bucket` | `1h` | `15m`, `1h`, or `1d` |

**Response (200):**

```json
{
  "from": "2026-05-25T12:00:00.000Z",
  "to": "2026-06-01T12:00:00.000Z",
  "bucket": "1h",
  "series": [
    { "t": "2026-06-01T10:00:00.000Z", "count": 3 },
    { "t": "2026-06-01T11:00:00.000Z", "count": 7 }
  ]
}
```

**curl:**

```bash
curl -s "http://localhost:3000/metrics/timeseries?bucket=1h&from=2026-05-01T00:00:00.000Z" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### GET /metrics/status-breakdown

**Auth:** JWT required

**Permission:** `metrics.read`

**Query parameters:** `from`, `to` (same defaults as timeseries)

**Response (200):**

```json
{
  "from": "2026-05-25T12:00:00.000Z",
  "to": "2026-06-01T12:00:00.000Z",
  "breakdown": [
    { "status": "completed", "count": 30 },
    { "status": "failed", "count": 2 },
    { "status": "pending", "count": 5 }
  ]
}
```

**curl:**

```bash
curl -s "http://localhost:3000/metrics/status-breakdown" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Graph (`/graph`)

Neo4j phishing relationship graph: senders, URLs, domains, campaigns.

**Related tests:**

- `backend/__tests__/graphApi.test.js` — `/graph/status`, `/graph/campaigns`
- `backend/__tests__/graphSync.test.js` — graph sync service logic
- `backend/__tests__/graphInternal.test.js` — internal sync route (see below)

### GET /graph/status

**Auth:** JWT required

**Permission:** `graph.read`

**Response (200):**

```json
{
  "enabled": true,
  "service": "neo4j-phishing-graph"
}
```

**curl:**

```bash
curl -s http://localhost:3000/graph/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### GET /graph/campaigns

**Auth:** JWT required

**Permission:** `graph.read`

**Purpose:** Lists phishing campaigns (domains shared across multiple risky reviews).

**Query parameters:**

| Param | Default | Max |
|-------|---------|-----|
| `limit` | `50` | `200` |

**Response (200):**

```json
{
  "campaigns": [
    {
      "indicator": "evil.com",
      "reviewCount": 5,
      "kind": "shared_domain"
    }
  ]
}
```

**curl:**

```bash
curl -s "http://localhost:3000/graph/campaigns?limit=10" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### GET /graph/review/:id/neighborhood

**Auth:** JWT required

**Permission:** `graph.read`

**Purpose:** Local subgraph around one review (nodes and edges for analyst drill-down).

**Query parameters:**

| Param | Default | Max |
|-------|---------|-----|
| `depth` | `2` | `4` |

**Response (200):**

```json
{
  "nodes": [
    { "id": "review:665a1b2c3d4e5f6789012345", "label": "Urgent verify", "type": "Review", "properties": {} },
    { "id": "domain:evil.com", "label": "evil.com", "type": "Domain", "properties": {} }
  ],
  "edges": [
    { "source": "review:665a1b2c3d4e5f6789012345", "target": "domain:evil.com", "label": "CONTAINS_URL" }
  ]
}
```

**curl:**

```bash
curl -s "http://localhost:3000/graph/review/665a1b2c3d4e5f6789012345/neighborhood?depth=2" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### GET /graph/visualization

**Auth:** JWT required

**Permission:** `graph.read`

**Purpose:** Nodes and edges for the React SVG graph dashboard view.

**Query parameters:**

| Param | Default | Max |
|-------|---------|-----|
| `limit` | `40` | `100` |

**Response (200):**

```json
{
  "nodes": [],
  "edges": [],
  "stats": {
    "reviewCount": 12,
    "campaignCount": 3
  }
}
```

**curl:**

```bash
curl -s "http://localhost:3000/graph/visualization?limit=40" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### POST /graph/sync/:id

**Auth:** JWT required

**Permission:** `graph.read`

**Purpose:** Manual re-sync of one review into Neo4j (developer troubleshooting). Same underlying logic as the internal worker route, but authenticated as a user.

**Request body:** None

**Response (200):**

```json
{
  "synced": true,
  "reviewId": "665a1b2c3d4e5f6789012345"
}
```

**Errors:**

- **404** `{ "error": "not_found" }`

**curl:**

```bash
curl -s -X POST http://localhost:3000/graph/sync/665a1b2c3d4e5f6789012345 \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Graph internal (`/graph/internal`)

Service-to-service route mounted **before** JWT middleware so workers can call it with a static token.

**Related tests:** `backend/__tests__/graphInternal.test.js`

### POST /graph/internal/sync/:id

**Auth:** `X-Graph-Internal-Token` header (not JWT)

**Permission:** None — token must match `GRAPH_INTERNAL_TOKEN` env

**Purpose:** Called by Celery/worker after analysis completes to upsert the review into Neo4j.

**Request body:** None

**Response (200):**

```json
{
  "synced": true,
  "reviewId": "665a1b2c3d4e5f6789012345"
}
```

**Errors:**

- **401** `{ "error": "invalid_internal_token" }`
- **404** `{ "error": "not_found" }`

**curl:**

```bash
curl -s -X POST http://localhost:3000/graph/internal/sync/665a1b2c3d4e5f6789012345 \
  -H "X-Graph-Internal-Token: YOUR_GRAPH_INTERNAL_TOKEN"
```

In local dev, the fallback token name is documented in code comments only — always set `GRAPH_INTERNAL_TOKEN` explicitly in production.

---

## Developer routes (`/dev`)

Dev-only controls for simulation and resetting local state. Mutating routes require **`DEPLOYMENT=dev`** (or equivalent dev slice) **and** the `developer` role in addition to permissions.

### GET /dev/features

**Auth:** JWT required

**Permission:** None (returns flags based on your permissions and deployment)

**Purpose:** Tells the React SPA which optional panels to show (simulation, analytics, reset).

**Response (200):**

```json
{
  "deployment": "dev",
  "simulation": true,
  "analytics": true,
  "resetLocalState": true,
  "simulationMaxEventsPerMin": 30,
  "roles": ["developer"],
  "permissions": ["reviews.read", "dev.simulation", "dev.reset"]
}
```

**curl:**

```bash
curl -s http://localhost:3000/dev/features \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### GET /dev/simulation

**Auth:** JWT required

**Permission:** `dev.simulation` **and** `developer` role

**Deployment:** Dev only (403 `dev_only` in non-dev)

**Response (200):**

```json
{
  "simulation": {
    "enabled": false,
    "eventsPerMinute": 2
  }
}
```

**curl:**

```bash
curl -s http://localhost:3000/dev/simulation \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

### POST /dev/simulation

**Auth:** JWT required

**Permission:** `dev.simulation` **and** `developer` role

**Deployment:** Dev only

**Request body:**

```json
{
  "enabled": true,
  "eventsPerMinute": 5
}
```

`eventsPerMinute` is clamped to a maximum (default 30, configurable via `SIMULATION_MAX_EVENTS_PER_MIN`).

**Response (200):**

```json
{
  "ok": true,
  "simulation": {
    "enabled": true,
    "eventsPerMinute": 5
  }
}
```

**curl:**

```bash
curl -s -X POST http://localhost:3000/dev/simulation \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"enabled":true,"eventsPerMinute":5}'
```

---

### POST /dev/reset-local-state

**Auth:** JWT required

**Permission:** `dev.reset` **and** `developer` role

**Deployment:** Dev only

**Purpose:** Clears MongoDB reviews, PostgreSQL stats, Redis, recreates Kafka topics, clears Neo4j, and disables simulation. **Destructive — local dev only.**

**Request body:** None

**Response (200):**

```json
{
  "ok": true,
  "summary": {
    "simulation": "disabled",
    "mongoReviewsDeleted": 42,
    "postgresStats": "cleared",
    "redis": "flushed",
    "kafka": "topic_recreated",
    "neo4j": "cleared"
  }
}
```

**curl:**

```bash
curl -s -X POST http://localhost:3000/dev/reset-local-state \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Log search

### GET /logs/search

**Auth:** JWT required

**Permission:** `logs.read`

**Purpose:** Search the merged JSON-lines application log file.

**Query parameters:**

| Param | Default | Max | Description |
|-------|---------|-----|-------------|
| `keyword` | (empty) | — | Case-insensitive substring in message or JSON |
| `topic` | (empty) | — | Filter by log topic |
| `from` | — | — | ISO timestamp lower bound |
| `to` | — | — | ISO timestamp upper bound |
| `limit` | `200` | `2000` | Max entries returned |

**Response (200):**

```json
{
  "path": "/var/log/triage/merged.log",
  "entries": [
    {
      "ts": "2026-06-01T11:00:00.000Z",
      "level": "info",
      "topic": "reviews",
      "message": "created",
      "id": "665a1b2c3d4e5f6789012345"
    }
  ],
  "truncated": false
}
```

**curl:**

```bash
curl -s "http://localhost:3000/logs/search?keyword=failed&topic=api&limit=50" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Test / demo endpoint

### POST /test

**Auth:** JWT required

**Permission:** `reviews.write`

**Purpose:** Quick demo review creation using the authenticated user's email as sender. Enqueues analysis like `POST /reviews`.

**Request body:**

```json
{
  "subject": "Test suspicious email",
  "body": "Click here: http://phishing.example/login"
}
```

| Field | Required |
|-------|----------|
| `body` | Yes |
| `subject` | No (defaults to `"no subject"`) |

**Response (200):**

```json
{
  "ok": true,
  "reviewId": "665a1b2c3d4e5f6789012345"
}
```

**Errors:**

- **400** `{ "error": "body_required" }`

**curl:**

```bash
curl -s -X POST http://localhost:3000/test \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"subject":"Demo","body":"Suspicious link http://example.com"}'
```

---

## Running API tests

From the `backend/` directory:

```bash
npm test
```

| Test file | Routes / area covered |
|-----------|----------------------|
| `__tests__/healthApi.test.js` | `/health/live`, `/health/ready`, `/health` |
| `__tests__/opsApi.test.js` | `/ops/prometheus`, `/ops/alerts`, `/ops/logs/summary` |
| `__tests__/authPreferences.test.js` | `/auth/preferences` GET and PUT |
| `__tests__/authPassword.test.js` | Password hashing (supports reset flow) |
| `__tests__/authEmail.test.js` | Reset email delivery (supports `/auth/forgot-password`) |
| `__tests__/graphApi.test.js` | `/graph/status`, `/graph/campaigns` |
| `__tests__/graphInternal.test.js` | `/graph/internal/sync/:id` |
| `__tests__/graphSync.test.js` | Graph sync service (used by sync routes) |

Integration tests for reviews, metrics, dev routes, and `/logs/search` may require Docker dependencies (MongoDB, PostgreSQL, Redis, Neo4j). See `backend/__tests__/README.md`.

---

## Source code reference

Route definitions:

| Mount path | Source file |
|------------|-------------|
| App wiring | `backend/src/http/createApp.js` |
| `/health` | `backend/src/api/health.js` |
| `/ops` | `backend/src/api/ops.js` |
| `/auth` | `backend/src/api/auth.js` |
| `/reviews` | `backend/src/api/reviews.js` |
| `/metrics` | `backend/src/api/metrics.js` |
| `/graph` | `backend/src/api/graph.js` |
| `/graph/internal` | `backend/src/api/graphInternal.js` |
| `/dev` | `backend/src/dev/devRoutes.js` |
| Auth middleware | `backend/src/http/middleware/auth.js` |

---

## Tips for beginners

1. **Always login first** — copy the `token` from `POST /auth/login` into your `Authorization` header.
2. **Check permissions** — `GET /auth/me` shows what your user can access.
3. **Poll review status** — after `POST /reviews`, call `GET /reviews/:id` until `status` is `completed` or `failed`.
4. **Use health routes without auth** — verify the stack is up before debugging JWT issues.
5. **Keep secrets out of git** — use placeholders in scripts; load real tokens from your local environment at runtime.
