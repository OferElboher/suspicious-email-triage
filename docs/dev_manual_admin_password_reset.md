# Manual admin password reset (dev workstation)

Use this when you know the admin **email** but need a new password without email/SMTP, forgot-password tokens, or Django admin.

**Related:** [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md), [django_admin_user_management.md](django_admin_user_management.md), [dev_auth_tables_reset_and_admin_recovery.md](dev_auth_tables_reset_and_admin_recovery.md).

---

## Option A — Script (recommended)

From the repository root (WSL):

```bash
cd ~/suspicious-email-triage
bash scripts/reset-dev-admin-password.sh YOUR_EMAIL@example.com 'NewSecurePass1'
```

Requirements:

- Docker stack running (`postgres` + `backend` — the script starts them if needed)
- Password **at least 8 characters**
- User row must exist in `auth_users` (see bootstrap below if empty)

Sign in at `http://localhost:3001` with the new password.

---

## Option B — Django admin

If you can still sign in as **another** admin:

1. Open **User administration** → **Users** → click the user.
2. Enter a new **Password** → **Save**.

See [django_admin_user_management.md](django_admin_user_management.md).

---

## Option C — Forgot-password + Mailpit (dev email)

When **Mailpit** is running (default dev Compose stack):

1. Sign-in screen → **Forgot password** → enter email → **Send reset link**.
2. Open Mailpit UI: `http://localhost:8025` → open the message → click the reset link.
3. Set a new password on `/reset-password?token=...`.

See [AUTHENTICATION_AND_RBAC.md](AUTHENTICATION_AND_RBAC.md#password-recovery).

---

## Option D — API + Mailpit or logs

```bash
curl -sS -X POST "http://localhost:3000/auth/forgot-password" \
  -H "content-type: application/json" \
  -d '{"email":"YOUR_EMAIL@example.com"}'
```

Then check Mailpit (`http://localhost:8025`) or merged logs for the reset URL.

---

## If no user exists

```bash
bash scripts/configure-dev-bootstrap-admin.sh YOUR_EMAIL@example.com
bash scripts/bootstrap-auth-admin.sh
bash scripts/reset-dev-admin-password.sh YOUR_EMAIL@example.com 'temp-admin-pswd'
```

---

## Security note

These shortcuts are for **local dev only**. Staging/production must use normal recovery flows and secrets management.
