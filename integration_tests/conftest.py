"""Shared helpers for optional live-stack integration tests (pre-push / CI)."""

from __future__ import annotations

import os
import socket
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
COMPOSE_FILE = ROOT / "infra" / "docker" / "docker-compose.yml"

# Node-owned PostgreSQL tables (triage_stats).
EXPECTED_PG_TABLES = frozenset(
    {
        "auth_users",
        "auth_roles",
        "auth_permissions",
        "auth_role_permissions",
        "auth_user_roles",
        "auth_password_reset_tokens",
        "review_stats_events",
    }
)

# Django contrib.auth tables that must NOT live in Postgres after the SQLite split.
FORBIDDEN_PG_TABLES = frozenset(
    {
        "auth_user",
        "auth_group",
        "auth_permission",
        "auth_group_permissions",
        "auth_user_groups",
        "auth_user_user_permissions",
        "django_session",
        "django_content_type",
        "django_admin_log",
    }
)


def _port_open(host: str, port: int, timeout: float = 0.4) -> bool:
    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def stack_services_up() -> bool:
    """True when core dev ports respond (Postgres + API + Django admin)."""
    return (
        _port_open("127.0.0.1", 5432)
        and _port_open("127.0.0.1", 3000)
        and _port_open("127.0.0.1", 8000)
    )


def mongo_up() -> bool:
    return _port_open("127.0.0.1", 27018)


def redis_up() -> bool:
    return _port_open("127.0.0.1", 6379)


def frontend_up() -> bool:
    return _port_open("127.0.0.1", 3001)


requires_stack = pytest.mark.skipif(
    not stack_services_up(),
    reason="Dev stack not running on localhost:5432, :3000, :8000 — start docker compose or skip",
)

requires_mongo = pytest.mark.skipif(
    not mongo_up(),
    reason="MongoDB not reachable on localhost:27018",
)

requires_redis = pytest.mark.skipif(
    not redis_up(),
    reason="Redis not reachable on localhost:6379",
)

requires_frontend = pytest.mark.skipif(
    not frontend_up(),
    reason="React dev server not running on localhost:3001",
)


def pg_connect():
    import psycopg

    return psycopg.connect(
        host=os.getenv("POSTGRES_HOST", "localhost"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        dbname=os.getenv("POSTGRES_DB", "triage_stats"),
        user=os.getenv("POSTGRES_USER", "triage"),
        password=os.getenv("POSTGRES_PASSWORD", "triage"),
        connect_timeout=3,
    )


def docker_compose_ps_running(service: str) -> bool:
    try:
        out = subprocess.run(
            ["docker", "compose", "-f", str(COMPOSE_FILE), "ps", "--status", "running", service],
            capture_output=True,
            text=True,
            check=False,
            timeout=10,
        )
        return service in out.stdout
    except (OSError, subprocess.TimeoutExpired):
        return False
