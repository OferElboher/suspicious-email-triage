# Documentation index

This folder collects human-oriented explanations of the Suspicious Email Triage system. Some files are long reference guides; others are short “what lives here” notes for a specific concern.

## How to read these docs

- If you are **not a programmer** and need to understand what the product does for your company, start with `USER_GUIDE_BUSINESS.md`.
- If you need **end-to-end technical depth** (architecture, technologies, flows, diagrams), read `SYSTEM_COMPREHENSIVE.md`.
- If you need **exact commands** for dev/staging/prod builds, browser URLs, and the development simulation mode, read `VERSIONS_BUILDS_AND_SIMULATION.md`.
- If you are confused by **older references to Django** in CI or legacy markdown, read `NODE_PYTHON_AND_LEGACY_DJANGO.md` first.

## What each major document is for

- `architecture.md` — High-level component map, data movement, and MongoDB/PostgreSQL storage split.
- `deployment.md` — Operational deployment concerns (containers, ports, dependencies).
- `env_configuration_guide.md` — Environment variables and how they influence behavior.
- `frontend_backend_integration_guide.md` — How the SPA talks to the API (routes, polling, error handling patterns).
- `full_stack_run_guide_mongo_db_node_worker_react.md` — Practical “bring the stack up” guidance (may overlap with the versions doc; both are maintained intentionally for different audiences).
- `production_setup_guide.md` — Hardening and production-oriented notes.
- `worker-architecture.md` — Background processing paths (Node worker vs Kafka/Celery pipeline).
- `ASSIGNMENT.md` — Original assignment framing (historical context).
- `implemented_beyond_requirements.md` — Notes on extra capabilities delivered beyond the baseline brief.
- `ci_environment_configurations_and_build_commands.md` — CI-related environment notes (some sections may still reference legacy templates; see the Django clarification doc when in doubt).
- `ci_pipeline_architecture_distributed_ai_demo.md` — CI pipeline narrative (may include aspirational or historical steps).

## Short note on accuracy

Documentation is treated as part of the product: when code changes, these files should change too. If you find a mismatch, prefer the repository code and open a doc fix alongside the code change.
