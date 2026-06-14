# Documentation index

All guides live under `docs/`. Names use a **prefix** so you can tell **functional** product docs from **technology** tool docs.

| Prefix | Meaning | Examples |
|--------|---------|----------|
| `auth_`, `api_`, `arch_`, `biz_`, `ci_`, `data_`, `graph_`, `ops_`, `roadmap_`, `search_`, `stack_`, `ui_` | **Functional** — features, workflows, product behavior | `graph_demo_neo4j_phishing.md` |
| `tech_` | **Technology** — databases, languages, IDE tools, env vars | `tech_neo4j_browser_guide.md` |
| `util_` | Documentation conventions (not product features) | `util_terminal_block_format.md` |

**Deep links:** sections use `{#anchor-id}` where noted; link as `[text](file.md#anchor-id)`.

**Security:** docs never contain real passwords or private env values — use variable names and read gitignored `backend/dev.secrets` locally (see [ops_guide_secrets_management.md](ops_guide_secrets_management.md)).

---

## Start here

| Goal | Document |
|------|----------|
| Non-technical product overview | [biz_guide_user.md](biz_guide_user.md) |
| **Complete list of implemented features** | [arch_guide_features_catalog.md](arch_guide_features_catalog.md) |
| Full technical handbook | [arch_guide_system_comprehensive.md](arch_guide_system_comprehensive.md) |
| **Build → bootstrap → sign in** (after clone or rebuild) | [stack_guide_build_and_run.md](stack_guide_build_and_run.md) |
| Windows 11 + WSL after reboot | [stack_guide_windows_startup.md](stack_guide_windows_startup.md) |
| Dev builds, simulation, ports | [stack_guide_versions_builds.md](stack_guide_versions_builds.md) |
| Login, roles, JWT, recovery | [auth_guide_rbac.md](auth_guide_rbac.md) |
| REST API reference | [api_reference_rest.md](api_reference_rest.md) |
| Run tests / pre-push | [stack_guide_running_tests.md](stack_guide_running_tests.md), [stack_guide_pre_push_verification.md](stack_guide_pre_push_verification.md) |

---

## Functional guides

### Authentication & users

- [auth_guide_rbac.md](auth_guide_rbac.md) — JWT login, RBAC, protected routes
- [stack_guide_build_and_run.md](stack_guide_build_and_run.md) — Docker build, bootstrap, login recovery
- [auth_guide_dev_admin_credentials.md](auth_guide_dev_admin_credentials.md) — bootstrap admin
- [auth_guide_dev_auth_recovery.md](auth_guide_dev_auth_recovery.md) — reset auth tables
- [auth_guide_dev_password_reset.md](auth_guide_dev_password_reset.md) — manual password reset
- [auth_guide_dev_smtp_recovery.md](auth_guide_dev_smtp_recovery.md) — Mailpit / SMTP recovery email
- [auth_guide_google_oauth.md](auth_guide_google_oauth.md) — Google sign-in
- [auth_guide_django_admin_users.md](auth_guide_django_admin_users.md) — Django admin user CRUD

### Architecture & data

- [arch_guide_features_catalog.md](arch_guide_features_catalog.md) — every implemented feature with technologies
- [arch_guide_overview.md](arch_guide_overview.md) — component map
- [arch_guide_worker_pipeline.md](arch_guide_worker_pipeline.md) — Kafka / Celery workers
- [arch_guide_system_comprehensive.md](arch_guide_system_comprehensive.md) — end-to-end deep dive
- [arch_assignment_historical.md](arch_assignment_historical.md) — original assignment brief
- [data_guide_mock_llm.md](data_guide_mock_llm.md) — mock commercial LLM
- [data_guide_kafka_events.md](data_guide_kafka_events.md) — Kafka topics & consumers
- [data_guide_prefect_dbt_demo.md](data_guide_prefect_dbt_demo.md) — Prefect / dbt demo

### Graph (Neo4j phishing)

- [graph_guide_neo4j_phishing.md](graph_guide_neo4j_phishing.md) — model, sync, APIs
- [graph_demo_neo4j_phishing.md](graph_demo_neo4j_phishing.md) — hands-on demo & tests
- [graph_test_manual_phishing_identification.md](graph_test_manual_phishing_identification.md) — manual QA checklist for phishing verdicts & campaigns

### Search (Elasticsearch)

- [search_guide_elasticsearch_reviews.md](search_guide_elasticsearch_reviews.md) — review full-text + advanced filters (API + UI)

### Operations logging

- [ops_guide_central_logging.md](ops_guide_central_logging.md) — merged.log unified search (API + UI)

### Stack & deployment

- [stack_guide_frontend_api.md](stack_guide_frontend_api.md) — SPA ↔ API (CRA proxy)
- [stack_guide_full_stack.md](stack_guide_full_stack.md) — bring-up narrative
- [stack_guide_deployment.md](stack_guide_deployment.md) — containers & ports
- [stack_guide_production.md](stack_guide_production.md) — production hardening
- [stack_guide_dev_database_credentials.md](stack_guide_dev_database_credentials.md) — connection strings
- [stack_guide_windows_docker_databases.md](stack_guide_windows_docker_databases.md) — DB containers from Windows

### UI & business

- [ui_guide_analytics_charts.md](ui_guide_analytics_charts.md) — analytics charts
- [ui_guide_color_themes.md](ui_guide_color_themes.md) — CSS themes
- [biz_guide_user.md](biz_guide_user.md) — business-facing guide

### Operations & roadmap

- [ops_guide_secrets_management.md](ops_guide_secrets_management.md) — mock AWS Secrets Manager, *.secrets files, rotation
- [ops_guide_kubernetes_helm.md](ops_guide_kubernetes_helm.md) — Helm / Kubernetes
- [ops_guide_health_uptime.md](ops_guide_health_uptime.md) — health probes
- [ops_guide_central_logging.md](ops_guide_central_logging.md) — merged logs
- [ops_guide_metrics_alerting.md](ops_guide_metrics_alerting.md) — Prometheus / alerts
- [roadmap_tbd.md](roadmap_tbd.md) — backlog
- [roadmap_implemented_beyond_requirements.md](roadmap_implemented_beyond_requirements.md) — extras delivered

### CI

- [ci_guide_environment_builds.md](ci_guide_environment_builds.md)
- [ci_guide_pipeline_architecture.md](ci_guide_pipeline_architecture.md)
- [ci_guide_node_python_django_legacy.md](ci_guide_node_python_django_legacy.md)

---

## Technology guides

- [tech_env_configuration.md](tech_env_configuration.md) — environment variables
- [tech_neo4j_setup_wsl_windows.md](tech_neo4j_setup_wsl_windows.md) — Neo4j Docker on WSL
- [tech_neo4j_browser_guide.md](tech_neo4j_browser_guide.md) — Neo4j Browser & Cypher
- [tech_postgresql_dbeaver_windows.md](tech_postgresql_dbeaver_windows.md) — DBeaver → Postgres
- [tech_postgresql_dbeaver_auth_logs.md](tech_postgresql_dbeaver_auth_logs.md) — auth tables & logs
- [tech_mongodb_compass_windows.md](tech_mongodb_compass_windows.md) — Compass → MongoDB
- [tech_redis_insight_windows.md](tech_redis_insight_windows.md) — Redis Insight
- [tech_cursor_project_rules.md](tech_cursor_project_rules.md) — Cursor AI rules

---

## Utilities

- [util_terminal_block_format.md](util_terminal_block_format.md) — gray terminal command boxes in Markdown

---

## Accuracy

When code changes, update the matching guide. Prefer the repository source of truth over stale prose.
---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — WSL, repository root unless noted</p>

```bash
cd ~/suspicious-email-triage
bash scripts/test-all.sh
```

</div>

