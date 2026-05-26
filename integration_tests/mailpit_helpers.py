"""Fetch first admin user email from Postgres for integration tests."""

import subprocess

from integration_tests.conftest import COMPOSE_FILE, ROOT


def first_auth_user_email() -> str | None:
    """Return the first auth_users.email row or None when table is empty."""
    result = subprocess.run(
        [
            "docker",
            "compose",
            "-f",
            str(COMPOSE_FILE),
            "exec",
            "-T",
            "postgres",
            "psql",
            "-U",
            "triage",
            "-d",
            "triage_stats",
            "-tAc",
            "SELECT email FROM auth_users ORDER BY id LIMIT 1;",
        ],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )
    email = (result.stdout or "").strip()
    return email or None
