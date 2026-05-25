# DBeaver: auth tables & unified log viewing (Windows 11 + WSL)

This guide answers three common questions after enabling authentication:

1. **Why don’t I see the new `auth_*` PostgreSQL tables in DBeaver?**
2. **How do I initialize auth and create an admin user** (full UI + all API access)?
3. **How do I browse and search the unified merged log with a UI?**

Prerequisites for database connectivity: [dbeaver_postgresql_windows_setup.md](dbeaver_postgresql_windows_setup.md) and [windows_docker_databases_start_and_verify.md](windows_docker_databases_start_and_verify.md).

Bootstrap admin email, password, and recovery: [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md).

**Login fails but `auth_users` shows your email?** Password is bcrypt-hashed and not visible in DBeaver — see [dev_auth_tables_reset_and_admin_recovery.md](dev_auth_tables_reset_and_admin_recovery.md).

---

## Part 1 — Auth tables in DBeaver & admin user setup

Auth/RBAC tables live in the **same database** as chart statistics: **`triage_stats`**. They are created by the Node API (or a one-shot init command below). **You do not need a working MongoDB connection to create auth tables** — only PostgreSQL.

### Quick decision tree

| What you see | What to do |
|--------------|------------|
| DBeaver: no `auth_*` tables | [Initialize auth tables](#step-2--initialize-auth-tables-postgresql-only) → **F5** in DBeaver |
| `\dt auth_*` OK, but API won’t start | [Fix MongoDB](#step-1b--mongodb-stuck-or-backend-fatal-startup) (auth tables already exist) |
| `MODULE_NOT_FOUND` in backend logs | Rebuild backend: `up -d --build backend` |
| `docker compose restart mongo` hangs 60s+ | [Force-recreate Mongo](#mongodb-restart-hangs) |
| Need first admin login | [Configure email](#step-3--create-the-bootstrap-admin-user) → [Bootstrap admin](#step-3--create-the-bootstrap-admin-user) |

---

### Step 1 — Start PostgreSQL (WSL, repo root)

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d postgres
docker compose -f infra/docker/docker-compose.yml exec postgres pg_isready -U triage -d triage_stats
```

Expected: `accepting connections`.

Optionally start the full stack later; **auth table creation only requires Postgres**.

---

### Step 1b — MongoDB stuck or backend `fatal startup`

The API **depends on MongoDB** for review data, but **auth tables are created in PostgreSQL first**. You may see:

- `docker compose logs backend` → `[critical] [http] fatal startup` (often every ~30s)
- `curl http://localhost:3000/health` → connection reset
- Empty `logs backend --tail 30` right after restart (wait 10–15s and run again)

**Typical cause:** MongoDB unreachable (`Server selection timed out`). The `triage-mongo` container may show **Running** but still not accept connections (stale/wedged after long uptime).

#### MongoDB restart hangs

If `docker compose ... restart mongo` sits on **Container triage-mongo Restarting** for more than ~2 minutes:

1. Press **Ctrl+C** to cancel the wait.
2. **Stop** then **start** (often faster than restart):

```bash
docker compose -f infra/docker/docker-compose.yml stop mongo
docker compose -f infra/docker/docker-compose.yml up -d mongo
```

3. Wait ~10 seconds, then verify:

```bash
docker compose -f infra/docker/docker-compose.yml exec mongo mongosh --eval "db.runCommand({ ping: 1 })"
```

Expected: `{ ok: 1 }`.

#### MongoDB still broken — force recreate (dev only; wipes Mongo data)

```bash
docker compose -f infra/docker/docker-compose.yml stop mongo
docker compose -f infra/docker/docker-compose.yml rm -f mongo
docker compose -f infra/docker/docker-compose.yml up -d mongo
docker compose -f infra/docker/docker-compose.yml exec mongo mongosh --eval "db.runCommand({ ping: 1 })"
```

#### Bring the API up after Mongo is healthy

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --build backend
docker compose -f infra/docker/docker-compose.yml logs backend --tail 30
```

**Healthy:** a line containing **`listening on 3000`**.  
**Unhealthy:** repeated **`fatal startup`** — read the stack trace at the bottom of the log output (Mongo timeout, missing module, etc.).

| Backend log symptom | Fix |
|---------------------|-----|
| `MODULE_NOT_FOUND` under `middleware/auth.js` | `up -d --build backend` (stale image) |
| `fatal startup` + Mongo / `Server selection timed out` | Fix Mongo ([above](#step-1b--mongodb-stuck-or-backend-fatal-startup)), then rebuild backend |
| Empty log output | Wait 15s; container may still be starting or crash-looping — run `logs` again |

---

### Step 2 — Initialize auth tables (PostgreSQL only)

Choose **one** path.

#### Path A — Automatic (recommended): start backend with empty `auth_users`

Requires Postgres **and** (for a fully healthy API) working Mongo. Auth schema runs **before** Mongo connect.

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d postgres mongo
# Fix Mongo first if needed (Step 1b), then:
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --build backend
```

On **first startup when `auth_users` is empty**, the API seeds roles/permissions and creates the bootstrap admin (see Step 3).

#### Path B — Manual one-shot (works even when Mongo/API is down)

Use this when you only need **DBeaver + auth tables + admin row** without a healthy API:

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d postgres backend
docker compose -f infra/docker/docker-compose.yml exec backend node -e "
const auth = require('./src/auth/authPg');
(async () => {
  await auth.ensureAuthSchema();
  await auth.seedRolesAndPermissions();
  const created = await auth.bootstrapAdminUser();
  console.log(created ? 'bootstrap admin created: ' + created.email : 'users already exist; skipped bootstrap');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
"
```

Confirm tables:

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres \
  psql -U triage -d triage_stats -c "\dt auth_*"
```

Expected tables:

| Table | Purpose |
|-------|---------|
| `auth_users` | Email + password hash |
| `auth_roles` | Role names (`admin`, `analyst`, …) |
| `auth_permissions` | Permission codes |
| `auth_role_permissions` | Role → permission mapping |
| `auth_user_roles` | User → role assignment |
| `auth_password_reset_tokens` | Password recovery tokens |

Also: `review_stats_events` (chart statistics).

**Not in PostgreSQL:** Django admin sessions and Django contrib.auth tables (`auth_user` singular, `django_session`, …) live in the **django-admin container’s SQLite volume**. If you see duplicate Django tables in Postgres from an older build, run `bash scripts/cleanup-postgres-django-auth-tables.sh` — see [django_admin_user_management.md](django_admin_user_management.md).

**Important:** Tables can exist with **zero rows in `auth_users`**. Schema creation and admin bootstrap are separate steps. If your query returns `(0 rows)` for users, run [Step 3](#step-3--create-the-bootstrap-admin-user) below — do not assume the admin was created automatically.

---

### Step 3 — Create the bootstrap admin user

The **`admin` role** has **all permissions**: every UI tab (triage, analytics, dev simulation when in `dev`), Django user administration, and every protected HTTP route (`/reviews`, `/metrics`, `/logs/search`, `/dev/*`, etc.). User CRUD is in Django admin — see [django_admin_user_management.md](django_admin_user_management.md).

**Symptom:** `\dt auth_*` shows 6 tables but `SELECT ... FROM auth_users` returns **(0 rows)**. The schema ran; bootstrap did not. The API may still be crash-looping on Mongo — bootstrap can run **without a healthy API**.

#### Step 3a — Configure your real admin email (required once)

```bash
cd ~/suspicious-email-triage
bash scripts/configure-dev-bootstrap-admin.sh you@example.com
```

Replace `you@example.com` with an address you control. Full detail: [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md).

#### Step 3b — Bootstrap the admin row

From repository root:

```bash
bash scripts/bootstrap-auth-admin.sh
```

Or with explicit dev profile:

```bash
DEPLOYMENT_ENV=dev bash scripts/bootstrap-auth-admin.sh
```

Expected output includes `Bootstrap admin created: you@example.com` (your configured email).

Temporary password: **`temp-admin-pswd`** (change via **Forgot password** after first login).

#### Manual equivalent

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d postgres backend
docker compose -f infra/docker/docker-compose.yml exec backend node -e "
const auth = require('./src/auth/authPg');
(async () => {
  await auth.ensureAuthSchema();
  await auth.seedRolesAndPermissions();
  const created = await auth.bootstrapAdminUser();
  console.log(created ? 'created ' + created.email : 'users already exist');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
"
```

#### Default credentials (dev)

| Variable | Where | Value |
|----------|-------|-------|
| `AUTH_BOOTSTRAP_ADMIN_EMAIL` | gitignored `backend/.env` | **Your email** (via `configure-dev-bootstrap-admin.sh`) |
| `AUTH_BOOTSTRAP_ADMIN_PASSWORD` | `backend/.env.dev` | `temp-admin-pswd` |

Bootstrap runs **only once** — when `auth_users` has **zero rows**. It does **not** run automatically if only the schema was created manually.

See [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md) for change/recover flows.

#### Verify admin exists (WSL)

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres \
  psql -U triage -d triage_stats -c "SELECT email FROM auth_users;"
```

Expected: one row with **your configured email**.

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres \
  psql -U triage -d triage_stats -c "
SELECT u.email, array_agg(r.name ORDER BY r.name) AS roles
FROM auth_users u
LEFT JOIN auth_user_roles ur ON ur.user_id = u.id
LEFT JOIN auth_roles r ON r.id = ur.role_id
GROUP BY u.email ORDER BY u.email;"
```

Expected: `you@example.com` | `{admin}`.

#### Verify login (API) — requires healthy backend

`curl: (56) Recv failure: Connection reset` means the **API is not listening** (usually Mongo still down). Fix [Step 1b](#step-1b--mongodb-stuck-or-backend-fatal-startup) first, then:

```bash
curl -sS -X POST "http://localhost:3000/auth/login" \
  -H "content-type: application/json" \
  -d '{"email":"you@example.com","password":"temp-admin-pswd"}' | python3 -m json.tool
```

Expected: JSON with `"token"` and `"user"` containing `"roles": ["admin"]` and a long `"permissions"` list.

#### Verify in the UI (Windows)

1. Start frontend: `REACT_APP_API_URL=http://localhost:3000 PORT=3001 npm start --prefix frontend`
2. Open `http://localhost:3001`
3. Sign in with **your email** / **`temp-admin-pswd`**
4. You should see **Triage workspace** and **Analytics & graphs** tabs, plus **User administration** (admin role).

#### Admin already exists but you forgot the password

Use **Forgot password** on the sign-in screen. Step-by-step: [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md).

#### Create additional admins (after first login)

Sign in as admin → **User administration** → create user → assign role **`admin`**. See [django_admin_user_management.md](django_admin_user_management.md).

---

### Step 4 — Refresh DBeaver on Windows 11

1. Open your **`triage_stats`** connection.
2. Expand: connection → **Databases** → `triage_stats` → **Schemas** → **public** → **Tables**
3. Select **Tables** → press **F5** (Refresh).
4. Confirm `auth_users`, `auth_roles`, … appear next to `review_stats_events`.

---

### Step 5 — Inspect data in DBeaver

Right-click a table → **View data**, or run SQL:

```sql
-- All roles and permissions (admin should have every permission code)
SELECT r.name AS role, p.code AS permission
FROM auth_roles r
JOIN auth_role_permissions rp ON rp.role_id = r.id
JOIN auth_permissions p ON p.id = rp.permission_id
ORDER BY r.name, p.code;

SELECT id, email, is_active, created_at FROM auth_users ORDER BY email;

SELECT u.email, r.name AS role
FROM auth_users u
JOIN auth_user_roles ur ON ur.user_id = u.id
JOIN auth_roles r ON r.id = ur.role_id
ORDER BY u.email, r.name;
```

Full role/permission reference: [AUTHENTICATION_AND_RBAC.md](AUTHENTICATION_AND_RBAC.md).

### DBeaver troubleshooting

| Symptom | Fix |
|---------|-----|
| Only `review_stats_events`, no `auth_*` | [Step 2 Path B](#path-b--manual-one-shot-works-even-when-mongoapi-is-down) then **F5** |
| Tables exist in `\dt` but not in DBeaver | **F5** on Tables; disconnect/reconnect; confirm database `triage_stats` |
| Tables exist, **0 users** | Run `bash scripts/bootstrap-auth-admin.sh` |
| Email in `auth_users`, login fails | [dev_auth_tables_reset_and_admin_recovery.md](dev_auth_tables_reset_and_admin_recovery.md) |
| `curl` connection reset | API down — fix Mongo ([Step 1b](#step-1b--mongodb-stuck-or-backend-fatal-startup)), not an auth user issue |
| Connected to wrong Postgres | Port `5432` conflict — see [dbeaver_postgresql_windows_setup.md](dbeaver_postgresql_windows_setup.md) |
| Permission denied | User `triage` / password `triage` |

---

## Part 2 — Unified merged log: what it is

All Node and Python services append **one JSON line per event** to a shared file:

- **Inside Docker:** `/var/log/triage/merged.log` (Docker volume `triage-logs`)
- **Format:** newline-delimited JSON, e.g. `{"ts":"...","level":"info","topic":"reviews","message":"created",...}`

The API exposes search at `GET /logs/search` (requires **`logs.read`** permission, typically **admin**). There is **no dedicated Windows desktop app** shipped with this repo for log viewing.

Below: practical ways to **view and search** the log from Windows/WSL.

---

## Option A — API search (any OS, no log file copy)

Best when you already have an admin JWT. See [AUTHENTICATION_AND_RBAC.md](AUTHENTICATION_AND_RBAC.md) for login.

```bash
# 1) Sign in (replace email/password — see dev_admin_credentials_and_recovery.md)
TOKEN="$(curl -sS -X POST "http://localhost:3000/auth/login" \
  -H "content-type: application/json" \
  -d '{"email":"you@example.com","password":"temp-admin-pswd"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")"

# 2) Search by keyword
curl -sS "http://localhost:3000/logs/search?keyword=simulation&limit=50" \
  -H "authorization: Bearer ${TOKEN}" | python3 -m json.tool

# 3) Filter by topic substring and time window
curl -sS "http://localhost:3000/logs/search?topic=reviews&from=2026-05-19T00:00:00Z&limit=100" \
  -H "authorization: Bearer ${TOKEN}" | python3 -m json.tool
```

Query parameters:

| Parameter | Meaning |
|-----------|---------|
| `keyword` | Case-insensitive search in message + full JSON line |
| `topic` | Substring match on `topic` field |
| `from`, `to` | ISO timestamps filtering `ts` |
| `limit` | Max rows (default 200, cap 2000) |

This is **not a graphical UI**, but it is the built-in search path and matches what the backend implements.

---

## Option B — Copy log to WSL, open in VS Code / Cursor (simple GUI search)

### 1. Copy from the running backend container (WSL, repo root)

```bash
mkdir -p backend/logs
docker compose -f infra/docker/docker-compose.yml cp \
  backend:/var/log/triage/merged.log backend/logs/merged.log
```

Repeat the copy whenever you want a fresh snapshot.

### 2. Open in VS Code or Cursor on Windows

- **File → Open Folder** → `\\wsl$\Ubuntu\home\<you>\suspicious-email-triage` (adjust distro/username path), or
- From WSL: `code backend/logs/merged.log` / `cursor backend/logs/merged.log`

Use **Ctrl+F** / **Ctrl+Shift+F** for search. JSON lines are long; **Ctrl+F** per line or extension **JSON** folding helps.

Good for occasional inspection; the file can grow quickly under simulation load.

---

## Option C — **lnav** on WSL (recommended log UI)

[**lnav**](https://lnav.org/) is a log navigator with JSON support, filtering, search, and timeline views. It runs in the terminal (rich TUI). On WSL2 with Windows Terminal it feels like a focused log GUI.

### Install (WSL Ubuntu)

```bash
sudo apt-get update
sudo apt-get install -y lnav
```

### Copy log, then open

```bash
# From repository root
mkdir -p backend/logs
docker compose -f infra/docker/docker-compose.yml cp \
  backend:/var/log/triage/merged.log backend/logs/merged.log

lnav backend/logs/merged.log
```

### Useful lnav keys

| Key | Action |
|-----|--------|
| `/` | Search (regex) |
| `n` / `N` | Next / previous match |
| `:filter-in topic reviews` | Show lines where JSON field matches |
| `:filter-in level error` | Errors only |
| `T` | Toggle timeline view |
| `q` | Quit |

For live tailing, tail inside the container then pipe (advanced):

```bash
docker compose -f infra/docker/docker-compose.yml exec backend tail -f /var/log/triage/merged.log | lnav
```

---

## Option D — **glogg** on WSL (classic Linux GUI log viewer)

If you use **WSLg** (GUI apps from WSL on Windows 11), **glogg** provides a traditional graphical log viewer.

### Install (WSL Ubuntu)

```bash
sudo apt-get update
sudo apt-get install -y glogg
```

### Open the copied log

```bash
glogg backend/logs/merged.log
```

Use the search box and highlight filters. Very large files may be slower than **lnav**.

If `glogg` cannot open a display, ensure WSLg is enabled (Windows 11: default for recent WSL installs) or use Option B or C.

---

## Option E — Stream logs in Docker Desktop (view only, weak search)

1. Open **Docker Desktop** → **Containers** → `triage-backend` (or `triage-ai-celery`).
2. Open the **Logs** tab.

This shows **container stdout**, which mirrors log lines but is **not** the merged file search UI and does not replace `GET /logs/search`. Useful for quick glances only.

---

## Recommended workflow (summary)

| Goal | Approach |
|------|----------|
| Create auth tables + admin | [Step 2 Path B](#path-b--manual-one-shot-works-even-when-mongoapi-is-down) or start backend on empty DB |
| See `auth_*` in DBeaver | Initialize auth → **F5** refresh |
| API crash-loop (Mongo) | [Step 1b](#step-1b--mongodb-stuck-or-backend-fatal-startup) |
| Mongo restart hangs | `stop mongo` → `up -d mongo` → ping → rebuild backend |
| SQL on users/roles | DBeaver SQL editor on `triage_stats` |
| Full-access login | Your email / `temp-admin-pswd` ([Step 3](#step-3--create-the-bootstrap-admin-user), [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md)) |
| Reset auth + new admin | [dev_auth_tables_reset_and_admin_recovery.md](dev_auth_tables_reset_and_admin_recovery.md) |
| Structured log search (admin) | `GET /logs/search` with bearer token |
| Best interactive log UI in WSL | Copy `merged.log` → **lnav** |
| Simple GUI on Windows | Copy to `backend/logs/` → VS Code / Cursor |
| Native Linux GUI on WSL | **glogg** (WSLg) |

---

## Optional: keep merged log on the WSL disk (advanced)

By default the log lives in Docker volume `triage-logs`, not on your project folder. To always have `backend/logs/merged.log` updated without `docker cp`, create `infra/docker/docker-compose.override.yml` (not committed unless you choose):

```yaml
services:
  backend:
    volumes:
      - ../../backend/logs:/var/log/triage
  ai-celery:
    volumes:
      - ../../backend/logs:/var/log/triage
  ai-kafka-dispatch:
    volumes:
      - ../../backend/logs:/var/log/triage
```

Then recreate containers:

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --force-recreate backend ai-celery ai-kafka-dispatch
```

All services must share the same host directory so they append to one file. Open `backend/logs/merged.log` from Windows via `\\wsl$\...` or with **lnav** / **glogg**.

---

## Related docs

- [AUTHENTICATION_AND_RBAC.md](AUTHENTICATION_AND_RBAC.md) — login, admin role, `logs.read`
- [dbeaver_postgresql_windows_setup.md](dbeaver_postgresql_windows_setup.md) — first-time DBeaver connection
- [windows_docker_databases_start_and_verify.md](windows_docker_databases_start_and_verify.md) — start Postgres and verify ports
