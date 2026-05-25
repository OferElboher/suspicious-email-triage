#!/usr/bin/env bash
# cleanup-postgres-django-auth-tables: remove Django contrib.auth tables mistakenly created in Postgres.
#
# Node owns auth_users, auth_roles, auth_permissions (plural), etc. in triage_stats.
# Older django-admin builds ran `migrate` against Postgres and created Django-only tables
# (auth_user singular, auth_group, auth_permission singular, …). Safe to drop those.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT/infra/docker/docker-compose.yml"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  echo "Usage: bash scripts/cleanup-postgres-django-auth-tables.sh"
  echo "Drops Django contrib.auth and django_* session tables from PostgreSQL (triage_stats)."
  echo "Node auth tables (auth_users, auth_roles, auth_permissions, …) are NOT touched."
  exit 0
fi

echo "Removing Django-internal tables from PostgreSQL (if present)…"

docker compose -f "$COMPOSE_FILE" exec -T postgres psql -U triage -d triage_stats <<'SQL'
-- Django contrib.auth (singular table names — not Node auth_users / auth_permissions).
DROP TABLE IF EXISTS auth_user_user_permissions CASCADE;
DROP TABLE IF EXISTS auth_user_groups CASCADE;
DROP TABLE IF EXISTS auth_group_permissions CASCADE;
DROP TABLE IF EXISTS auth_user CASCADE;
DROP TABLE IF EXISTS auth_group CASCADE;
DROP TABLE IF EXISTS auth_permission CASCADE;

-- Django admin/session tables that belonged on Postgres before the SQLite split.
DROP TABLE IF EXISTS django_admin_log CASCADE;
DROP TABLE IF EXISTS django_session CASCADE;
DROP TABLE IF EXISTS django_content_type CASCADE;
DELETE FROM django_migrations WHERE app IN ('auth', 'admin', 'contenttypes', 'sessions');
DROP TABLE IF EXISTS django_migrations CASCADE;
SQL

echo "Done. Refresh DBeaver. Django admin now stores sessions in SQLite (django-admin container volume)."
echo "See docs/django_admin_user_management.md and docs/pre_push_tests_and_stack_verification.md."
