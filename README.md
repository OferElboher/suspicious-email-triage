# Suspicious Email Triage (monorepo)

This repository contains a **suspicious email triage workbench**: analysts submit content through a web UI, the system stores it, processes it asynchronously (Kafka + Celery), stores review records in MongoDB, and stores chart statistics in PostgreSQL, and displays structured results with optional manual overrides.

## Quick map

- `backend/` — Node.js + Express API (ingest, metrics, logging, dev simulation loop).
- `frontend/` — React UI (triage, analytics charts, dev simulation controls).
- `ai_service/` — Python Celery workers + Kafka dispatcher.
- `infra/docker/` — local compose stack (MongoDB, PostgreSQL stats, Redis, Redpanda/Kafka, services).
- `docs/` — human-oriented documentation (start with `docs/README.md`).

## Documentation entry points

- Non-technical readers: `docs/USER_GUIDE_BUSINESS.md`
- Deep technical handbook: `docs/SYSTEM_COMPREHENSIVE.md`
- Local commands + simulation: `docs/VERSIONS_BUILDS_AND_SIMULATION.md`
- Windows 11 startup (Docker, DB GUIs, run stack): `docs/windows_dev_startup_run_guide.md`
- Django vs Node/Python clarification: `docs/NODE_PYTHON_AND_LEGACY_DJANGO.md`

## Developer hygiene

- Authentication & RBAC: `docs/AUTHENTICATION_AND_RBAC.md` (bootstrap admin: your email via `scripts/configure-dev-bootstrap-admin.sh`, temp password `temp-admin-pswd`)
- Auth tables reset / login recovery: `docs/dev_auth_tables_reset_and_admin_recovery.md`
- Local setup: `npm run setup:dev`
- Dev setup + image build: `npm run build:dev` (or `bash scripts/setup-and-build-dev.sh`)
- Frontend dev server: `REACT_APP_API_URL=http://localhost:3000 PORT=3001 npm start --prefix frontend`
- Lint: `sh scripts/lint-all.sh`
- Tests: `sh scripts/test-all.sh`
- Git hooks: Husky runs lint on commit and tests on push (see `docs/VERSIONS_BUILDS_AND_SIMULATION.md` and repo hook files under `.husky/`).
