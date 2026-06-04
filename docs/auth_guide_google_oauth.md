# Google OAuth — Sign in with Google (login + password-reset email)

Google now discourages **App Passwords** for most accounts. This project supports **OAuth 2.0** instead: you sign in with Google once during setup, and the app stores a **refresh token** in gitignored `backend/.env` — no SMTP password in config files.

**Related:** [auth_guide_dev_smtp_recovery.md](auth_guide_dev_smtp_recovery.md), [auth_guide_rbac.md](auth_guide_rbac.md), [auth_guide_dev_admin_credentials.md](auth_guide_dev_admin_credentials.md).

---

## Two OAuth features (same Google Cloud client)

| Feature | Env flag | Google scope | Purpose |
|---------|----------|--------------|---------|
| **Password-reset email** | `EMAIL_DELIVERY=google_oauth` | `gmail.send` | Send reset links via **Gmail API** (not SMTP) |
| **App login button** | `GOOGLE_LOGIN_ENABLED=true` | `openid email profile` | **Sign in with Google** → JWT for triage UI |

Both use the same `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`. You run separate setup commands for each mode.

**Default dev (zero Google setup):** `EMAIL_DELIVERY=mailpit` — reset links appear at `http://localhost:8025`.

---

## Part 1 — One-time Google Cloud Console setup

1. Open [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials.
2. Create **OAuth 2.0 Client ID** (type: **Desktop app** or **Web application**).
3. Add **Authorized redirect URIs**:
   - `http://localhost:3333/oauth/callback` — used by the setup script (token exchange).
   - `http://localhost:3000/auth/google/callback` — used by **Sign in with Google** in the running API.
4. Enable **Gmail API** for the project (APIs & Services → Library → Gmail API → Enable).

Copy the **Client ID** and **Client secret** — you will paste them into the configure script.

---

## Part 2 — Send password-reset email via Gmail API (no App Password)

```bash
cd ~/suspicious-email-triage
bash scripts/configure-dev-google-oauth.sh email \
  YOUR_CLIENT_ID.apps.googleusercontent.com \
  YOUR_CLIENT_SECRET \
  ofer.elboher@gmail.com
```

What happens:

1. A local listener starts on port **3333**.
2. Your browser opens **Sign in with Google** consent for scope **Gmail send**.
3. The script writes `GOOGLE_OAUTH_REFRESH_TOKEN` and `EMAIL_DELIVERY=google_oauth` into `backend/.env`.

Recreate the backend (env is read at container create time):

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --force-recreate backend
```

Test forgot-password:

```bash
curl -s -X POST http://localhost:3000/auth/forgot-password \
  -H 'Content-Type: application/json' \
  -d '{"email":"ofer.elboher@gmail.com"}'
```

Check your Gmail inbox. The API always returns HTTP 200; see backend logs if delivery fails.

**Implementation:** `backend/src/auth/gmailApi.js` refreshes an access token and calls `POST https://gmail.googleapis.com/gmail/v1/users/me/messages/send`.

---

## Part 3 — Sign in with Google (app login)

Your Google account must already exist as a row in `auth_users` (bootstrap admin or Django admin user create).

```bash
bash scripts/configure-dev-google-oauth.sh login \
  YOUR_CLIENT_ID.apps.googleusercontent.com \
  YOUR_CLIENT_SECRET
```

Then recreate backend and open the UI login screen — click **Sign in with Google**, or visit:

`http://localhost:3000/auth/google/start`

**Flow:**

1. Browser → Google consent (openid, email, profile).
2. Google redirects to `GET /auth/google/callback` on the API.
3. API maps Google email → `auth_users` → issues JWT.
4. Redirect to React app with `?googleToken=...` (stored in localStorage).

**Implementation:** `backend/src/auth/googleLogin.js`, routes in `backend/src/api/auth.js`, UI button in `frontend/src/views/AuthViews.jsx`.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `redirect_uri_mismatch` | Add exact URIs from Part 1 in Google Cloud Console |
| `google_user_not_provisioned` | Create the user in Django admin with the same Gmail address |
| Env changes ignored | `docker compose up -d --force-recreate backend` |
| Still using App Password script | Use `configure-dev-google-oauth.sh`, not `configure-dev-smtp.sh external` for Gmail |

---

## Security notes

- Never commit `backend/.env`.
- Refresh tokens are secrets — treat like passwords.
- Production should use a secrets manager and short-lived tokens where possible.
