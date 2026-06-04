# Suspicious Email Triage (monorepo)

This repository contains a **suspicious email triage workbench**: analysts submit content through a web UI, the system stores it, processes it asynchronously (Kafka + Celery), stores review records in MongoDB, and stores chart statistics in PostgreSQL, and displays structured results with optional manual overrides.

## Quick map

- `backend/` — Node.js + Express API (ingest, metrics, logging, dev simulation loop).
- `frontend/` — React UI (triage, analytics charts, dev simulation controls).
- `ai_service/` — Python Celery workers + Kafka dispatcher.
- `infra/docker/` — local compose stack (MongoDB, PostgreSQL stats, Redis, Redpanda/Kafka, services).
- `docs/` — human-oriented documentation (start with `docs/README.md`).

## Documentation entry points

- Non-technical readers: `docs/biz_guide_user.md`
- Deep technical handbook: `docs/arch_guide_system_comprehensive.md`
- Local commands + simulation: `docs/stack_guide_versions_builds.md`
- Windows 11 startup (Docker, DB GUIs, run stack): `docs/stack_guide_windows_startup.md`
- Django vs Node/Python clarification: `docs/ci_guide_node_python_django_legacy.md`

## Developer hygiene

- Authentication & RBAC: `docs/auth_guide_rbac.md` (bootstrap admin: your email via `scripts/configure-dev-bootstrap-admin.sh`, temp password `temp-admin-pswd`)
- Auth tables reset / login recovery: `docs/auth_guide_dev_auth_recovery.md`
- Local setup: `npm run setup:dev`
- Dev setup + image build: `npm run build:dev` (or `bash scripts/setup-and-build-dev.sh`)
- Frontend dev server: `PORT=3001 npm start --prefix frontend` (CRA proxy → API on 3000; do not set `REACT_APP_API_URL` in dev)
- Lint: `sh scripts/lint-all.sh`
- Tests: `sh scripts/test-all.sh`
- Git hooks: Husky runs lint on commit and tests on push (see `docs/stack_guide_versions_builds.md` and repo hook files under `.husky/`).
