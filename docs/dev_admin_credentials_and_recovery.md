# Dev admin credentials: configure, sign in, change, and recover

This guide lists **every operation and command** for the **local dev** bootstrap admin account: choosing your email at setup, first login, changing password, recovering access, and provisioning other users.

**Locked out or email visible in DBeaver but login fails?** See [dev_auth_tables_reset_and_admin_recovery.md](dev_auth_tables_reset_and_admin_recovery.md) for full auth-table reset alternatives.

**Scope:** `DEPLOYMENT_ENV=dev` only. Staging and production use separate secrets and procedures.

---

## Summary table

| Item | Value / location |
|------|------------------|
| Bootstrap email | **You choose** — stored in gitignored `backend/.env` as `AUTH_BOOTSTRAP_ADMIN_EMAIL` |
| Bootstrap temporary password | `temp-admin-pswd` (`AUTH_BOOTSTRAP_ADMIN_PASSWORD` in `backend/.env.dev` and `backend/.env`) |
| Configure email (one-time or change before bootstrap) | `bash scripts/configure-dev-bootstrap-admin.sh YOUR_EMAIL@example.com` |
| Create admin when DB has zero users | `bash scripts/bootstrap-auth-admin.sh` |
| Reset auth tables + new admin | [dev_auth_tables_reset_and_admin_recovery.md](dev_auth_tables_reset_and_admin_recovery.md) |
| UI sign-in | `http://localhost:3001` (or the port CRA prints) |
| API base URL | `http://localhost:3000` |

---

## Part 1 — Choose your admin email at build / setup time

The old default `admin@local.test` is **not used**. That address cannot receive mail and blocks realistic password-recovery testing. You must supply a **real email you control** (Gmail, work mail, etc.).

### Operation 1a — Automatic prompt during dev build

When you run the recommended setup + build:

```bash
cd ~/suspicious-email-triage
bash scripts/setup-and-build-dev.sh
```

The script calls `configure-dev-bootstrap-admin.sh`, which **prompts**:

```text
Enter your real admin email for local dev bootstrap:
```

Type your email and press **Enter**.

**Expected output:**

```text
Configured bootstrap admin in backend/.env:
  AUTH_BOOTSTRAP_ADMIN_EMAIL=you@example.com
  AUTH_BOOTSTRAP_ADMIN_PASSWORD=temp-admin-pswd
```

### Operation 1b — Set email explicitly (non-interactive)

```bash
cd ~/suspicious-email-triage
bash scripts/configure-dev-bootstrap-admin.sh you@example.com
```

Or with an environment variable:

```bash
cd ~/suspicious-email-triage
AUTH_BOOTSTRAP_ADMIN_EMAIL=you@example.com bash scripts/configure-dev-bootstrap-admin.sh
```

### Operation 1c — Verify the file was written

```bash
grep AUTH_BOOTSTRAP backend/.env
```

**Expected:**

```text
AUTH_BOOTSTRAP_ADMIN_EMAIL=you@example.com
AUTH_BOOTSTRAP_ADMIN_PASSWORD=temp-admin-pswd
```

Docker Compose loads `backend/.env.dev` first, then optional gitignored `backend/.env`, so your email overrides the shared dev profile without committing personal data.

---

## Part 2 — Create the bootstrap admin (first time only)

Bootstrap runs **only when `auth_users` has zero rows**. It does **not** overwrite an existing admin.

### Operation 2a — Start postgres + backend, then bootstrap

```bash
cd ~/suspicious-email-triage
bash scripts/bootstrap-auth-admin.sh
```

**Expected output (first run):**

```text
Bootstrap admin created: you@example.com
Roles: admin
```

**Expected output (admin already exists):**

```text
Users already exist; bootstrap skipped. Existing: you@example.com
```

### Operation 2b — Verify in PostgreSQL (WSL)

```bash
cd ~/suspicious-email-triage
docker compose -f infra/docker/docker-compose.yml exec postgres \
  psql -U triage -d triage_stats -c "SELECT email FROM auth_users;"
```

**Expected:** one row with **your** email.

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres \
  psql -U triage -d triage_stats -c "
SELECT u.email, array_agg(r.name ORDER BY r.name) AS roles
FROM auth_users u
LEFT JOIN auth_user_roles ur ON ur.user_id = u.id
LEFT JOIN auth_roles r ON r.id = ur.role_id
GROUP BY u.email ORDER BY u.email;"
```

**Expected:** `you@example.com` | `{admin}`.

### Operation 2c — Verify login via API (WSL)

Replace `you@example.com` with your configured email:

```bash
curl -sS -X POST "http://localhost:3000/auth/login" \
  -H "content-type: application/json" \
  -d '{"email":"you@example.com","password":"temp-admin-pswd"}' | python3 -m json.tool
```

**Expected:** JSON containing `"token"` and `"user"` with `"roles": ["admin"]`.

If you see `curl: (7) Failed to connect`, start the backend:

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d backend
```

### Operation 2d — Verify login via UI (Windows browser)

1. Start the frontend (WSL):

```bash
cd ~/suspicious-email-triage
REACT_APP_API_URL=http://localhost:3000 PORT=3001 npm start --prefix frontend
```

2. Open `http://localhost:3001` in the browser.
3. Enter **your email** and password **`temp-admin-pswd`**.
4. Click **Sign in**.

**Expected:** Triage workspace, Analytics & graphs, and **Admin users** tabs visible.

---

## Part 3 — Change the admin password

Password must be **at least 8 characters**.

### Operation 3a — Change your own password via UI (recommended)

1. Sign out if already signed in.
2. On the sign-in screen, click **Forgot password**.
3. Enter **your admin email** and click **Send reset link**.
4. **Dev without SMTP:** read the reset URL from backend logs:

```bash
cd ~/suspicious-email-triage
docker compose -f infra/docker/docker-compose.yml logs backend | grep "dev password reset link"
```

**Expected log line** includes `resetUrl` like `http://localhost:3001/reset-password?token=...`

5. Open that URL in the browser (or copy the `token` query parameter).
6. Enter a new password (minimum 8 characters) and submit.

**Expected:** message that password was updated; sign in with the new password.

### Operation 3b — Change your own password via API (curl)

**Step 1 — Request reset token**

```bash
curl -sS -X POST "http://localhost:3000/auth/forgot-password" \
  -H "content-type: application/json" \
  -d '{"email":"you@example.com"}'
```

**Expected:**

```json
{"ok":true,"message":"If an account exists for that email, password reset instructions were sent."}
```

**Step 2 — Get token from logs (dev, no SMTP)**

```bash
docker compose -f infra/docker/docker-compose.yml logs backend --tail 50 | grep "dev password reset link"
```

Copy the `token=` value from `resetUrl`.

**Step 3 — Set new password**

```bash
curl -sS -X POST "http://localhost:3000/auth/reset-password" \
  -H "content-type: application/json" \
  -d '{"token":"PASTE_TOKEN_HERE","password":"MyNewSecurePass1"}'
```

**Expected:**

```json
{"ok":true,"message":"Password updated. You can sign in now."}
```

**Step 4 — Confirm login**

```bash
curl -sS -X POST "http://localhost:3000/auth/login" \
  -H "content-type: application/json" \
  -d '{"email":"you@example.com","password":"MyNewSecurePass1"}' | python3 -m json.tool
```

### Operation 3c — Dev with SMTP configured

If `SMTP_HOST`, `SMTP_USER`, etc. are set in `backend/.env`, the reset link is emailed instead of logged. Check your inbox for the message from `SMTP_FROM` (default in samples: `noreply@local.test`).

---

## Part 4 — Change the admin email address

Bootstrap email is fixed **after** the first user row is created. To change it:

### Operation 4a — Before any user exists (easiest)

1. Re-run configure with the new email:

```bash
cd ~/suspicious-email-triage
bash scripts/configure-dev-bootstrap-admin.sh newemail@example.com
```

2. Bootstrap:

```bash
bash scripts/bootstrap-auth-admin.sh
```

### Operation 4b — After admin already exists (SQL in DBeaver or psql)

1. Connect to PostgreSQL (`localhost:5432`, database `triage_stats`, user `triage`, password `triage`) — see [dbeaver_postgresql_windows_setup.md](dbeaver_postgresql_windows_setup.md).

2. Run (replace emails):

```sql
UPDATE auth_users
SET email = 'newemail@example.com'
WHERE email = 'oldemail@example.com';
```

3. Verify:

```bash
docker compose -f infra/docker/docker-compose.yml exec postgres \
  psql -U triage -d triage_stats -c "SELECT id, email FROM auth_users ORDER BY id;"
```

4. Sign in with `newemail@example.com` and your current password.

### Operation 4c — Alternative: add a second admin, retire the old one

1. Sign in as admin → **Admin users**.
2. Create a new user with role **`admin`** and a temporary password.
3. Sign in as the new admin.
4. Deactivate or remove the old account via **Admin users** (toggle active / adjust roles), or run SQL:

```sql
UPDATE auth_users SET is_active = false WHERE email = 'oldemail@example.com';
```

---

## Part 5 — Recover access when you forgot the password

Use the same flow as [Part 3](#part-3--change-the-admin-password).

| Method | Steps |
|--------|-------|
| **UI** | Sign-in → **Forgot password** → email → reset link from logs or SMTP → new password |
| **API** | `POST /auth/forgot-password` → read token from logs → `POST /auth/reset-password` |
| **Another admin** | Ask a colleague with `admin` role to create a new admin account in **Admin users** |

There is **no** “admin reset other user’s password” button in the UI today. Admins create users with a temporary password; users change it via forgot-password, or you update via SQL:

```sql
-- Last resort: requires generating a bcrypt hash externally — prefer forgot-password flow.
-- See AUTHENTICATION_AND_RBAC.md for supported API routes.
```

---

## Part 6 — Provision additional users (admin)

### Operation 6a — Via UI

1. Sign in as a user with the **`admin`** role.
2. Open **Admin users**.
3. Enter email, temporary password (min 8 chars), select roles, click **Create user**.
4. Tell the user to sign in and use **Forgot password** to set their own password (recommended).

### Operation 6b — Via API

**Step 1 — Login as admin and save token**

```bash
TOKEN=$(curl -sS -X POST "http://localhost:3000/auth/login" \
  -H "content-type: application/json" \
  -d '{"email":"you@example.com","password":"YOUR_CURRENT_PASSWORD"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
echo "Token length: ${#TOKEN}"
```

**Step 2 — Create user**

```bash
curl -sS -X POST "http://localhost:3000/admin/users" \
  -H "authorization: Bearer ${TOKEN}" \
  -H "content-type: application/json" \
  -d '{"email":"analyst@example.com","password":"AnalystPass1!","roles":["analyst"]}' | python3 -m json.tool
```

**Expected:** `"user"` object with the new email.

**Step 3 — List users**

```bash
curl -sS "http://localhost:3000/admin/users" \
  -H "authorization: Bearer ${TOKEN}" | python3 -m json.tool
```

---

## Part 7 — Environment variables reference

| Variable | Purpose | Dev default |
|----------|---------|-------------|
| `AUTH_BOOTSTRAP_ADMIN_EMAIL` | First admin email when `auth_users` is empty | **Unset in `.env.dev`** — you set in `backend/.env` |
| `AUTH_BOOTSTRAP_ADMIN_PASSWORD` | First admin temporary password | `temp-admin-pswd` |
| `APP_PUBLIC_URL` | Base URL in reset links | `http://localhost:3001` |
| `AUTH_RESET_TOKEN_TTL_MINUTES` | Reset link lifetime | `60` |
| `SMTP_*` | Optional outbound email for reset links | Unset in dev (links logged instead) |

See also [env_configuration_guide.md](env_configuration_guide.md) and [AUTHENTICATION_AND_RBAC.md](AUTHENTICATION_AND_RBAC.md).

---

## Related docs

- [dev_auth_tables_reset_and_admin_recovery.md](dev_auth_tables_reset_and_admin_recovery.md) — reset auth tables, fix login when email exists but password unknown
- [windows_dev_startup_run_guide.md](windows_dev_startup_run_guide.md) — full startup after Windows reboot
- [windows_docker_databases_start_and_verify.md](windows_docker_databases_start_and_verify.md) — Docker Desktop + database containers
- [dbeaver_auth_tables_and_unified_log_viewing.md](dbeaver_auth_tables_and_unified_log_viewing.md) — inspect `auth_*` tables in DBeaver
- [AUTHENTICATION_AND_RBAC.md](AUTHENTICATION_AND_RBAC.md) — roles, permissions, route matrix
