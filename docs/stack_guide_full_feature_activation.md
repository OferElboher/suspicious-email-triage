# Full feature activation — rebuild, workers, and every UI capability

This guide lists **exact terminal commands** to rebuild Docker images, start **every service** needed for the full product locally: triage, **dev simulation**, async analysis, **phishing graph**, Elasticsearch search, unified logs, analytics, and mock Snowflake reporting.

**Audience:** developers who want one checklist after `git pull`, a Docker rebuild, or `reset-local-state` — without guessing which containers to start.

**Related:** [stack_guide_build_and_run.md](stack_guide_build_and_run.md) (bootstrap + sign-in detail), [stack_guide_dev_simulation.md](stack_guide_dev_simulation.md) (simulation UI), [graph_test_manual_phishing_identification.md](graph_test_manual_phishing_identification.md) (phishing graph QA).

---

## What “fully active” means

| Capability | Depends on |
|------------|------------|
| Sign-in + triage form | `postgres`, `mongo`, `redis`, `backend`, React dev server |
| Async analysis (pending → completed) | `redpanda`, `ai-kafka-dispatch`, `ai-celery` |
| **Dev simulation** (Start/Stop button) | `backend` with `DEPLOYMENT_ENV=dev` (timer runs inside API) |
| **Phishing graph** (Neo4j campaigns) | `neo4j` + completed reviews + graph sync via Celery |
| **Search past reviews** | `elasticsearch` + completed reviews |
| **Search unified logs** | `backend` (merged.log; admin `logs.read`) |
| **Analytics & graphs** | `postgres` + completed reviews (stats events) |
| Mock Snowflake analytics | `mock-snowflake` + completed reviews |
| Django admin (user CRUD) | `django-admin` (optional, port 8000) |

**Technology pattern:** Docker Compose (`infra/docker/docker-compose.yml`) orchestrates containers; `DEPLOYMENT_ENV=dev` selects gitignored secrets + dev-only API routes.

---

## One-time or after clone — build all images

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — WSL, repository root</p>

```bash
cd ~/suspicious-email-triage
bash scripts/setup-and-build-dev.sh
```

</div>

This installs prerequisites, prompts for bootstrap admin email (written to gitignored `backend/.env`), and runs `docker compose build`.

---

## Rebuild after code changes

When backend, worker, or AI service code changed:

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --build --force-recreate \
  backend ai-celery ai-kafka-dispatch
```

When only the React UI changed, restart the dev server (no Docker rebuild required):

```bash
REACT_APP_API_URL=http://localhost:3000 PORT=3001 npm start --prefix frontend
```

---

## Start all infrastructure + workers (recommended full stack)

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — databases, queues, API, workers, search, analytics mock</p>

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --build \
  mongo postgres redis neo4j redpanda elasticsearch mock-snowflake \
  backend ai-celery ai-kafka-dispatch
docker compose -f infra/docker/docker-compose.yml ps
```

</div>

**Expected:** `backend`, `ai-celery`, and `ai-kafka-dispatch` show **running** (not restarting). If dispatch crash-loops, rebuild it: `--build ai-kafka-dispatch`.

Optional services:

```bash
# Django admin UI (port 8000) + local Mailpit (password reset emails)
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d django-admin mailpit

# Mock commercial LLM (only if DISABLE_LLM=false in your env)
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d mock-llm
```

---

## Start the React UI

```bash
cd ~/suspicious-email-triage
REACT_APP_API_URL=http://localhost:3000 PORT=3001 npm start --prefix frontend
```

Open `http://localhost:3001`. Sign in — [auth_guide_dev_admin_credentials.md](auth_guide_dev_admin_credentials.md).

---

## Verify each capability quickly

| Check | Command or UI action |
|-------|----------------------|
| API alive | `curl -sS http://localhost:3000/health/live` |
| Login | `curl -sS -X POST http://localhost:3000/auth/login …` — [auth_guide_obtain_jwt.md](auth_guide_obtain_jwt.md) |
| Simulation panel | Triage workspace → **Dev simulation** card → **Start simulation** — [stack_guide_dev_simulation.md](stack_guide_dev_simulation.md) |
| Async pipeline | Submit one review → Result panel → **Status: completed** |
| Phishing graph | **Phishing graph** tab → Refresh after campaign test — [graph_test_manual_phishing_identification.md](graph_test_manual_phishing_identification.md) |
| Search reviews | **Search past reviews** keyword query |
| Unified logs | **Search unified logs** keyword `simulation` |
| Analytics | **Analytics & graphs** tab |

Automated graph QA script:

```bash
bash scripts/run-manual-phishing-campaign-test.sh YOUR_EMAIL@example.com YOUR_PASSWORD
```

---

## After destructive reset

If you ran **Reset local databases & queues**:

1. Data is empty — expected.
2. Re-run the **Start all infrastructure** block above if any container stopped.
3. Use simulation or manual submissions to repopulate — [stack_guide_dev_simulation.md](stack_guide_dev_simulation.md).

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Login fails after rebuild | `bash scripts/bootstrap-auth-admin.sh --reset-password` — [stack_guide_build_and_run.md](stack_guide_build_and_run.md) |
| Reviews stuck `pending` | Check `ai-celery` + `ai-kafka-dispatch` logs; rebuild dispatch image |
| Graph empty | `neo4j` up; run phishing test script |
| ES search empty | `elasticsearch` up; wait for analysis `completed` |
| No simulation card | `DEPLOYMENT_ENV=dev`; rebuild `backend`; admin role |

---

## Security note

Use placeholder emails in docs and curl examples. Passwords and JWT secrets belong in gitignored `backend/dev.secrets` and `backend/.env` — not in GitHub.

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — health check after bring-up</p>

```bash
curl -sS http://localhost:3000/health/ready | python3 -m json.tool
```

</div>
