# Authentication & RBAC

This document describes how users sign in, recover credentials, call protected APIs, and how roles gate UI pages and HTTP routes.

## Overview

- **Users** are stored in PostgreSQL (`auth_users`) with email + bcrypt password hash. The plain password is **never** stored — seeing an email in DBeaver does not mean you can sign in. See [dev_auth_tables_reset_and_admin_recovery.md](dev_auth_tables_reset_and_admin_recovery.md).
- **Roles** (`admin`, `analyst`, `manager`, `developer`, `viewer`) map to **permissions** through `auth_role_permissions`.
- The API issues **JWT bearer tokens** after login; every route except `/health` and public `/auth/*` recovery endpoints requires `Authorization: Bearer <token>`.
- The React UI blocks all product screens until login succeeds.

PostgreSQL hosts both chart statistics (`review_stats_events`) and auth tables in the same database (`triage_stats` by default).

## Roles and permissions

| Role | Permissions | Typical use |
|------|-------------|-------------|
| `admin` | all permissions | user provisioning, logs, full access |
| `analyst` | `reviews.read`, `reviews.write`, `reviews.override` | day-to-day triage |
| `manager` | `reviews.read`, `metrics.read` | analytics visibility |
| `developer` | analyst + `dev.simulation`, `dev.reset` | local simulation & reset (also requires `DEPLOYMENT_ENV=dev`) |
| `viewer` | `reviews.read` | read-only review list |

Permission codes enforced by the API:

- `reviews.read` — list/get reviews
- `reviews.write` — create reviews
- `reviews.override` — save analyst overrides
- `metrics.read` — analytics charts (`/metrics/*`)
- `dev.simulation` — simulation controls (requires **`developer` role** and dev deployment)
- `dev.reset` — reset local dev state (requires **`developer` role** and dev deployment)
- `admin.users` — provision/manage users
- `logs.read` — merged log search

## Bootstrap admin (first startup)

When **no users exist**, the API creates one admin from environment variables on startup **if the server reaches bootstrap code** and `AUTH_BOOTSTRAP_ADMIN_EMAIL` is set to a real address (not `*@local.test`). If you have `auth_*` tables but **zero users**, run:

```bash
bash scripts/configure-dev-bootstrap-admin.sh YOUR_EMAIL@example.com
bash scripts/bootstrap-auth-admin.sh
```

See [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md) for every configure/sign-in/recovery step.

```bash
# Written to gitignored backend/.env by configure-dev-bootstrap-admin.sh:
AUTH_BOOTSTRAP_ADMIN_EMAIL=you@example.com
# Shared dev default in backend/.env.dev:
AUTH_BOOTSTRAP_ADMIN_PASSWORD=temp-admin-pswd
```

Change the password after first login in non-local environments. Full recovery flows: [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md).

## Sign in (UI)

1. Start the stack (see [windows_dev_startup_run_guide.md](windows_dev_startup_run_guide.md)).
2. Open the React UI (commonly `http://localhost:3001`).
3. Enter your configured admin email and temporary password `temp-admin-pswd` on **Sign in**.
4. The UI stores the JWT in `localStorage` and loads `/auth/me` for roles/permissions.

Use **Forgot password** to set a new password — see [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md).

## Sign in (API / curl)

From any machine that reaches the API (replace email and password with yours):

```bash
curl -sS -X POST "http://localhost:3000/auth/login" \
  -H "content-type: application/json" \
  -d '{"email":"you@example.com","password":"temp-admin-pswd"}'
```

Expected response shape:

```json
{
  "token": "<jwt>",
  "expiresIn": 43200,
  "user": {
    "id": 1,
    "email": "you@example.com",
    "roles": ["admin"],
    "permissions": ["reviews.read", "..."]
  }
}
```

Use the token on subsequent requests:

```bash
TOKEN="<paste token here>"

curl -sS "http://localhost:3000/auth/me" \
  -H "authorization: Bearer ${TOKEN}"

curl -sS "http://localhost:3000/reviews?limit=5&page=0" \
  -H "authorization: Bearer ${TOKEN}"
```

## Recover credentials (forgot password)

See [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md) for step-by-step UI and curl commands.

### UI

1. On the sign-in screen, click **Forgot password**.
2. Enter your account email and submit.
3. If SMTP is configured, check email for a reset link pointing to `/reset-password?token=...`.
4. In **dev without SMTP**, the API logs the reset URL (look for `dev password reset link` in backend container logs):

```bash
docker compose -f infra/docker/docker-compose.yml logs backend --tail 50 | grep "dev password reset link"
```

### API

Request reset (always returns the same message to avoid email enumeration):

```bash
curl -sS -X POST "http://localhost:3000/auth/forgot-password" \
  -H "content-type: application/json" \
  -d '{"email":"you@example.com"}'
```

Complete reset with token from email/logs:

```bash
curl -sS -X POST "http://localhost:3000/auth/reset-password" \
  -H "content-type: application/json" \
  -d '{"token":"<reset-token>","password":"NewSecurePass1"}'
```

Password must be at least **8 characters**.

## Admin user provisioning

Admins use the **Admin users** tab in the UI or the REST API.

### UI

1. Sign in as a user with the `admin` role.
2. Open **Admin users**.
3. Enter email, temporary password, select roles, click **Create user**.
4. Edit roles/active flag on existing users and click **Save**.

### API

List users:

```bash
curl -sS "http://localhost:3000/admin/users" \
  -H "authorization: Bearer ${TOKEN}"
```

Create user:

```bash
curl -sS -X POST "http://localhost:3000/admin/users" \
  -H "authorization: Bearer ${TOKEN}" \
  -H "content-type: application/json" \
  -d '{"email":"analyst@local.test","password":"AnalystPass1!","roles":["analyst"]}'
```

Update roles / active flag:

```bash
curl -sS -X PATCH "http://localhost:3000/admin/users/2" \
  -H "authorization: Bearer ${TOKEN}" \
  -H "content-type: application/json" \
  -d '{"roles":["developer","analyst"],"isActive":true}'
```

## Protected routes summary

| Route | Permission / rule |
|-------|-------------------|
| `GET /health` | public |
| `POST /auth/login`, `/auth/forgot-password`, `/auth/reset-password` | public |
| `GET /auth/me` | authenticated |
| `GET/POST /reviews`, `GET /reviews/:id` | `reviews.read` / `reviews.write` |
| `POST /reviews/:id/override` | `reviews.override` |
| `GET /metrics/*` | `metrics.read` |
| `GET /dev/features` | authenticated (returns flags for current user) |
| `GET/POST /dev/simulation`, `POST /dev/reset-local-state` | `dev.*` permission + **`developer` role** + dev deployment |
| `GET /admin/users`, `POST /admin/users`, `PATCH /admin/users/:id` | `admin.users` |
| `GET /logs/search` | `logs.read` |

## Environment variables

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Signs access tokens (**required**) |
| `JWT_TTL_HOURS` | Token lifetime (default `12`) |
| `AUTH_BOOTSTRAP_ADMIN_EMAIL` | First admin email when DB has zero users |
| `AUTH_BOOTSTRAP_ADMIN_PASSWORD` | First admin password |
| `AUTH_RESET_TOKEN_TTL_MINUTES` | Password reset link lifetime (default `60`) |
| `APP_PUBLIC_URL` | Base URL embedded in reset emails (default `http://localhost:3001`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Optional outbound email for password recovery |

See `backend/.env.dev` for local defaults.

## PostgreSQL tables (reference)

- `auth_users` — email, password hash, active flag
- `auth_roles`, `auth_permissions`, `auth_role_permissions`, `auth_user_roles`
- `auth_password_reset_tokens` — one-time reset tokens (hashed at rest)

## Troubleshooting

| Symptom | Check |
|---------|--------|
| `401 authentication_required` | Missing or expired `Authorization: Bearer` header |
| `403 forbidden` | User lacks permission for route |
| `403 developer_role_required` | Dev route needs `developer` role even if permission exists |
| `403 dev_only` | Route mutator called outside `DEPLOYMENT_ENV=dev` |
| Cannot sign in after fresh install | Use bootstrap admin credentials; confirm Postgres is up |
| Email in `auth_users` but login fails | Password is hashed — use forgot-password or [dev_auth_tables_reset_and_admin_recovery.md](dev_auth_tables_reset_and_admin_recovery.md) |
| No reset email in dev | Configure SMTP or read reset URL from API logs |

## Related docs

- [windows_dev_startup_run_guide.md](windows_dev_startup_run_guide.md) — run the stack after Windows 11 startup
- [dev_auth_tables_reset_and_admin_recovery.md](dev_auth_tables_reset_and_admin_recovery.md) — reset auth tables, set admin email/password, recover login
- [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md) — configure email, change/recover password
- `VERSIONS_BUILDS_AND_SIMULATION.md` — dev simulation (developer role)
- `env_configuration_guide.md` — broader environment variable reference
- `dbeaver_auth_tables_and_unified_log_viewing.md` — DBeaver refresh for auth tables; unified log UI (lnav, glogg, API search)
- `USER_GUIDE_BUSINESS.md` — non-technical product overview (sign-in now required)
