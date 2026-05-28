# Password recovery email — Mailpit, Google OAuth, or legacy SMTP

Forgot-password sends email through `backend/src/auth/email.js`.

**Related:** [google_oauth_email_and_signin.md](google_oauth_email_and_signin.md), [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md), [AUTHENTICATION_AND_RBAC.md](AUTHENTICATION_AND_RBAC.md), [running_tests_guide.md](running_tests_guide.md).

---

## No email in Mailpit? (most common fix)

If you click **Forgot password** but **http://localhost:8025** stays empty, the backend is almost certainly **not** in Mailpit mode.

### Why this happens

Docker Compose loads env files in this order:

1. `backend/.env.dev` — defaults (`EMAIL_DELIVERY=mailpit`, `SMTP_HOST=mailpit`)
2. **`backend/.env`** (gitignored) — **wins** if present

If you previously ran `configure-dev-smtp.sh external` or tested Gmail OAuth, your `backend/.env` may still have:

```bash
SMTP_DELIVERY=external
SMTP_HOST=smtp.gmail.com
```

In that case email goes to Gmail SMTP (and fails with bad credentials) — **nothing** reaches Mailpit.

### Fix in three commands

```bash
cd ~/suspicious-email-triage
bash scripts/configure-dev-smtp.sh mailpit
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --force-recreate backend
```

### Verify the running container

```bash
docker compose -f infra/docker/docker-compose.yml exec backend printenv EMAIL_DELIVERY SMTP_DELIVERY SMTP_HOST
```

**Expected for Mailpit:**

```text
mailpit
mailpit
mailpit
```

If you see `external` or `google_oauth`, run the fix above again.

### Test forgot-password

1. Ensure **mailpit** and **backend** containers are running.
2. In the UI, use an email that exists in `auth_users` (your bootstrap admin email).
3. Open `http://localhost:8025` — you should see the reset message within a few seconds.

The API always returns HTTP 200 even when delivery fails; check backend logs if Mailpit is still empty:

```bash
docker compose -f infra/docker/docker-compose.yml logs backend --tail 30 | grep -i auth
```

In dev, failed delivery still logs `resetUrl=` so you can complete the flow without mail.

---

## Delivery modes (choose one)

| Mode | Best for | Setup |
|------|----------|-------|
| **Mailpit** (default) | Local dev, zero config | `bash scripts/configure-dev-smtp.sh mailpit` + recreate backend |
| **Google OAuth** | Real Gmail without App Passwords | [google_oauth_email_and_signin.md](google_oauth_email_and_signin.md) |
| **Legacy SMTP** | SendGrid / corporate SMTP | `configure-dev-smtp.sh external` (not recommended for Gmail) |

---

## How delivery mode is chosen

The backend reads **`EMAIL_DELIVERY`** first, then legacy **`SMTP_DELIVERY`**.

| Value | Behavior |
|-------|----------|
| `mailpit` | SMTP to container `mailpit:1025` → web UI `:8025` |
| `google_oauth` | Gmail REST API with OAuth refresh token |
| `external` | nodemailer SMTP with `SMTP_USER` / `SMTP_PASS` |

**After any change to `backend/.env`, recreate the backend container** (env is injected at create time, not on every `up -d`):

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --force-recreate backend
```

---

## Option A — Mailpit (default, recommended for local dev)

Mailpit is defined in `infra/docker/docker-compose.yml`:

| Port | Purpose |
|------|---------|
| `1025` | SMTP (backend uses `SMTP_HOST=mailpit`) |
| `8025` | Web inbox UI |

Required config (in `.env.dev` or after `configure-dev-smtp.sh mailpit`):

```bash
EMAIL_DELIVERY=mailpit
SMTP_HOST=mailpit
SMTP_PORT=1025
SMTP_FROM=noreply@local.test
```

Automated test (when stack + Mailpit are up): `integration_tests/test_password_reset_email.py`.

---

## Option B — Google OAuth (real Gmail, no App Password)

See [google_oauth_email_and_signin.md](google_oauth_email_and_signin.md).

---

## Option C — Legacy external SMTP

Only for non-Gmail providers with username/password. For Gmail, use OAuth (Option B).

---

## Troubleshooting

| Symptom | Cause / fix |
|---------|-------------|
| Empty Mailpit inbox | `backend/.env` overrides to `external` — run `configure-dev-smtp.sh mailpit` + `--force-recreate backend` |
| Env changes ignored | Must use `--force-recreate backend`, not only `up -d` |
| `535 BadCredentials` in logs | External Gmail with wrong password — switch to Mailpit or Google OAuth |
| Forgot-password OK but no mail | Email not in `auth_users`, or wrong delivery mode — verify `printenv` above |
| Link opens wrong host | Set `APP_PUBLIC_URL=http://localhost:3001` in `backend/.env` |

---

## Security

- Never commit `backend/.env`.
- Production secrets belong in a secrets manager, not local scripts.
