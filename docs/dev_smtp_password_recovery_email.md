# Password recovery email — Mailpit (local) and real SMTP (external)

Forgot-password sends email through **nodemailer** (`backend/src/auth/email.js`). By default the dev stack delivers to **Mailpit**, a local inbox you open in the browser. You can switch to **real outbound SMTP** so reset links arrive in Gmail, Outlook, or your company mail server.

**Related:** [dev_admin_credentials_and_recovery.md](dev_admin_credentials_and_recovery.md), [AUTHENTICATION_AND_RBAC.md](AUTHENTICATION_AND_RBAC.md).

---

## How delivery mode is chosen

| `SMTP_DELIVERY` | Meaning | Typical use |
|-----------------|---------|-------------|
| `mailpit` (default in `backend/.env.dev`) | Send to the Mailpit container; read messages at `http://localhost:8025` | Zero-config local dev, automated integration tests |
| `external` | Send through a real SMTP provider using credentials in gitignored `backend/.env` | Testing with your actual inbox before staging/production |

Docker Compose loads `backend/.env.dev` first, then **`backend/.env`** (optional, gitignored). Values in `backend/.env` override the dev profile — that is where you put personal SMTP secrets.

---

## Option A — Mailpit (default, no setup)

Mailpit starts with the stack (`infra/docker/docker-compose.yml`):

| Service | Port | Purpose |
|---------|------|---------|
| SMTP | `1025` | Backend connects as `SMTP_HOST=mailpit` |
| Web UI | `8025` | Read captured messages |

1. Start stack including `backend` and `mailpit`.
2. In the triage UI, use **Forgot password** with an email that exists in `auth_users`.
3. Open `http://localhost:8025` and open the message; the body contains `reset-password?token=...`.

Integration test `integration_tests/test_password_reset_email.py` automates this path when Mailpit is running.

---

## Option B — Real email to your inbox

### Step 1 — Configure SMTP in `backend/.env`

**Gmail (app password recommended):**

```bash
cd ~/suspicious-email-triage
bash scripts/configure-dev-smtp.sh external smtp.gmail.com you@gmail.com 'your-16-char-app-password' you@gmail.com
```

**SendGrid or other provider:** use their SMTP hostname, username, and API key/password as the third argument.

The script sets:

- `SMTP_DELIVERY=external`
- `SMTP_HOST`, `SMTP_PORT=587`, `SMTP_SECURE=false`
- `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`

### Step 2 — Restart the backend

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d backend
```

Environment is read at process start; restart is required after changing `.env`.

### Step 3 — Trigger forgot-password

Use the UI **Forgot password** or:

```bash
curl -s -X POST http://localhost:3000/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com"}'
```

Check your real inbox (and spam). The link uses `APP_PUBLIC_URL` (default `http://localhost:3001`) plus `/reset-password?token=...`.

### Step 4 — Switch back to Mailpit anytime

```bash
bash scripts/configure-dev-smtp.sh mailpit
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d backend
```

---

## Troubleshooting

| Symptom | What to check |
|---------|----------------|
| `password reset email not sent (SMTP not configured)` in logs | External mode needs `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS`. Mailpit mode needs `SMTP_HOST`. |
| Gmail rejects login | Use an [App Password](https://support.google.com/accounts/answer/185833), not your main account password, with 2FA enabled. |
| Link opens wrong host | Set `APP_PUBLIC_URL` in `backend/.env` to the URL where the React app runs. |
| Still see Mailpit only | Confirm `grep SMTP backend/.env` shows `SMTP_DELIVERY=external` and restart `backend`. |

---

## Security notes

- Never commit `backend/.env` — it is gitignored.
- Use provider-specific app passwords or API keys, not primary account passwords.
- In production, configure SMTP through your deployment secrets manager, not this dev script.
