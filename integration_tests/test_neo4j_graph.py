"""Optional live Neo4j integration checks — skipped when the graph container is down."""

from __future__ import annotations

import os

import pytest

neo4j_uri = os.environ.get("NEO4J_URI", "bolt://localhost:7687")


def _neo4j_reachable() -> bool:
    try:
        from neo4j import GraphDatabase

        driver = GraphDatabase.driver(
            neo4j_uri,
            auth=(
                os.environ.get("NEO4J_USER", "neo4j"),
                os.environ.get("NEO4J_PASSWORD", "triage-neo4j-dev"),
            ),
        )
        driver.verify_connectivity()
        driver.close()
        return True
    except Exception:
        return False


pytestmark = pytest.mark.skipif(
    not _neo4j_reachable(),
    reason="Neo4j not reachable — start docker compose neo4j service for live graph tests",
)


def test_neo4j_returns_version():
    """Sanity check that Bolt connectivity works when the dev stack is running."""
    from neo4j import GraphDatabase

    driver = GraphDatabase.driver(
        neo4j_uri,
        auth=(
            os.environ.get("NEO4J_USER", "neo4j"),
            os.environ.get("NEO4J_PASSWORD", "triage-neo4j-dev"),
        ),
    )
    with driver.session() as session:
        record = session.run("RETURN 1 AS ok").single()
        assert record["ok"] == 1
    driver.close()
