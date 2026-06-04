#!/usr/bin/env bash
# One-time doc renames: functional (feature) and tech (tool) prefixes. Run from repo root.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
D="$ROOT/docs"
cd "$D"

mv_if() {
  if [[ -f "$1" && "$1" != "$2" ]]; then
    git mv "$1" "$2" 2>/dev/null || mv "$1" "$2"
  fi
}

# Architecture & roadmap
mv_if arch_guide_overview.md arch_guide_overview.md
mv_if arch_assignment_historical.md arch_assignment_historical.md
mv_if arch_guide_system_comprehensive.md arch_guide_system_comprehensive.md
mv_if arch_guide_worker_pipeline.md arch_guide_worker_pipeline.md
mv_if roadmap_implemented_beyond_requirements.md roadmap_roadmap_implemented_beyond_requirements.md
mv_if roadmap_tbd.md roadmap_tbd.md
mv_if biz_guide_user.md biz_guide_user.md

# Auth
mv_if auth_guide_rbac.md auth_guide_rbac.md
mv_if auth_guide_dev_admin_credentials.md auth_guide_dev_admin_credentials.md
mv_if auth_guide_dev_auth_recovery.md auth_guide_dev_auth_recovery.md
mv_if auth_guide_dev_password_reset.md auth_guide_dev_password_reset.md
mv_if auth_guide_dev_smtp_recovery.md auth_guide_dev_smtp_recovery.md
mv_if auth_guide_google_oauth.md auth_guide_google_oauth.md
mv_if auth_guide_django_admin_users.md auth_guide_django_admin_users.md

# API
mv_if api_reference_rest.md api_reference_rest.md

# Graph / search / UI
mv_if graph_guide_neo4j_phishing.md graph_guide_neo4j_phishing.md
mv_if graph_demo_neo4j_phishing.md graph_demo_neo4j_phishing.md
mv_if ui_guide_analytics_charts.md ui_guide_analytics_charts.md
mv_if search_guide_elasticsearch_reviews.md search_guide_elasticsearch_reviews.md
mv_if ui_guide_color_themes.md ui_guide_color_themes.md

# Stack
mv_if stack_guide_windows_startup.md stack_guide_windows_startup.md
mv_if stack_guide_windows_docker_databases.md stack_guide_windows_docker_databases.md
mv_if stack_guide_frontend_api.md stack_guide_frontend_api.md
mv_if stack_guide_full_stack.md stack_guide_full_stack.md
mv_if stack_guide_versions_builds.md stack_guide_versions_builds.md
mv_if stack_guide_deployment.md stack_guide_stack_guide_deployment.md
mv_if stack_guide_production.md stack_guide_production.md
mv_if stack_guide_dev_database_credentials.md stack_guide_dev_database_credentials.md
mv_if stack_guide_pre_push_verification.md stack_guide_pre_push_verification.md
mv_if stack_guide_running_tests.md stack_guide_running_tests.md

# Ops
mv_if ops_guide_health_uptime.md ops_guide_health_uptime.md
mv_if ops_guide_central_logging.md ops_guide_central_logging.md
mv_if ops_guide_metrics_alerting.md ops_guide_metrics_alerting.md
mv_if ops_guide_kubernetes_helm.md ops_guide_kubernetes_helm.md

# CI / data
mv_if ci_guide_environment_builds.md ci_guide_environment_builds.md
mv_if ci_guide_pipeline_architecture.md ci_guide_pipeline_arch_guide_overview.md
mv_if ci_guide_node_python_django_legacy.md ci_guide_node_python_django_legacy.md
mv_if data_guide_kafka_events.md data_guide_kafka_events.md
mv_if data_guide_prefect_dbt_demo.md data_guide_prefect_dbt_demo.md
mv_if data_guide_mock_llm.md data_guide_mock_llm.md

# Technology-specific
mv_if tech_neo4j_setup_wsl_windows.md tech_neo4j_setup_wsl_windows.md
mv_if tech_postgresql_dbeaver_windows.md tech_postgresql_dbeaver_windows.md
mv_if tech_postgresql_dbeaver_auth_logs.md tech_postgresql_dbeaver_auth_logs.md
mv_if tech_mongodb_compass_windows.md tech_mongodb_compass_windows.md
mv_if tech_redis_insight_windows.md tech_redis_insight_windows.md
mv_if tech_env_configuration.md tech_env_configuration.md
mv_if tech_cursor_project_rules.md tech_tech_cursor_project_rules.md

echo "Doc renames complete under $D"
