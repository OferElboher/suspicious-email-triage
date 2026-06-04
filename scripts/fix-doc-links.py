#!/usr/bin/env python3
"""Replace legacy doc filenames with prefixed names across the repository."""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

REPLACEMENTS: list[tuple[str, str]] = [
    ("arch_guide_worker_pipeline.md", "arch_guide_worker_pipeline.md"),
    ("arch_guide_worker_pipeline.md", "arch_guide_worker_pipeline.md"),
    ("arch_assignment_historical.md", "arch_assignment_historical.md"),
    ("arch_guide_system_comprehensive.md", "arch_guide_system_comprehensive.md"),
    ("arch_guide_overview.md", "arch_guide_overview.md"),
    ("roadmap_implemented_beyond_requirements.md", "roadmap_roadmap_implemented_beyond_requirements.md"),
    ("biz_guide_user.md", "biz_guide_user.md"),
    ("auth_guide_dev_admin_credentials.md", "auth_guide_dev_admin_credentials.md"),
    ("auth_guide_dev_auth_recovery.md", "auth_guide_dev_auth_recovery.md"),
    ("auth_guide_dev_password_reset.md", "auth_guide_dev_password_reset.md"),
    ("auth_guide_dev_smtp_recovery.md", "auth_guide_dev_smtp_recovery.md"),
    ("auth_guide_google_oauth.md", "auth_guide_google_oauth.md"),
    ("auth_guide_django_admin_users.md", "auth_guide_django_admin_users.md"),
    ("api_reference_rest.md", "api_reference_rest.md"),
    ("ui_guide_color_themes.md", "ui_guide_color_themes.md"),
    ("stack_guide_windows_docker_databases.md", "stack_guide_windows_docker_databases.md"),
    ("stack_guide_full_stack.md", "stack_guide_full_stack.md"),
    ("stack_guide_versions_builds.md", "stack_guide_versions_builds.md"),
    ("stack_guide_deployment.md", "stack_guide_stack_guide_deployment.md"),
    ("stack_guide_production.md", "stack_guide_production.md"),
    ("stack_guide_dev_database_credentials.md", "stack_guide_dev_database_credentials.md"),
    ("stack_guide_pre_push_verification.md", "stack_guide_pre_push_verification.md"),
    ("ops_guide_health_uptime.md", "ops_guide_health_uptime.md"),
    ("ops_guide_central_logging.md", "ops_guide_central_logging.md"),
    ("ops_guide_metrics_alerting.md", "ops_guide_metrics_alerting.md"),
    ("ops_guide_kubernetes_helm.md", "ops_guide_kubernetes_helm.md"),
    ("ci_guide_environment_builds.md", "ci_guide_environment_builds.md"),
    ("ci_guide_pipeline_architecture.md", "ci_guide_pipeline_arch_guide_overview.md"),
    ("ci_guide_node_python_django_legacy.md", "ci_guide_node_python_django_legacy.md"),
    ("data_guide_kafka_events.md", "data_guide_kafka_events.md"),
    ("data_guide_prefect_dbt_demo.md", "data_guide_prefect_dbt_demo.md"),
    ("graph_guide_neo4j_phishing.md", "graph_guide_neo4j_phishing.md"),
    ("graph_demo_neo4j_phishing.md", "graph_demo_neo4j_phishing.md"),
    ("tech_neo4j_setup_wsl_windows.md", "tech_neo4j_setup_wsl_windows.md"),
    ("search_guide_elasticsearch_reviews.md", "search_guide_elasticsearch_reviews.md"),
    ("stack_guide_frontend_api.md", "stack_guide_frontend_api.md"),
    ("stack_guide_running_tests.md", "stack_guide_running_tests.md"),
    ("data_guide_mock_llm.md", "data_guide_mock_llm.md"),
    ("ui_guide_analytics_charts.md", "ui_guide_analytics_charts.md"),
    ("auth_guide_rbac.md", "auth_guide_rbac.md"),
    ("roadmap_tbd.md", "roadmap_tbd.md"),
    ("tech_postgresql_dbeaver_windows.md", "tech_postgresql_dbeaver_windows.md"),
    ("tech_postgresql_dbeaver_auth_logs.md", "tech_postgresql_dbeaver_auth_logs.md"),
    ("tech_mongodb_compass_windows.md", "tech_mongodb_compass_windows.md"),
    ("tech_redis_insight_windows.md", "tech_redis_insight_windows.md"),
    ("tech_env_configuration.md", "tech_env_configuration.md"),
    ("tech_cursor_project_rules.md", "tech_tech_cursor_project_rules.md"),
]

SKIP_DIRS = {
    "node_modules",
    ".git",
    "dist",
    "build",
    "coverage",
    ".venv",
}

GLOBS = ("*.md", "*.sh", "*.py", "*.yml", "*.yaml", "*.js", "*.jsx", "*.json")


def should_skip(path: Path) -> bool:
    return any(part in SKIP_DIRS for part in path.parts)


def main() -> None:
    changed = 0
    for pattern in GLOBS:
        for path in ROOT.rglob(pattern):
            if should_skip(path) or not path.is_file():
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            original = text
            for old, new in REPLACEMENTS:
                text = text.replace(old, new)
            if text != original:
                path.write_text(text, encoding="utf-8")
                changed += 1
    print(f"Updated {changed} files.")


if __name__ == "__main__":
    main()
