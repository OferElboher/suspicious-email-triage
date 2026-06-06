# Build, bootstrap, and sign in — complete dev workflow

This guide walks you through **every step** from a fresh clone (or a Docker rebuild) to a working **sign-in** at `http://localhost:3001`. It explains *why* each step exists, which **technologies** are involved, and how to recover when login fails after `docker compose build`.

**Audience:** developers new to Docker, Create React App (CRA), or JWT auth in this project.

**Related:** [auth_guide_dev_admin_credentials.md](auth_guide_dev_admin_credentials.md), [stack_guide_windows_startup.md](stack_guide_windows_startup.md), [stack_guide_frontend_api.md](stack_guide_frontend_api.md)

---

## Why login breaks after `docker compose build`

Three things interact:

| Piece | Technology | What happens on rebuild |
|-------|------------|-------------------------|
| **Postgres volume** | Docker named volume `postgres-data` | **Survives** rebuild — `auth_users` rows and bcrypt password hashes stay |
| **Bootstrap script** | Node + `authPg.bootstrapAdminUser()` | Runs **only when the user table is empty** — does **not** reset an existing password |
| **Backend env** | `env_file: backend/.env.dev` + gitignored `backend/.env` | Injected when the **container starts** — changing `.env` without recreating the container leaves stale values inside |

So after rebuild you often have: **old password hash in Postgres**, **new `AUTH_BOOTSTRAP_*` in `.env`**, or **wrong email typed in the UI**. That looks like “invalid credentials” even though DBeaver shows your email in `auth_users`.

**Fix (pick one):**

1. **Sign-in screen** → **Reset dev bootstrap password** (calls `POST /auth/dev/bootstrap-reset`).
2. **Terminal:** `bash scripts/bootstrap-auth-admin.sh --reset-password`
3. **Manual:** [auth_guide_dev_auth_recovery.md](auth_guide_dev_auth_recovery.md)

---

## Architecture snapshot (ports and proxy)

```text
Browser (Windows)  →  http://localhost:3001  →  CRA dev server (React)
                              │
                              │  setupProxy.js forwards /auth, /reviews, …
                              ▼
                         http://backend:3000  (Docker network)
                              │
                              ▼
                         Node Express API + JWT (bcrypt passwords in Postgres)
```

- **Port 3000** — API inside Docker (also published to host `localhost:3000`).
- **Port 3001** — React UI; **do not** set `REACT_APP_API_URL` in dev (see [stack_guide_frontend_api.md](stack_guide_frontend_api.md)).
- **Auth pattern:** stateless **JWT** after `POST /auth/login`; passwords stored as **bcrypt** hashes in PostgreSQL `auth_users`.

---

## Part 1 — One-time setup (clone → images)

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — WSL, repository root</p>

```bash
cd ~/suspicious-email-triage
bash scripts/setup-and-build-dev.sh
```

</div>

**What this does:**

1. Checks Docker, Node, and helper tools.
2. Prompts for your **real** bootstrap admin email (`configure-dev-bootstrap-admin.sh`) — stored in gitignored `backend/.env`, not in GitHub.
3. Builds Docker images (`docker compose build`).

**Expected:** `AUTH_BOOTSTRAP_ADMIN_EMAIL=you@example.com` written to `backend/.env`.

---

## Part 2 — Start infrastructure

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — databases + API</p>

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d mongo postgres redis neo4j backend
docker compose -f infra/docker/docker-compose.yml ps
```

</div>

**Motivation:** The API needs **MongoDB** (reviews), **Postgres** (`triage_stats` — auth + analytics), **Redis** (queues/cache), and optionally **Neo4j** (phishing graph). `DEPLOYMENT_ENV=dev` enables dev-only routes like bootstrap reset.

If you changed `backend/.env` after the container was created, recreate the backend so env vars reload:

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --force-recreate backend
```

---

## Part 3 — Bootstrap admin (first time or after rebuild)

### First time (empty `auth_users`)

```bash
cd ~/suspicious-email-triage
bash scripts/bootstrap-auth-admin.sh
```

**Expected:** `Bootstrap admin created: you@example.com`

### After rebuild (users already exist — login fails)

```bash
cd ~/suspicious-email-triage
bash scripts/bootstrap-auth-admin.sh --reset-password
```

**Expected:** `Bootstrap admin password_reset: you@example.com`

This runs `resetBootstrapAdminForDev()` inside the backend container: sets password to `AUTH_BOOTSTRAP_ADMIN_PASSWORD` (default `temp-admin-pswd`) and ensures the `admin` role.

---

## Part 4 — Verify API login (before opening the browser)

Replace `you@example.com` with your configured email:

```bash
curl -sS -X POST "http://localhost:3000/auth/login" \
  -H "content-type: application/json" \
  -d '{"email":"you@example.com","password":"temp-admin-pswd"}' | python3 -m json.tool
```

**Expected:** JSON with `"token"` and `"user"` containing `"roles": ["admin"]`.

If this works but the UI fails, the problem is almost always the **CRA proxy** — see [stack_guide_frontend_api.md](stack_guide_frontend_api.md).

---

## Part 5 — Start React UI and sign in

```bash
cd ~/suspicious-email-triage
PORT=3001 npm start --prefix frontend
```

Open `http://localhost:3001`.

| Field | Value |
|-------|-------|
| Email | From `grep AUTH_BOOTSTRAP_ADMIN_EMAIL backend/.env` |
| Password | `temp-admin-pswd` unless you changed `AUTH_BOOTSTRAP_ADMIN_PASSWORD` |

The sign-in form shows a **masked** hint (`yo***@example.com`) from `GET /auth/config` when `DEPLOYMENT_ENV=dev`.

**UI recovery:** click **Reset dev bootstrap password** — same as `--reset-password` script.

---

## Part 6 — Optional workers (triage + graph)

For full email analysis and Neo4j sync:

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d ai-celery ai-kafka-dispatch mock-llm
```

Manual phishing identification test: [graph_test_manual_phishing_identification.md](graph_test_manual_phishing_identification.md).

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `curl: (7) Failed to connect` to :3000 | Backend not running | `docker compose … up -d backend` |
| API login OK, UI “Cannot reach the API” | `REACT_APP_API_URL` in `frontend/.env` | Remove it; use CRA proxy — [stack_guide_frontend_api.md](stack_guide_frontend_api.md) |
| `invalid_credentials` | Wrong email/password or stale hash | `--reset-password` or UI button |
| Email in DBeaver but login fails | Password hash ≠ current env password | `--reset-password` |
| `bootstrap_email_not_configured` | Missing real email in env | `bash scripts/configure-dev-bootstrap-admin.sh you@example.com` then recreate backend |
| Changed `.env` but behavior unchanged | Container has old env | `--force-recreate backend` |

---

## Security note

Documentation uses **variable names** and the shared dev default password `temp-admin-pswd` from committed `backend/.env.dev`. Your personal email lives only in gitignored `backend/.env`. Never commit real production secrets.

---

## Related docs

- [auth_guide_dev_admin_credentials.md](auth_guide_dev_admin_credentials.md) — password change, forgot-password, Django admin users
- [stack_guide_running_tests.md](stack_guide_running_tests.md) — `bash scripts/test-all.sh`
- [stack_guide_pre_push_verification.md](stack_guide_pre_push_verification.md) — lint + test before push
