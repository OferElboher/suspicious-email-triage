# Running tests — full suite or a single test

This project runs tests in **three layers**: Node (Jest), React (CRA/Jest), and Python (pytest). Some Python tests need the **Docker dev stack** running; others run offline.

**Related:** [stack_guide_pre_push_verification.md](stack_guide_pre_push_verification.md), [README.md](README.md).

---

## Quick reference

| Goal | Command |
|------|---------|
| **Everything** (same as pre-push hook) | `bash scripts/test-all.sh` |
| **Lint only** | `bash scripts/lint-all.sh` |
| **Backend unit tests** | `cd backend && npm test` |
| **Frontend unit tests** | `cd frontend && npm test -- --watchAll=false` |
| **All Python tests** | `bash scripts/ensure-ai-service-venv.sh && ai_service/.venv/bin/pytest` |
| **One pytest file** | `ai_service/.venv/bin/pytest path/to/test_file.py -v` |
| **One pytest function** | `ai_service/.venv/bin/pytest path/to/test_file.py::test_name -v` |
| **One Jest test file** | See [Map `backend/src` → Jest command](#map-backendsrc--jest-command) below |

---

## Map `backend/src` → Jest command {#map-backendsrc--jest-command}

Jest runs files under **`backend/__tests__/*.test.js`**, not `backend/src/` directly. Use **`--testPathPattern`** with the **test file name** (substring match). Always add **`--watchAll=false`** so the run exits (same as CI).

**Example — tests for `backend/src/graph/campaignDetection.js`:**

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — WSL, matches <code>campaignDetection.test.js</code> (covers <code>src/graph/campaignDetection.js</code>)</p>

```bash
cd ~/suspicious-email-triage/backend
npm test -- --watchAll=false --testPathPattern=campaignDetection
```

</div>

**Example — tests for `frontend/src/App.js`:**

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — matches <code>App.test.js</code></p>

```bash
cd ~/suspicious-email-triage/frontend
npm test -- --watchAll=false --testPathPattern=App.test
```

</div>

| Source (`backend/src/…`) | Test file (`backend/__tests__/`) | `--testPathPattern=` |
|--------------------------|----------------------------------|----------------------|
| `graph/campaignDetection.js` | `campaignDetection.test.js` | `campaignDetection` |
| `graph/syncReview.js` | `graphSync.test.js` | `graphSync` |
| `graph/domainFromUrl.js` | `domainFromUrl.test.js` | `domainFromUrl` |
| `api/graph.js` | `graphApi.test.js` | `graphApi` |
| `api/graphInternal.js` | `graphInternal.test.js` | `graphInternal` |
| `graph/neo4jClient.js` | `neo4jParams.test.js` | `neo4jParams` |
| `api/auth.js` (login) | `authLogin.test.js` | `authLogin` |
| `auth/email.js` | `authEmail.test.js` | `authEmail` |
| `auth/password.js` | `authPassword.test.js` | `authPassword` |
| `api/search.js` | `searchApi.test.js` | `searchApi` |
| `search/reviewSearchIndex.js` | `reviewSearchIndex.test.js` | `reviewSearchIndex` |
| `api/ops.js` | `opsApi.test.js` | `opsApi` |
| `api/health.js` | `healthApi.test.js` | `healthApi` |
| `llm/llmProvider.js` | `llmProvider.test.js` | `llmProvider` |

**One test by name inside a file:**

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong></p>

```bash
cd ~/suspicious-email-triage/backend
npm test -- --watchAll=false --testPathPattern=authEmail --testNamePattern="smtpDeliveryMode"
```

</div>

**Campaign + mock LLM (script used in graph demo):**

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — repo root</p>

```bash
cd ~/suspicious-email-triage
bash scripts/verify-campaign-detection.sh
```

</div>

---

## Full suite (`scripts/test-all.sh`)

Runs in order:

1. **Backend Jest** — `backend/__tests__/`
2. **Frontend Jest** — `frontend/src/**/*.test.js`
3. **pytest** — paths from `pytest.ini`:
   - `ai_service/tests/`
   - `integration_tests/`
   - `orchestration/tests/`

```bash
cd ~/suspicious-email-triage
bash scripts/test-all.sh
```

This is what **Husky pre-push** runs on `git push`.

---

## Backend tests (Jest)

Location: `backend/__tests__/`

```bash
cd ~/suspicious-email-triage/backend
npm test
```

### Run one backend test file (quick copy-paste)

Same rules as [Map `backend/src` → Jest command](#map-backendsrc--jest-command). Pattern:

```bash
cd ~/suspicious-email-triage/backend
npm test -- --watchAll=false --testPathPattern=PATTERN
```

Replace `PATTERN` with a row from the table above (e.g. `campaignDetection` for `src/graph/campaignDetection.js`).

| Test file | What it covers |
|-----------|----------------|
| `campaignDetection.test.js` | Shared-domain campaigns (`campaignDetection.js`) |
| `authPassword.test.js` | bcrypt, reset token hashing |
| `authEmail.test.js` | Mailpit / external / delivery modes |
| `gmailApi.test.js` | Google OAuth Gmail API send (mocked) |
| `llmProvider.test.js` | Mock commercial LLM fetch |
| `extractLinks.test.js` | URL extraction utility |
| `domainFromUrl.test.js` | Hostname parsing for graph domains |
| `graphSync.test.js` | Neo4j sync payload + mocked Cypher |
| `graphApi.test.js` | Authenticated `/graph` routes |
| `graphInternal.test.js` | Celery internal sync token |

**Python live Neo4j** (not Jest): `ai_service/.venv/bin/pytest integration_tests/test_neo4j_graph.py -v`

Neo4j hands-on demo: [graph_demo_neo4j_phishing.md](graph_demo_neo4j_phishing.md).

---

## Frontend tests (React Testing Library)

```bash
cd ~/suspicious-email-triage/frontend
npm test -- --watchAll=false
```

### Run one frontend test file

CRA tests live next to components (e.g. `frontend/src/App.test.js` for `App.js`). Use **`--testPathPattern`** on the **test filename**:

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — example: <code>App.test.js</code> (covers main <code>App.js</code> routing)</p>

```bash
cd ~/suspicious-email-triage/frontend
npm test -- --watchAll=false --testPathPattern=App.test
```

</div>

Other examples: `apiBase.test` → `src/lib/apiBase.js`, `RecentReviewsList.test` → `src/components/RecentReviewsList.jsx`.

---

## Python tests (pytest)

Config: `pytest.ini` at repo root (`pythonpath = ai_service`).

Ensure the venv exists:

```bash
bash scripts/ensure-ai-service-venv.sh
```

### Run all Python tests

```bash
cd ~/suspicious-email-triage
ai_service/.venv/bin/pytest
```

### Run one directory

```bash
ai_service/.venv/bin/pytest ai_service/tests/ -v
ai_service/.venv/bin/pytest integration_tests/ -v
ai_service/.venv/bin/pytest orchestration/tests/ -v
```

### Run one file

```bash
ai_service/.venv/bin/pytest ai_service/tests/test_llm_client.py -v
ai_service/.venv/bin/pytest integration_tests/test_password_reset_email.py -v
```

### Run one test function

```bash
ai_service/.venv/bin/pytest ai_service/tests/test_kafka_patterns.py::test_validate_ingest_payload_accepts_review_id -v
```

### Verbose output with print statements

```bash
ai_service/.venv/bin/pytest integration_tests/test_repo_guardrails.py -v -s
```

---

## Live stack tests (integration_tests)

These tests **skip** if Docker services are not reachable — push still succeeds.

| Requirement | Port | Service |
|-------------|------|---------|
| PostgreSQL | 5432 | `postgres` |
| Node API | 3000 | `backend` |
| Django admin | 8000 | `django-admin` |
| Mailpit (email test only) | 8025 | `mailpit` |

Start stack:

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d
```

Run only integration tests:

```bash
ai_service/.venv/bin/pytest integration_tests/ -v
```

**Mailpit password-reset test** requires `EMAIL_DELIVERY=mailpit` inside the backend container. If you previously configured external SMTP, run:

```bash
bash scripts/configure-dev-smtp.sh mailpit
docker compose -f infra/docker/docker-compose.yml up -d --force-recreate backend
```

See [auth_guide_dev_smtp_recovery.md](auth_guide_dev_smtp_recovery.md).

---

## Guardrail tests (always run, no Docker)

`integration_tests/test_repo_guardrails.py` — asserts repo invariants (pytest paths, django SQLite split, composite PK admin, LLM wiring). These run even when the stack is down.

```bash
ai_service/.venv/bin/pytest integration_tests/test_repo_guardrails.py -v
```

---

## Lint

```bash
bash scripts/lint-all.sh
```

Runs ESLint (backend + frontend) and Ruff (Python). Pre-commit hook runs this on `git commit`.

---

## CI / hooks summary

| Hook | Script |
|------|--------|
| pre-commit | `scripts/lint-all.sh` |
| pre-push | `scripts/test-all.sh` |

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `pytest: command not found` | Run `bash scripts/ensure-ai-service-venv.sh` |
| Integration tests all skipped | Start Docker stack; check ports 3000, 5432, 8000 |
| Mailpit test skipped | `configure-dev-smtp.sh mailpit` + recreate backend |
| Legacy Django test errors | Excluded on purpose — use `pytest.ini` paths only |
