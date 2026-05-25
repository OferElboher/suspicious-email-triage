# Dev auth tables reset, admin email/password, and sign-in

This guide covers **every practical way** to recover from auth/login problems in **local dev** (`DEPLOYMENT_ENV=dev`): reset PostgreSQL auth data, set a desired admin **email** and **password**, start the API and UI, and verify sign-in.

**Scope:** WSL + Docker Compose dev stack. Staging/production use different procedures.

**Related (narrower topics):**

- [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md) — configure email at setup, forgot-password, provision users
- [dbeaver_auth_tables_and_unified_log_viewing.md](dbeaver_auth_tables_and_unified_log_viewing.md) — inspect `auth_*` in DBeaver, unified logs
- [windows_dev_startup_run_guide.md](windows_dev_startup_run_guide.md) — full startup after Windows 11 reboot

---

## Critical: email in DBeaver ≠ known password

PostgreSQL stores passwords as **bcrypt hashes** in `auth_users.password_hash`. You will **never** see the plain password in the database.

| What you see in DBeaver | What it means |
|-------------------------|---------------|
| Row in `auth_users` with your email | Account exists |
| Long string in `password_hash` | One-way hash — **not** the password |
| `is_active = true` | Account allowed to sign in |
| `is_active = false` | Sign-in blocked even with correct password |

**Common trap:** DBeaver shows `you@example.com` in `auth_users`, but sign-in fails with `invalid_credentials` because:

- the password was changed and you do not know the new one;
- the row was created with a different password than you expect (old default, manual SQL, etc.);
- `is_active` is `false`;
- you are typing the wrong email casing (API normalizes to lowercase — use lowercase in forms).

**Changing `AUTH_BOOTSTRAP_*` in `.env` does not change an existing row.** Bootstrap runs only when `auth_users` has **zero** rows.

The UI **Reset local databases & queues** button (`POST /dev/reset-local-state`) clears Mongo reviews, **chart statistics**, Redis, and Kafka — it does **not** delete or reset `auth_*` tables.

---

## Choose your path

```text
Can you sign in?
  |
  +-- YES → change password via Forgot password (Part 2A) or Admin users
  |
  +-- NO → Do you know the admin email shown in auth_users?
            |
            +-- YES → try Forgot password first (Part 2A)
            |         still stuck? → Part 3 (reset users + re-bootstrap)
            |
            +-- NO / want clean slate → Part 3 (reset auth users + re-bootstrap)
            |
            +-- broken roles/permissions → Part 4 (full auth data reset)
```

| Goal | Part |
|------|------|
| Keep users, reset only password | [2A](#part-2a--forgot-password-no-table-reset) or [2B](#part-2b--set-password-via-backend-node-one-liner) |
| Wipe all users, create one new admin | [3](#part-3--clear-users-and-re-bootstrap-recommended) |
| Wipe users + roles/permissions, re-seed | [4](#part-4--full-auth-data-reset-truncate) |
| Drop all auth tables, recreate schema | [5](#part-5--drop-auth-tables-and-recreate-schema) |
| Change email only (keep password) | [6](#part-6--change-admin-email-without-full-reset) |
| Start API + UI after fix | [7](#part-7--start-server-and-ui) |

All bash commands assume repository root: `~/suspicious-email-triage`.

---

## Part 1 — Prerequisites

### 1a — Docker and PostgreSQL running

After a Windows restart, complete [windows_docker_databases_start_and_verify.md](windows_docker_databases_start_and_verify.md) **Step 0a–0d** (start Docker Desktop, start containers).

Minimum:

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d postgres
docker compose -f infra/docker/docker-compose.yml exec postgres pg_isready -U triage -d triage_stats
```

**Expected:** `accepting connections`.

### 1b — Configure desired bootstrap email and password (before re-bootstrap)

Set the email and password you want for the **next** admin creation:

```bash
cd ~/suspicious-email-triage
bash scripts/configure-dev-bootstrap-admin.sh you@example.com
```

Default password written: **`temp-admin-pswd`**. To override:

```bash
AUTH_BOOTSTRAP_ADMIN_PASSWORD='MyNewAdminPass1' bash scripts/configure-dev-bootstrap-admin.sh you@example.com
```

Verify:

```bash
grep AUTH_BOOTSTRAP backend/.env
```

### 1c — Inspect current auth state (optional)

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres \
  psql -U triage -d triage_stats -c "
SELECT id, email, is_active, left(password_hash, 20) AS hash_prefix, created_at
FROM auth_users ORDER BY id;"
```

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres \
  psql -U triage -d triage_stats -c "\dt auth_*"
```

In DBeaver: connect to `triage_stats` → **public** → **Tables** → right-click **auth_users** → **View data**. You see **email**, not password.

---

## Part 2 — Recover without wiping auth tables

Use these when `auth_users` already has the correct email and you only need a new password.

### Part 2A — Forgot password (no table reset)

**Requires:** API/backend running.

**Step 1 — Start backend**

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d postgres mongo backend
docker compose -f infra/docker/docker-compose.yml logs backend --tail 20
```

**Expected:** line containing `listening on 3000`.

**Step 2 — Request reset (replace email)**

```bash
curl -sS -X POST "http://localhost:3000/auth/forgot-password" \
  -H "content-type: application/json" \
  -d '{"email":"you@example.com"}'
```

**Step 3 — Get reset URL from logs (dev, no SMTP)**

```bash
docker compose -f infra/docker/docker-compose.yml logs backend --tail 50 | grep "dev password reset link"
```

Copy the `resetUrl` value (or the `token=` query parameter).

**Step 4 — Set new password via API**

```bash
curl -sS -X POST "http://localhost:3000/auth/reset-password" \
  -H "content-type: application/json" \
  -d '{"token":"PASTE_TOKEN_HERE","password":"MyNewSecurePass1"}'
```

**Expected:** `{"ok":true,"message":"Password updated. You can sign in now."}`

**UI alternative:** open `http://localhost:3001` → **Forgot password** → submit email → open link from logs → enter new password.

### Part 2B — Set password via backend Node one-liner

**Use when:** forgot-password fails (API down, inactive user) but you want to **keep** the same email row.

**Step 1 — Start postgres + backend image**

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d postgres backend
```

**Step 2 — Set password (edit email and password in the script block)**

```bash
docker compose -f infra/docker/docker-compose.yml exec backend node -e "
const auth = require('./src/auth/authPg');
(async () => {
  const email = 'you@example.com';
  const newPassword = 'temp-admin-pswd';
  await auth.ensureAuthSchema();
  const users = await auth.listUsers();
  const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) {
    console.error('User not found:', email);
    process.exit(1);
  }
  await auth.updateUserPassword(user.id, newPassword);
  await auth.setUserActive(user.id, true);
  console.log('Password updated and user activated:', user.email);
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
"
```

**Step 3 — Verify login**

```bash
curl -sS -X POST "http://localhost:3000/auth/login" \
  -H "content-type: application/json" \
  -d '{"email":"you@example.com","password":"temp-admin-pswd"}' | python3 -m json.tool
```

---

## Part 3 — Clear users and re-bootstrap (recommended)

**Use when:** you want a **fresh admin** with email/password from `backend/.env`, and you do not need to keep other users.

**Effect:** deletes all users and password-reset tokens; **keeps** roles, permissions, and role mappings.

### Step 1 — Configure email/password

```bash
cd ~/suspicious-email-triage
bash scripts/configure-dev-bootstrap-admin.sh you@example.com
```

### Step 2 — Delete all auth users (WSL)

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres \
  psql -U triage -d triage_stats -c "
DELETE FROM auth_password_reset_tokens;
DELETE FROM auth_user_roles;
DELETE FROM auth_users;"
```

**DBeaver alternative:** open SQL editor on `triage_stats`, run the same three `DELETE` statements, click **Execute**.

### Step 3 — Confirm zero users

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres \
  psql -U triage -d triage_stats -c "SELECT COUNT(*) FROM auth_users;"
```

**Expected:** `0`.

### Step 4 — Bootstrap new admin

```bash
bash scripts/bootstrap-auth-admin.sh
```

**Expected:**

```text
Bootstrap admin created: you@example.com
Roles: admin
```

### Step 5 — Verify in PostgreSQL

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres \
  psql -U triage -d triage_stats -c "
SELECT u.email, array_agg(r.name) AS roles
FROM auth_users u
JOIN auth_user_roles ur ON ur.user_id = u.id
JOIN auth_roles r ON r.id = ur.role_id
GROUP BY u.email;"
```

Continue to [Part 7](#part-7--start-server-and-ui).

---

## Part 4 — Full auth data reset (TRUNCATE)

**Use when:** roles/permissions look wrong, or you want to re-seed RBAC from code defaults.

**Effect:** clears all auth **data** rows; table structures remain. Then re-seed roles and bootstrap admin.

### Step 1 — Configure email/password

```bash
bash scripts/configure-dev-bootstrap-admin.sh you@example.com
```

### Step 2 — Truncate auth tables (order respects foreign keys)

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres \
  psql -U triage -d triage_stats -c "
TRUNCATE TABLE
  auth_password_reset_tokens,
  auth_user_roles,
  auth_role_permissions,
  auth_users,
  auth_roles,
  auth_permissions
RESTART IDENTITY CASCADE;"
```

### Step 3 — Re-seed roles, permissions, and admin

```bash
bash scripts/bootstrap-auth-admin.sh
```

**Expected:** `Bootstrap admin created: you@example.com`.

Verify role seeding:

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres \
  psql -U triage -d triage_stats -c "SELECT name FROM auth_roles ORDER BY name;"
```

**Expected:** `admin`, `analyst`, `developer`, `manager`, `viewer`.

---

## Part 5 — Drop auth tables and recreate schema

**Use when:** truncate is insufficient (corrupt schema, manual DDL experiments). Most destructive **auth-only** reset short of wiping the whole Postgres volume.

### Step 1 — Configure email/password

```bash
bash scripts/configure-dev-bootstrap-admin.sh you@example.com
```

### Step 2 — Drop all auth tables

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres \
  psql -U triage -d triage_stats -c "
DROP TABLE IF EXISTS auth_password_reset_tokens CASCADE;
DROP TABLE IF EXISTS auth_user_roles CASCADE;
DROP TABLE IF EXISTS auth_role_permissions CASCADE;
DROP TABLE IF EXISTS auth_users CASCADE;
DROP TABLE IF EXISTS auth_roles CASCADE;
DROP TABLE IF EXISTS auth_permissions CASCADE;"
```

**Note:** `review_stats_events` (chart data) is **not** dropped.

### Step 3 — Recreate schema, seed, bootstrap

```bash
bash scripts/bootstrap-auth-admin.sh
```

The script runs `ensureAuthSchema()`, `seedRolesAndPermissions()`, and `bootstrapAdminUser()`.

Confirm tables exist:

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres \
  psql -U triage -d triage_stats -c "\dt auth_*"
```

Refresh DBeaver: select **Tables** → **F5**.

---

## Part 6 — Change admin email without full reset

### Option A — SQL update (keep existing password hash)

**Use when:** you know the current password and only need a new email address.

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres \
  psql -U triage -d triage_stats -c "
UPDATE auth_users SET email = 'newemail@example.com', updated_at = now()
WHERE email = 'oldemail@example.com';"
```

Sign in with `newemail@example.com` and your **existing** password.

### Option B — Re-bootstrap with new email (recommended if password unknown)

1. Complete [Part 3](#part-3--clear-users-and-re-bootstrap-recommended) with the new email in `configure-dev-bootstrap-admin.sh`.

---

## Part 7 — Start server and UI

### Step 1 — Start full dev stack (WSL, Terminal A)

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --build
```

Or foreground (logs visible):

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up --build
```

Wait for backend health:

```bash
curl -sS http://localhost:3000/health
```

### Step 2 — Start React UI (WSL, Terminal B)

```bash
cd ~/suspicious-email-triage
REACT_APP_API_URL=http://localhost:3000 PORT=3001 npm start --prefix frontend
```

### Step 3 — Sign in (Windows browser)

1. Open `http://localhost:3001`.
2. Email: value from `grep AUTH_BOOTSTRAP_ADMIN_EMAIL backend/.env`.
3. Password: `temp-admin-pswd` (or the password you set in `configure-dev-bootstrap-admin.sh`).
4. Click **Sign in**.

**Expected tabs:** Triage workspace, Analytics & graphs, Admin users.

### Step 4 — Final login verification (API)

```bash
curl -sS -X POST "http://localhost:3000/auth/login" \
  -H "content-type: application/json" \
  -d '{"email":"you@example.com","password":"temp-admin-pswd"}' | python3 -m json.tool
```

**Expected:** `"token"` and `"roles": ["admin"]`.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Email visible in DBeaver, login fails | Unknown/wrong password hash | [Part 2A](#part-2a--forgot-password-no-table-reset) or [Part 2B](#part-2b--set-password-via-backend-node-one-liner) or [Part 3](#part-3--clear-users-and-re-bootstrap-recommended) |
| `bootstrap skipped` / no new user | `auth_users` not empty | [Part 3](#part-3--clear-users-and-re-bootstrap-recommended) first |
| `bootstrap admin skipped — configure a real email` | Missing/invalid `AUTH_BOOTSTRAP_ADMIN_EMAIL` | `bash scripts/configure-dev-bootstrap-admin.sh you@example.com` |
| `invalid_credentials` | Wrong password, inactive user, or no row | Check `is_active`; see table above |
| Changed `.env` but login unchanged | Bootstrap does not update existing rows | [Part 3](#part-3--clear-users-and-re-bootstrap-recommended) |
| Used dev **Reset local databases** | Auth tables untouched by design | This guide — auth reset is separate |
| `curl` connection refused | Backend not up / Mongo down | [dbeaver_auth_tables_and_unified_log_viewing.md](dbeaver_auth_tables_and_unified_log_viewing.md) Step 1b |
| No `auth_*` in DBeaver | Schema not created | `bash scripts/bootstrap-auth-admin.sh`, then **F5** in DBeaver |

---

## Auth tables reference

| Table | Cleared by Part 3 | Cleared by Part 4 | Cleared by dev reset-local-state |
|-------|-------------------|-------------------|----------------------------------|
| `auth_users` | Yes | Yes | **No** |
| `auth_user_roles` | Yes | Yes | **No** |
| `auth_password_reset_tokens` | Yes | Yes | **No** |
| `auth_roles` | No | Yes | **No** |
| `auth_permissions` | No | Yes | **No** |
| `auth_role_permissions` | No | Yes | **No** |
| `review_stats_events` | No | No | **Yes** (truncated) |

---

## Related docs

- [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md) — day-to-day credential management
- [AUTHENTICATION_AND_RBAC.md](AUTHENTICATION_AND_RBAC.md) — roles, permissions, API routes
- [dbeaver_auth_tables_and_unified_log_viewing.md](dbeaver_auth_tables_and_unified_log_viewing.md) — DBeaver auth inspection
- [windows_dev_startup_run_guide.md](windows_dev_startup_run_guide.md) — routine startup after reboot
