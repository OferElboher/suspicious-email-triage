# Authentication & RBAC

This document describes how users sign in, recover credentials, call protected APIs, and how roles gate UI pages and HTTP routes.

## Overview

- **Users** are stored in PostgreSQL (`auth_users`) with email + bcrypt password hash. The plain password is **never** stored — seeing an email in DBeaver does not mean you can sign in. See [auth_guide_dev_auth_recovery.md](auth_guide_dev_auth_recovery.md).
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
- `dev.simulation` — simulation controls (requires **`admin` or `developer` role** and `DEPLOYMENT_ENV=dev`)
- `dev.reset` — reset local dev state, prune graph, requeue reviews (requires **`admin` or `developer` role** and dev deployment)
- `admin.users` — provision/manage users
- `logs.read` — merged log search

## Bootstrap admin (first startup)

When **no users exist**, the API creates one admin from environment variables on startup **if the server reaches bootstrap code** and `AUTH_BOOTSTRAP_ADMIN_EMAIL` is set to a real address (not `*@local.test`). If you have `auth_*` tables but **zero users**, run:

```bash
bash scripts/configure-dev-bootstrap-admin.sh YOUR_EMAIL@example.com
bash scripts/bootstrap-auth-admin.sh
```

See [auth_guide_dev_admin_credentials.md](auth_guide_dev_admin_credentials.md) for every configure/sign-in/recovery step.

```bash
# Written to gitignored backend/.env by configure-dev-bootstrap-admin.sh:
AUTH_BOOTSTRAP_ADMIN_EMAIL=you@example.com
# Shared dev default in backend/.env.dev:
AUTH_BOOTSTRAP_ADMIN_PASSWORD=temp-admin-pswd
```

Change the password after first login in non-local environments. Full recovery flows: [auth_guide_dev_admin_credentials.md](auth_guide_dev_admin_credentials.md).

## Sign in (UI)

1. Start the stack (see [stack_guide_windows_startup.md](stack_guide_windows_startup.md)).
2. Open the React UI (commonly `http://localhost:3001`).
3. Enter your configured admin email and temporary password `temp-admin-pswd` on **Sign in**.
4. The UI stores the JWT in `localStorage` and loads `/auth/me` for roles/permissions.

Use **Forgot password** to set a new password — see [auth_guide_dev_admin_credentials.md](auth_guide_dev_admin_credentials.md).

For a full list of ways to copy a JWT into `curl`, scripts, or Postman, see [auth_guide_obtain_jwt.md](auth_guide_obtain_jwt.md).

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

See [auth_guide_dev_admin_credentials.md](auth_guide_dev_admin_credentials.md) for step-by-step UI and curl commands.

### UI

1. On the sign-in screen, click **Forgot password**.
2. Enter your account email and submit.
3. If SMTP is configured, check email for a reset link pointing to `/reset-password?token=...`.
4. In **dev**, Mailpit catches outbound mail — open **`http://localhost:8025`**, or read API logs (`dev password reset link` includes `resetUrl=` on the console line).

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

Admins manage users in **Django admin** (not the React triage tabs). See [auth_guide_django_admin_users.md](auth_guide_django_admin_users.md) for step-by-step create, update, delete, and navigation between the triage app and admin UI.

Summary:

1. Sign in to the triage app with the **`admin` role**.
2. Click **User administration** (header) → `http://localhost:8000/admin/`.
3. Sign in with the same email/password.
4. Use **Users** to create, edit, or delete accounts (you cannot delete yourself).
5. Click **View site** in Django admin to return to the triage app.

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
| `GET/POST /dev/simulation`, `POST /dev/reset-local-state`, `POST /dev/prune-graph` | `dev.*` permission + **`admin` or `developer` role** + dev deployment |
| `GET /logs/search` | `logs.read` |

User CRUD is handled in **Django admin** (`/admin/` on port 8000 in dev), not Node REST routes. See [auth_guide_django_admin_users.md](auth_guide_django_admin_users.md).

## Environment variables

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Signs access tokens (**required**) |
| `JWT_TTL_HOURS` | Token lifetime (default `12`) |
| `AUTH_BOOTSTRAP_ADMIN_EMAIL` | First admin email when DB has zero users |
| `AUTH_BOOTSTRAP_ADMIN_PASSWORD` | First admin password |
| `AUTH_RESET_TOKEN_TTL_MINUTES` | Password reset link lifetime (default `60`) |
| `APP_PUBLIC_URL` | Base URL embedded in reset emails (default `http://localhost:3001`) |
| `SMTP_DELIVERY` | `mailpit` (local inbox) or `external` (real SMTP via `backend/.env`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | Outbound email (dev default: Mailpit at `mailpit:1025`, UI `:8025`) |

See `backend/.env.dev` for local defaults. For real inbox delivery in dev, see [auth_guide_dev_smtp_recovery.md](auth_guide_dev_smtp_recovery.md).

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
| Email in `auth_users` but login fails | Password is hashed — use forgot-password or [auth_guide_dev_auth_recovery.md](auth_guide_dev_auth_recovery.md) |
| No reset email in dev | Mailpit: `http://localhost:8025`; real SMTP: [auth_guide_dev_smtp_recovery.md](auth_guide_dev_smtp_recovery.md); or `bash scripts/reset-dev-admin-password.sh` |

## Related docs

- [stack_guide_windows_startup.md](stack_guide_windows_startup.md) — run the stack after Windows 11 startup
- [auth_guide_django_admin_users.md](auth_guide_django_admin_users.md) — Django admin user CRUD
- [ui_guide_analytics_charts.md](ui_guide_analytics_charts.md) — Analytics & graphs charts
- [auth_guide_dev_admin_credentials.md](auth_guide_dev_admin_credentials.md) — configure email, change/recover password
- `stack_guide_versions_builds.md` — dev simulation (admin or developer role)
- `tech_env_configuration.md` — broader environment variable reference
- `tech_postgresql_dbeaver_auth_logs.md` — DBeaver refresh for auth tables; unified log UI (lnav, glogg, API search)
- `biz_guide_user.md` — non-technical product overview (sign-in now required)
