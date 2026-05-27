"""
Learning-oriented tests for dbt (data build tool) patterns in this repo.

dbt (https://www.getdbt.com/) transforms data in your warehouse using versioned SQL models:
  - **sources** declare raw tables (here: `review_stats_events` from the Node API)
  - **models** are SELECT statements that dbt materializes as views or tables
  - **profiles.yml** holds connection settings (Postgres host, database, user)

These tests do not run `dbt run` in CI (no warehouse required). They teach project layout and SQL intent.
"""

from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DBT_ROOT = ROOT / "dbt_demo"


def test_dbt_pattern_project_yaml_names_the_analytics_project():
    """
    Pattern: dbt_project.yml is the root manifest.

    `name` identifies the project; `model-paths` tells dbt where SQL models live.
    In a real team, this file also sets default materializations (view vs table).
    """
    text = (DBT_ROOT / "dbt_project.yml").read_text(encoding="utf-8")
    assert "name: triage_dbt_demo" in text
    assert "model-paths" in text
    assert "triage_dbt_demo" in text


def test_dbt_pattern_sources_yml_documents_upstream_tables():
    """
    Pattern: sources.yml documents raw tables owned by other systems.

    Here the Node API owns `review_stats_events`. dbt models reference
    `{{ source('triage_stats', 'review_stats_events') }}` so lineage is explicit.
    """
    text = (DBT_ROOT / "models" / "sources.yml").read_text(encoding="utf-8")
    assert "name: triage_stats" in text
    assert "review_stats_events" in text


def test_dbt_pattern_daily_rollup_model_uses_date_trunc():
    """
    Pattern: staging/rollup models aggregate events for BI tools.

    `review_stats_daily.sql` groups by calendar day using PostgreSQL `date_trunc('day', ...)`.
    That is a typical analytics pattern: raw events → daily counts → charts/dashboards.
    """
    sql = (DBT_ROOT / "models" / "review_stats_daily.sql").read_text(encoding="utf-8")
    assert "review_stats_events" in sql
    assert "date_trunc" in sql.lower()
    assert "group by" in sql.lower()


def test_dbt_pattern_profiles_yml_uses_postgres_env_vars():
    """
    Pattern: profiles.yml connects dbt to the warehouse via environment variables.

    Same POSTGRES_* vars as the dev Docker stack — dbt runs on the host against localhost:5432.
    Production would use secrets manager values instead of plain env vars.
    """
    text = (DBT_ROOT / "profiles.yml").read_text(encoding="utf-8")
    assert "type: postgres" in text
    assert "env_var('POSTGRES_HOST'" in text
    assert "triage_stats" in text


def test_dbt_demo_files_exist_for_local_parse():
    """Sanity: `dbt parse --profiles-dir .` needs project, profile, and at least one model."""
    assert (DBT_ROOT / "dbt_project.yml").is_file()
    assert (DBT_ROOT / "profiles.yml").is_file()
    assert (DBT_ROOT / "models" / "review_stats_daily.sql").is_file()
