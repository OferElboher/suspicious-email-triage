"""Live PostgreSQL schema checks (skipped when stack is down)."""

from integration_tests.conftest import (
    EXPECTED_PG_TABLES,
    FORBIDDEN_PG_TABLES,
    pg_connect,
    requires_stack,
)


@requires_stack
def test_postgres_has_node_auth_tables():
    with pg_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                """
            )
            names = {row[0] for row in cur.fetchall()}

    missing = EXPECTED_PG_TABLES - names
    assert not missing, f"Missing expected tables: {sorted(missing)}"


@requires_stack
def test_postgres_has_no_django_contrib_auth_tables():
    with pg_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT table_name FROM information_schema.tables
                WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
                """
            )
            names = {row[0] for row in cur.fetchall()}

    overlap = FORBIDDEN_PG_TABLES & names
    assert not overlap, (
        "Django-internal tables found in Postgres — run "
        "bash scripts/cleanup-postgres-django-auth-tables.sh"
    )


@requires_stack
def test_postgres_auth_users_has_expected_columns():
    with pg_connect() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_schema = 'public' AND table_name = 'auth_users'
                """
            )
            columns = {row[0] for row in cur.fetchall()}

    assert columns >= {"id", "email", "password_hash", "is_active", "created_at", "updated_at"}
    assert "last_login" not in columns
