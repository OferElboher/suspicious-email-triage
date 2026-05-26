# Data orchestration demo (Prefect + dbt)

Lightweight examples of **workflow orchestration** (Prefect) and **analytics transformation** (dbt) using the same PostgreSQL `review_stats_events` table the Node API writes for charts.

**Related:** [analytics_and_graphs_guide.md](analytics_and_graphs_guide.md), [architecture.md](architecture.md).

---

## Why here?

| Tool | Role in this repo |
|------|-------------------|
| **Prefect** | Orchestrate periodic checks (e.g. “did stats events arrive in the last 24h?”) |
| **dbt** | Document/transform SQL models over `review_stats_events` (daily rollups) |

These are **demos/education**, not production schedulers for the triage app.

---

## Prefect demo

| Path | Purpose |
|------|---------|
| `orchestration/prefect_demo/stats_task.py` | Testable function `count_review_stats_events()` |
| `orchestration/prefect_demo/flows.py` | `@flow` wrapper when Prefect is installed; falls back to plain function |

Run (Postgres up):

```bash
cd ~/suspicious-email-triage
PYTHONPATH=. POSTGRES_HOST=localhost ai_service/.venv/bin/python -c "
from orchestration.prefect_demo.flows import review_stats_flow
print(review_stats_flow(24))
"
```

Install Prefect optionally: `pip install prefect` (not required for tests).

Tests: `orchestration/tests/test_prefect_demo.py`.

---

## dbt demo

| Path | Purpose |
|------|---------|
| `orchestration/dbt_demo/dbt_project.yml` | Mini project `triage_dbt_demo` |
| `orchestration/dbt_demo/models/review_stats_daily.sql` | Daily `event_count` from `review_stats_events` |
| `orchestration/dbt_demo/profiles.yml` | Postgres connection via env vars |

Parse/compile (requires `dbt-postgres`):

```bash
cd orchestration/dbt_demo
POSTGRES_HOST=localhost dbt parse --profiles-dir .
```

Tests: `orchestration/tests/test_dbt_demo.py` (layout + SQL content, no dbt run in CI).

---

## Pre-push

`pytest` includes `orchestration/tests/` — see [pre_push_tests_and_stack_verification.md](pre_push_tests_and_stack_verification.md).
