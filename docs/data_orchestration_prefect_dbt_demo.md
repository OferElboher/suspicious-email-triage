# Data orchestration with Prefect and dbt

This guide explains two **data orchestration / analytics engineering** tools included as educational demos. They read the same PostgreSQL **`review_stats_events`** table the Node API writes for charts. The main triage app does not depend on them — they illustrate patterns you would use in a data platform team.

**Related:** [analytics_and_graphs_guide.md](analytics_and_graphs_guide.md), [architecture.md](architecture.md), [pre_push_tests_and_stack_verification.md](pre_push_tests_and_stack_verification.md).

**Learning tests:** `orchestration/tests/test_prefect_demo.py` and `orchestration/tests/test_dbt_demo.py` include beginner-oriented comments explaining each pattern.

---

## Shared context: where the data comes from

When analysts use the triage UI, the Node API records compact analytics events in PostgreSQL:

| Piece | Technology | Role |
|-------|------------|------|
| Application database | PostgreSQL 16 (`triage_stats`) | Stores `review_stats_events` rows |
| Writer | Node/Express (`backend/src/...`) | Inserts on review lifecycle changes |
| Reader (product) | React Analytics + API metrics | Charts and status bars |
| Reader (demos) | Prefect task + dbt models | Health checks and SQL rollups |

Each event row typically includes **`occurred_at`** (timestamp) and fields the charts aggregate. Prefect counts rows in a time window; dbt rolls them up by day.

---

## Part 1 — Prefect (workflow orchestration)

### What Prefect is

[Prefect](https://docs.prefect.io/) is a Python **workflow orchestrator**. You define:

- **`@task`** — a retriable unit of work (query DB, call API, send alert)
- **`@flow`** — a composition of tasks; the thing you schedule, monitor, and retry

Prefect adds observability (run history, logs, retries) on top of plain Python. Alternatives in industry include Airflow, Dagster, and Temporal; Prefect was chosen here for readable decorators and low ceremony in small demos.

### Pattern implemented in this repo

We use the **“testable core + thin orchestration wrapper”** pattern:

```
review_stats_flow (@flow)
    └── prefect_count_task (@task)   [optional when Prefect installed]
            └── count_review_stats_events()   [plain function — always used]
```

| File | Pattern | Why |
|------|---------|-----|
| `orchestration/prefect_demo/stats_task.py` | Pure function, psycopg3 SQL | CI/tests run without Prefect server or agent |
| `orchestration/prefect_demo/flows.py` | `try: import prefect` / `except ImportError` fallback | Same entrypoint whether or not `pip install prefect` |

The task executes:

```sql
SELECT COUNT(*) FROM review_stats_events WHERE occurred_at >= :window_start
```

That answers an ops question: **“Did we ingest analytics events in the last N hours?”**

### Run locally

Postgres must be reachable (Docker dev stack exposes `localhost:5432`):

```bash
cd ~/suspicious-email-triage
PYTHONPATH=. POSTGRES_HOST=localhost ai_service/.venv/bin/python -c "
from orchestration.prefect_demo.flows import review_stats_flow
print(review_stats_flow(24))
"
```

Example output shape: `{'hours': 24, 'eventCount': 150, 'windowStart': '2026-05-27T...'}`.

Optional: `pip install prefect` then run the same — Prefect registers the flow name `review-stats-health-check` for future scheduling in Prefect Cloud.

### What you would add in production

- Schedule the flow (cron: every hour)
- Alert if `eventCount == 0` when simulation or live traffic is expected
- Run the flow on a worker with network access to Postgres (not in the web container)

---

## Part 2 — dbt (data build tool)

### What dbt is

[dbt](https://docs.getdbt.com/) compiles **versioned SQL models** against your warehouse. Key ideas:

| Concept | Meaning in this demo |
|---------|----------------------|
| **Project** | Folder with `dbt_project.yml` — name `triage_dbt_demo` |
| **Profile** | Connection info in `profiles.yml` — Postgres via `POSTGRES_*` env vars |
| **Source** | Raw table owned elsewhere — `review_stats_events` declared in `models/sources.yml` |
| **Model** | A `SELECT` dbt materializes as view/table — `models/review_stats_daily.sql` |
| **Materialization** | How dbt stores the model — default `view` in `dbt_project.yml` |

dbt does **not** extract or load data (no EL). It **transforms** data already in Postgres — the “T” in ELT pipelines.

### Pattern: raw events → daily rollup

`review_stats_daily.sql` groups events by calendar day using PostgreSQL **`date_trunc('day', occurred_at)`**. That is a standard analytics pattern:

```
review_stats_events (raw, written by Node)
        ↓  dbt model
review_stats_daily (one row per day with event_count)
        ↓  BI tool / Metabase / internal dashboard
Charts and reports
```

### Run locally (parse only)

Install adapter: `pip install dbt-postgres`

```bash
cd ~/suspicious-email-triage/orchestration/dbt_demo
POSTGRES_HOST=localhost POSTGRES_USER=triage POSTGRES_PASSWORD=triage POSTGRES_DB=triage_stats \
  dbt parse --profiles-dir .
```

To materialize models against dev Postgres: `dbt run --profiles-dir .` (creates views in `public` schema).

### What you would add in production

- dbt tests (`unique`, `not_null` on daily keys)
- Documentation blocks in YAML for column descriptions
- CI job: `dbt build` on merge to main
- Separate target in `profiles.yml` for staging/production warehouses

---

## How Prefect and dbt fit together (conceptually)

In a mature analytics stack:

1. **Application** writes raw events (Node → Postgres) — *this repo already does this*
2. **dbt** builds clean rollups and dimensions nightly or hourly
3. **Prefect** orchestrates dbt runs, freshness checks, and alerts if pipelines fail

This repository implements steps 1–2 in miniature and shows Prefect checking step 1 directly (row count) without running dbt in CI.

---

## Tests as learning material

| Test file | What it teaches |
|-----------|-----------------|
| `test_prefect_demo.py` | Mock psycopg to see SQL; flow fallback without Prefect installed |
| `test_dbt_demo.py` | Read `dbt_project.yml`, `sources.yml`, `profiles.yml` structure |

Run:

```bash
ai_service/.venv/bin/pytest orchestration/tests/ -v
```

---

## Pre-push verification

`pytest` includes `orchestration/tests/` — see [pre_push_tests_and_stack_verification.md](pre_push_tests_and_stack_verification.md).
