# Password recovery email — Mailpit (local) and real SMTP (external)

Forgot-password sends email through **nodemailer** (`backend/src/auth/email.js`), a Node.js library that speaks SMTP — the standard protocol mail servers use to accept outbound messages. By default the dev stack delivers to **Mailpit**, a local fake mail server with a web inbox. You can switch to **real outbound SMTP** so reset links arrive in Gmail, Outlook, or your company mail server.

**Related:** [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md), [AUTHENTICATION_AND_RBAC.md](AUTHENTICATION_AND_RBAC.md).

---

## Important: two different passwords

Many developers confuse these — they are **not** interchangeable:

| Password | Used for | Example |
|----------|----------|---------|
| **Triage app password** | Signing in at `http://localhost:3001`, Django admin | `temp-admin-pswd` (dev bootstrap) |
| **SMTP / Gmail App Password** | Authenticating to `smtp.gmail.com` when *sending* email | 16-character code from Google (e.g. `abcd efgh ijkl mnop`) |

If you run:

```bash
bash scripts/configure-dev-smtp.sh external smtp.gmail.com you@gmail.com 'temp-admin-pswd' you@gmail.com
```

Gmail will reject the login (`535 BadCredentials`). The script now **blocks** that mistake when the host is Gmail.

The forgot-password API **always returns HTTP 200** with a generic message (security best practice — it does not reveal whether an account exists). When SMTP fails, the backend logs the error and, in dev, prints the reset link to the console/logs so you can still test the flow.

---

## How delivery mode is chosen

| `SMTP_DELIVERY` | Technology | Typical use |
|-----------------|------------|-------------|
| `mailpit` (default in `backend/.env.dev`) | [Mailpit](https://github.com/axllent/mailpit) SMTP sink | Zero-config local dev, automated integration tests |
| `external` | Real SMTP provider (Gmail, SendGrid, SES, …) | Deliver to your real inbox |

Docker Compose loads `backend/.env.dev` first, then **`backend/.env`** (gitignored). Overrides in `backend/.env` win. **Recreate** the backend container after changing `.env` — env vars are injected at container creation, not on every `docker compose up -d`:

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --force-recreate backend
```

---

## Option A — Mailpit (default)

Mailpit is defined in `infra/docker/docker-compose.yml`:

| Port | Protocol | Purpose |
|------|----------|---------|
| `1025` | SMTP | Backend connects with `SMTP_HOST=mailpit` |
| `8025` | HTTP | Web UI to read captured messages |

Flow:

1. User submits forgot-password in the UI or `POST /auth/forgot-password`.
2. Node creates a hashed token row in PostgreSQL `auth_password_reset_tokens`.
3. nodemailer sends SMTP to Mailpit (no TLS, no auth in dev).
4. Open `http://localhost:8025` → message contains `reset-password?token=...`.

Integration test: `integration_tests/test_password_reset_email.py`.

---

## Option B — Real email (Gmail example)

### Step 1 — Create a Gmail App Password

1. Enable [2-Step Verification](https://myaccount.google.com/security) on your Google account.
2. Open [App passwords](https://myaccount.google.com/apppasswords).
3. Create an app password for “Mail” / “Other (Triage dev)”.
4. Copy the **16-character** password (spaces optional).

### Step 2 — Configure `backend/.env`

```bash
cd ~/suspicious-email-triage
bash scripts/configure-dev-smtp.sh external smtp.gmail.com ofer.elboher@gmail.com 'xxxx-xxxx-xxxx-xxxx' ofer.elboher@gmail.com
```

This sets:

- `SMTP_DELIVERY=external`
- `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false` (STARTTLS — nodemailer `requireTLS`)
- `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

### Step 3 — Recreate backend

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --force-recreate backend
```

### Step 4 — Trigger forgot-password

```bash
curl -s -X POST http://localhost:3000/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"ofer.elboher@gmail.com"}'
```

**Expected response (always):**

```json
{"ok":true,"message":"If an account exists for that email, password reset instructions were sent."}
```

Check your Gmail inbox. If SMTP still fails, read backend logs — they include `hint=` explaining App Password vs triage password:

```bash
docker compose -f infra/docker/docker-compose.yml logs backend --tail 20
```

In dev, the reset URL is also logged when email delivery fails so you can complete the flow without mail.

### Step 5 — Switch back to Mailpit

```bash
bash scripts/configure-dev-smtp.sh mailpit
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --force-recreate backend
```

---

## Implementation notes (patterns)

| Pattern | Where | Why |
|---------|-------|-----|
| **No enumeration** | `backend/src/api/auth.js` | Same JSON response whether or not the email exists |
| **SMTP errors swallowed at transport layer** | `backend/src/auth/email.js` | `sendMail` failures return `{ delivered: false }` instead of throwing |
| **Dev reset URL fallback** | auth route + logger | Log `resetUrl` when Mailpit/external send fails |
| **STARTTLS on port 587** | `buildTransport()` | Gmail and most providers expect TLS upgrade, not `secure: true` on 587 |

---

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| `{"error":"forgot_password_failed"}` (older builds) | SMTP threw before fix — upgrade and retry; should now get `ok: true` |
| Logs show `535 BadCredentials` | Use Gmail **App Password**, not `temp-admin-pswd` |
| Env changes ignored | Run `--force-recreate backend`, not just `up -d` |
| Link opens wrong host | Set `APP_PUBLIC_URL` in `backend/.env` |

---

## Security

- Never commit `backend/.env`.
- Use provider app passwords or API keys, not primary account passwords.
- Production SMTP belongs in your secrets manager, not this dev script.
