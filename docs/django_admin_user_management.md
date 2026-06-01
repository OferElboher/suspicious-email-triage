# Django admin user management (local dev)

User accounts for the Suspicious Email Triage app live in PostgreSQL (`auth_users`, `auth_roles`, …). **User administration uses Django Admin**, not a custom React screen. Only users with the **`admin` role** may access it.

**Related:** [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md) (bootstrap email/password), [AUTHENTICATION_AND_RBAC.md](AUTHENTICATION_AND_RBAC.md) (roles & permissions).

---

## Architecture

| Component | URL (dev) | Purpose |
|-----------|-----------|---------|
| React triage app | `http://localhost:3001` | Triage, analytics, simulation |
| Node API | `http://localhost:3000` | JWT auth, reviews, metrics |
| **Django admin** | `http://localhost:8000/admin/` | Create / update / delete users & roles |

Django admin reads and writes the **same** PostgreSQL tables as the Node API (`auth_users`, `auth_user_roles`, …). Passwords are **bcrypt** hashes compatible with Node login.

### Two stores (no duplicate auth in Postgres)

| Database | Used for |
|----------|----------|
| **PostgreSQL** `triage_stats` | Node/triage data: `auth_users`, `auth_roles`, `auth_permissions`, `review_stats_events`, … |
| **SQLite** (inside `django-admin` container) | Django sessions and unused contrib.auth internals |

Django’s built-in **admin audit log** (`django_admin_log`) is **not used** for triage user changes. The signed-in operator is a `TriageUser` row in PostgreSQL, but `LogEntry.user_id` expects a row in SQLite `auth_user`. Writing an audit row after a password save caused `IntegrityError: FOREIGN KEY constraint failed`. All triage auth ModelAdmin classes mix in `TriageAdminLoggingMixin`, which no-ops `log_addition`, `log_change`, and `log_deletion` (see `backend/triage_auth/admin_logging.py`).

The admin UI lists **Triage accounts → Users / Roles** only. If you still see **Authentication and Authorization → Users / Groups** in DBeaver **and** extra tables like `auth_user` (singular) in Postgres, run once:

```bash
bash scripts/cleanup-postgres-django-auth-tables.sh
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --build django-admin
```

Pre-push tests verify this layout when the stack is running — see [pre_push_tests_and_stack_verification.md](pre_push_tests_and_stack_verification.md).

### What appears in Django admin

| Admin section | PostgreSQL table | What you can do |
|---------------|------------------|-----------------|
| **Users** | `auth_users` + `auth_user_roles` | Create, edit, delete users; assign roles (**checkbox list on the user form** — not inline rows) |
| **Roles** | `auth_roles` + `auth_role_permissions` | **View only** — name, description, and permission codes listed on the role detail page |
| **Permissions** | `auth_permissions` | **View only** — codes are seeded by the Node API (`constants.js`) |
| **Password reset tokens** | `auth_password_reset_tokens` | **View only** — created/consumed by forgot-password flow |

Junction tables `auth_user_roles` and `auth_role_permissions` use **composite primary keys** `(user_id, role_id)` and `(role_id, permission_id)` — they have **no** `id` column. The Django models must match that schema (see `CompositePrimaryKey` in `backend/triage_auth/models.py`).

---

## Step 1 — Start the stack including Django admin

The **`django-admin`** service must be running and healthy before **User administration** works. It is included automatically when you start the full stack:

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up --build
```

If you start services selectively, **always include `django-admin`**:

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d postgres mongo backend django-admin
```

After the first deploy or code update, rebuild the admin image:

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --build django-admin
```

Wait for Django:

```bash
docker compose -f infra/docker/docker-compose.yml logs django-admin --tail 20
```

**Expected:** `Starting development server at http://0.0.0.0:8000/` (or `Watching for file changes with StatReloader` after migrations).

Verify from WSL (should print `HTTP 200`):

```bash
curl -sS -o /dev/null -w 'HTTP %{http_code}\n' http://localhost:8000/admin/login/
```

If the container status is **Restarting** instead of **Up**, read the logs — a common cause is an outdated image. Run the `--build django-admin` command above.

Start the React UI (separate terminal):

```bash
PORT=3001 npm start --prefix frontend
```

---

## Step 2 — Sign in to the triage app as admin

1. Open `http://localhost:3001`
2. Sign in with your admin email and password — see [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md)

Only users with the **`admin` role** see the **User administration** button (top right, next to Sign out).

---

## Step 3 — Open Django admin

### Option A — From the triage app (recommended)

1. Click **User administration** in the triage header toolbar.
2. A new browser tab opens `http://localhost:8000/admin/`.

### Option B — Direct URL

Open `http://localhost:8000/admin/` in the browser.

### Sign in to Django admin

Use the **same email and password** as the triage app. Django admin only accepts users who have the **`admin` role**.

---

## Step 4 — Return to the triage app

In Django admin, click **View site** (top right). It opens the React app at `APP_PUBLIC_URL` (`http://localhost:3001` in dev).

You can keep both tabs open and switch between them.

---

## Watch users (list & detail)

1. In Django admin, open **Users**.
2. The list shows **email**, **active**, **roles**, **updated**.
3. Click an email to open the detail form.

To inspect roles and permissions in DBeaver instead, see [dbeaver_auth_tables_and_unified_log_viewing.md](dbeaver_auth_tables_and_unified_log_viewing.md).

---

## Create a user

1. **Users** → **Add user** (top right).
2. Fill in:
   - **Email** — required; stored lowercase.
   - **Password** — required for new users (minimum 8 characters).
   - **Is active** — checked for normal access.
3. Under **Roles**, check one or more roles (`admin`, `analyst`, `manager`, `developer`, `viewer`).
4. Click **Save**.

The new user can sign in to `http://localhost:3001` immediately with the password you set.

---

## Update a user

1. **Users** → click the user's email.
2. Edit any field:
   - **Email**
   - **Is active** — uncheck to block sign-in without deleting the row.
   - **Password** — leave blank to keep the current hash; enter a new value to reset.
3. Under **Roles**, check or uncheck roles as needed.
4. Click **Save**.

---

## Delete a user

1. **Users** → select one or more rows (checkboxes).
2. Action dropdown → **Delete selected users** → **Go**.
3. Confirm.

**Protection:** You **cannot delete your own account** while signed in. The admin performing the delete must use another admin account to remove themselves, or use SQL (see [dev_auth_tables_reset_and_admin_recovery.md](dev_auth_tables_reset_and_admin_recovery.md)).

---

## Manage roles (reference)

Roles are seeded by the Node API (`admin`, `analyst`, `manager`, `developer`, `viewer`). In Django admin, open **Roles** to view names and descriptions.

Do not delete roles that are still assigned to users. Edit **Roles** on each user instead.

Permission codes (`reviews.read`, `metrics.read`, …) are defined in Node (`backend/src/auth/constants.js`) and mapped to roles at API startup. Django admin manages **role assignment**, not individual permission codes.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| **User administration** button missing | Signed-in user must have **`admin` role** (not only analyst/developer). |
| Django admin login fails | Same credentials as triage app; confirm `admin` role in DBeaver: `auth_user_roles`. |
| `Connection refused` / `ERR_CONNECTION_REFUSED` on port 8000 | **`django-admin` is not running.** Check `docker compose -f infra/docker/docker-compose.yml ps django-admin` — status must be **Up**, not **Restarting** or missing. Start or rebuild: `DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --build django-admin`. Then verify with `curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:8000/admin/login/` → `200`. |
| `django-admin` container **Restarting** | Read logs: `docker compose -f infra/docker/docker-compose.yml logs django-admin --tail 50`. Rebuild the image after pulling latest code: `up -d --build django-admin`. |
| Login page error mentioning **`last_login`** | Pull latest code and rebuild `django-admin` — the app disables Django's last-login update because `auth_users` has no such column. |
| Password works in Django but not triage (or vice versa) | Re-save password in Django admin (bcrypt) or use forgot-password flow. |
| Cannot delete a user | You may be trying to delete yourself; use another admin or SQL. |
| Duplicate **Users/Groups** in admin or `auth_user` table in DBeaver | Old Django migrations in Postgres — run `scripts/cleanup-postgres-django-auth-tables.sh` and rebuild `django-admin`. |
| **`auth_user_roles.id does not exist`** when opening a user | Rebuild `django-admin` after pull — junction models must use `CompositePrimaryKey`, not a surrogate `id`. |
| **`JSONDecodeError`** / `Expecting value` on save (password or roles) | Same root cause: admin inlines cannot POST composite PKs. Pull latest — roles are a **checkbox list** on the user form instead of inline rows. |

---

## Environment variables

| Variable | Default (dev) | Purpose |
|----------|---------------|---------|
| `APP_PUBLIC_URL` | `http://localhost:3001` | Django **View site** link → triage app |
| `DJANGO_ADMIN_PUBLIC_URL` | `http://localhost:8000/admin/` | Documented admin URL |
| `REACT_APP_DJANGO_ADMIN_URL` | `http://localhost:8000/admin/` | React **User administration** button target |

Set in `backend/.env.dev` and `frontend/.env.development`.

---

## Related docs

- [windows_dev_startup_run_guide.md](windows_dev_startup_run_guide.md) — full startup after Windows reboot
- [analytics_and_graphs_guide.md](analytics_and_graphs_guide.md) — Analytics & graphs page
- [pre_push_tests_and_stack_verification.md](pre_push_tests_and_stack_verification.md) — pre-push / integration tests
