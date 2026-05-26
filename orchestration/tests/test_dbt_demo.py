"""Tests for dbt demo project layout (no dbt run required in CI)."""

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DBT_ROOT = ROOT / "dbt_demo"


def test_dbt_project_files_exist():
    """dbt demo includes project, profile, and at least one model."""
    assert (DBT_ROOT / "dbt_project.yml").is_file()
    assert (DBT_ROOT / "profiles.yml").is_file()
    assert (DBT_ROOT / "models" / "review_stats_daily.sql").is_file()


def test_dbt_model_references_review_stats_events():
    """Model SQL targets the same Postgres table the Node API writes."""
    sql = (DBT_ROOT / "models" / "review_stats_daily.sql").read_text(encoding="utf-8")
    assert "review_stats_events" in sql
    assert "date_trunc" in sql
