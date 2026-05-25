"""Live PostgreSQL schema checks (skipped when stack is down)."""

from integration_tests.conftest import (
    EXPECTED_PG_TABLES,
    FORBIDDEN_PG_TABLES,
    pg_connect,
    pg_table_columns,
    requires_stack,
)


@requires_stack
def test_postgres_has_node_auth_tables():
    """All Node auth and metrics tables must exist in triage_stats."""
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
    """Django-internal tables must live in SQLite, not Postgres."""
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
    """auth_users matches Node schema (no Django last_login column)."""
    columns = pg_table_columns("auth_users")
    assert columns >= {"id", "email", "password_hash", "is_active", "created_at", "updated_at"}
    assert "last_login" not in columns


@requires_stack
def test_postgres_auth_user_roles_has_composite_pk_not_id():
    """Junction table uses (user_id, role_id) PK — Django must not SELECT id."""
    columns = pg_table_columns("auth_user_roles")
    assert "user_id" in columns and "role_id" in columns
    assert "id" not in columns


@requires_stack
def test_postgres_auth_role_permissions_has_composite_pk_not_id():
    """Role-permission junction table also has no surrogate id column."""
    columns = pg_table_columns("auth_role_permissions")
    assert "role_id" in columns and "permission_id" in columns
    assert "id" not in columns
