# Documentation index

This folder collects human-oriented explanations of the Suspicious Email Triage system. Some files are long reference guides; others are short “what lives here” notes for a specific concern.

## How to read these docs

- If you are **not a programmer** and need to understand what the product does for your company, start with `USER_GUIDE_BUSINESS.md`.
- If you need **end-to-end technical depth** (architecture, technologies, flows, diagrams), read `SYSTEM_COMPREHENSIVE.md`.
- If you need **exact commands** for dev/staging/prod builds, browser URLs, and the development simulation mode, read `VERSIONS_BUILDS_AND_SIMULATION.md`.
- If you use **Windows 11 + WSL** and need to run the project after a reboot, start with `windows_dev_startup_run_guide.md` (which links database startup, GUI clients, and admin sign-in).
- If you connect **GUI database clients on Windows 11** to the WSL/Docker dev stack, start with `windows_docker_databases_start_and_verify.md`, then `dbeaver_postgresql_windows_setup.md`. For **auth tables refresh** and **unified log viewing**, see `dbeaver_auth_tables_and_unified_log_viewing.md`.
- If you need **bootstrap admin email/password, sign-in, or password recovery**, read `dev_admin_credentials_and_recovery.md`.
- For **password-reset email (Mailpit, Google OAuth, or SMTP)**, read [dev_smtp_password_recovery_email.md](dev_smtp_password_recovery_email.md) and [google_oauth_email_and_signin.md](google_oauth_email_and_signin.md).
- For **mock commercial LLM scoring (OpenAI-shaped, zero cost)**, read [mock_commercial_llm_guide.md](mock_commercial_llm_guide.md).
- For **Neo4j phishing relationship graph (campaigns, shared indicators, visualization)**, read [neo4j_phishing_graph_guide.md](neo4j_phishing_graph_guide.md).
- To **install Neo4j on WSL, configure env vars, and connect from Windows 11**, read [neo4j_wsl_windows_setup_guide.md](neo4j_wsl_windows_setup_guide.md).
- To **demo Neo4j graph features step by step**, read [neo4j_phishing_graph_demo_guide.md](neo4j_phishing_graph_demo_guide.md).
- For a **production roadmap and feature backlog**, read [TBD.md](TBD.md).
- To **manually reset an admin password on a dev workstation**, read `dev_manual_admin_password_reset.md`.
- For **Kubernetes and Helm deployment** (Pods, Ingress, HPA, dev/staging/prod install commands), read [kubernetes_helm_deployment_guide.md](kubernetes_helm_deployment_guide.md).
- For the **complete REST API reference** (every route, curl samples, test links), read [rest_api_reference.md](rest_api_reference.md).
- For **health probes and uptime** (liveness/readiness, Docker/Kubernetes), read [health_checks_and_uptime_guide.md](health_checks_and_uptime_guide.md).
- For **central logging and search** (merged.log, `/logs/search`, `/ops/logs/summary`), read [central_logging_guide.md](central_logging_guide.md).
- For **metrics and alerting** (Prometheus scrape, JSON alerts), read [metrics_and_alerting_guide.md](metrics_and_alerting_guide.md).
- For **UI color themes** (CSS variables, per-user persistence), read [ui_themes_guide.md](ui_themes_guide.md).
- For **Kafka event streaming** (consumer groups, offsets, DLQ), read `kafka_event_stream_guide.md`.
- For **Prefect/dbt orchestration demos**, read `data_orchestration_prefect_dbt_demo.md`.
- If login fails but **`auth_users` shows your email in DBeaver**, or you need to **reset auth tables** and recreate admin, read `dev_auth_tables_reset_and_admin_recovery.md`.
- If you need **login, roles, password recovery, or authenticated API examples**, read `AUTHENTICATION_AND_RBAC.md`.
- If you need to **create, update, or delete users as admin**, read `django_admin_user_management.md`.
- If you need to understand **Analytics & graphs** charts, read `analytics_and_graphs_guide.md`.
- For **pre-push tests** and live stack verification, read [pre_push_tests_and_stack_verification.md](pre_push_tests_and_stack_verification.md).
- To **run all tests or a single test**, read [running_tests_guide.md](running_tests_guide.md).
- If you are confused by **older references to Django** in CI or legacy markdown, read [NODE_PYTHON_AND_LEGACY_DJANGO.md](NODE_PYTHON_AND_LEGACY_DJANGO.md) first.

## What each major document is for

- `AUTHENTICATION_AND_RBAC.md` — PostgreSQL-backed users, JWT login, roles/permissions, password recovery, admin provisioning, protected routes.
- `architecture.md` — High-level component map, data movement, and MongoDB/PostgreSQL storage split.
- `deployment.md` — Operational deployment concerns (containers, ports, dependencies).
- `kubernetes_helm_deployment_guide.md` — Beginner-friendly Kubernetes/Helm guide: chart layout, core objects, health probes, secrets, and install/upgrade for dev/staging/prod.
- `rest_api_reference.md` — Every REST route with auth, permissions, request/response samples, curl examples, and links to Jest tests.
- `health_checks_and_uptime_guide.md` — Liveness vs readiness, `/health/*` routes, Docker HEALTHCHECK, Kubernetes probes.
- `central_logging_guide.md` — JSON merged.log, log search API, log summary ops endpoint, lnav/grep free path.
- `metrics_and_alerting_guide.md` — In-process Prometheus metrics, `/ops/prometheus`, `/ops/alerts`, threshold env vars.
- `ui_themes_guide.md` — CSS variable themes, ThemeContext, GET/PUT `/auth/preferences`, PostgreSQL `ui_theme` column.
- `env_configuration_guide.md` — Environment variables and how they influence behavior.
- `frontend_backend_integration_guide.md` — How the SPA talks to the API (routes, polling, error handling patterns).
- `full_stack_run_guide_mongo_db_node_worker_react.md` — Practical “bring the stack up” guidance (may overlap with the versions doc; both are maintained intentionally for different audiences).
- `production_setup_guide.md` — Hardening and production-oriented notes.
- `DEV_DATABASE_CREDENTIALS.md` — Local vs remote connection strings; see also the Windows GUI client guides below.
- `windows_dev_startup_run_guide.md` — After Windows 11 startup: Docker, databases, full dev stack, GUI clients, UI sign-in.
- `windows_docker_databases_start_and_verify.md` — Start dev DB containers in WSL Docker and verify ports before connecting from Windows.
- `dev_admin_credentials_and_recovery.md` — Configure bootstrap admin email, temporary password, change/recover credentials (UI and API).
- `django_admin_user_management.md` — Django admin: watch, create, update, delete users; switch between triage app and admin UI.
- `analytics_and_graphs_guide.md` — What each analytics chart shows and how to read status bars.
- `dev_manual_admin_password_reset.md` — script/API/Django admin ways to set a dev user password.
- `dev_smtp_password_recovery_email.md` — Mailpit local inbox vs SMTP; links to Google OAuth for Gmail.
- `google_oauth_email_and_signin.md` — Sign in with Google for login and Gmail API password-reset email (no App Passwords).
- `mock_commercial_llm_guide.md` — OpenAI-compatible mock LLM, env vars, Celery integration, **how Mongo + PostgreSQL data is assembled into each prompt**, tests.
- `neo4j_phishing_graph_guide.md` — Neo4j graph model (sender/review/url/domain/campaign), sync flow, API, React visualization, Docker.
- `neo4j_wsl_windows_setup_guide.md` — Start Neo4j in WSL Docker, `.env` variable meanings (no secrets in doc), Neo4j Browser and DBeaver on Windows 11.
- `neo4j_phishing_graph_demo_guide.md` — Hands-on demo: submit reviews, campaigns, UI tab, Cypher, REST examples.
- `TBD.md` — Possible improvements for production maturity and expected product features (budget-conscious).
- `kafka_event_stream_guide.md` — topic design, consumer groups, offsets, DLQ reliability patterns.
- `data_orchestration_prefect_dbt_demo.md` — Prefect flow + dbt model demos over `review_stats_events`.
- `dbeaver_auth_tables_and_unified_log_viewing.md` — Refresh DBeaver for `auth_*` tables; view/search unified `merged.log` (lnav, glogg, API).
- `dbeaver_postgresql_windows_setup.md` — DBeaver on Windows → PostgreSQL (`triage_stats`).
- `mongodb_compass_windows_setup.md` — MongoDB Compass on Windows → MongoDB (`triage` on port `27018`).
- `redis_insight_windows_setup.md` — Redis Insight on Windows → Redis (broker DB `0`, results DB `1`).
- `worker-architecture.md` — Background processing paths (Node worker vs Kafka/Celery pipeline).
- `ASSIGNMENT.md` — Original assignment framing (historical context).
- `implemented_beyond_requirements.md` — Notes on extra capabilities delivered beyond the baseline brief.
- `ci_environment_configurations_and_build_commands.md` — CI-related environment notes (some sections may still reference legacy templates; see the Django clarification doc when in doubt).
- `ci_pipeline_architecture_distributed_ai_demo.md` — CI pipeline narrative (may include aspirational or historical steps).
- `pre_push_tests_and_stack_verification.md` — what Husky runs on push; live stack checks.
- `running_tests_guide.md` — run full suite, one Jest file, or one pytest test.
- `TBD.md` — production maturity roadmap and feature backlog (budget-conscious).
- `cursor_project_rules.md` — Cursor AI execution rules mirrored from `.cursorrules`.

## Short note on accuracy

Documentation is treated as part of the product: when code changes, these files should change too. If you find a mismatch, prefer the repository code and open a doc fix alongside the code change.
