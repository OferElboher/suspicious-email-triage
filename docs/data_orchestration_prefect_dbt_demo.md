# Data orchestration with Prefect and dbt

This guide walks through two common data-engineering tools included as **educational demos** in this repository. They sit beside the main triage application: the app keeps running if you never touch Prefect or dbt, but the examples show how you might **orchestrate checks** and **transform analytics SQL** on the same PostgreSQL statistics table the Node API already writes.

**Related:** [analytics_and_graphs_guide.md](analytics_and_graphs_guide.md), [architecture.md](architecture.md), [pre_push_tests_and_stack_verification.md](pre_push_tests_and_stack_verification.md).

---

## The shared data source

The Node API inserts narrow rows into PostgreSQL table **`review_stats_events`** (database `triage_stats`). Each row records something chart-friendly: which review changed, what kind of event it was, and when it happened. The React **Analytics** screen reads aggregated views of this data.

Prefect and dbt demos both **read** that table. They do not replace the API or change how reviews are triaged.

---

## Prefect — workflow orchestration in plain terms

**Prefect** is a Python library for defining **tasks** and **flows**. A task is one unit of work (query the database, send an alert). A flow wires tasks together and can be scheduled, retried, and observed in a Prefect UI when you run a full Prefect server (not required for this demo).

### Why it appears in this repo

Operations teams often want automated questions such as: “Did we receive any stats events in the last 24 hours?” or “If the count is zero, page someone.” Prefect expresses that as code instead of a one-off cron script with no structure.

### What we ship

| Path | Purpose |
|------|---------|
| `orchestration/prefect_demo/stats_task.py` | Pure function `count_review_stats_events(hours)` — easy to unit test without Prefect installed |
| `orchestration/prefect_demo/flows.py` | Wraps the function in a `@flow` when Prefect is available; otherwise calls the function directly |

The flow accepts `hours` (look-back window) and returns how many events matched. That is intentionally small so you can read the entire demo in a few minutes.

### Run it yourself (Postgres must be up)

```bash
cd ~/suspicious-email-triage
PYTHONPATH=. POSTGRES_HOST=localhost ai_service/.venv/bin/python -c "
from orchestration.prefect_demo.flows import review_stats_flow
print(review_stats_flow(24))
"
```

Install Prefect optionally for decorators and future scheduling: `pip install prefect`. Tests do **not** require it.

**Tests:** `orchestration/tests/test_prefect_demo.py`.

---

## dbt — analytics transformations in plain terms

**dbt (data build tool)** lets analysts and engineers write **SELECT** statements as versioned **models**, document them, and compile a directed graph of dependencies (model A feeds model B). dbt runs against your warehouse — here, the same PostgreSQL dev instance.

### Why it appears in this repo

Chart APIs often start with ad-hoc SQL in application code. dbt shows how to move rollups (daily counts, funnel metrics) into a maintainable project with tests and documentation — a pattern common in analytics engineering teams.

### What we ship

| Path | Purpose |
|------|---------|
| `orchestration/dbt_demo/dbt_project.yml` | Mini project named `triage_dbt_demo` |
| `orchestration/dbt_demo/models/review_stats_daily.sql` | Daily `event_count` grouped from `review_stats_events` |
| `orchestration/dbt_demo/models/sources.yml` | Declares `review_stats_events` as a dbt **source** |
| `orchestration/dbt_demo/profiles.yml` | Postgres connection via environment variables (`POSTGRES_HOST`, etc.) |

The daily model is a starting point: in a real deployment you would add tests (`unique`, `not_null`), exposures, and run `dbt run` on a schedule.

### Parse / compile locally (requires `dbt-postgres`)

```bash
cd ~/suspicious-email-triage/orchestration/dbt_demo
POSTGRES_HOST=localhost dbt parse --profiles-dir .
```

CI runs layout and SQL content tests without executing dbt against a live database.

**Tests:** `orchestration/tests/test_dbt_demo.py`.

---

## How this relates to production

These folders are **demos**, not production schedulers for the triage app:

- Prefect could run on a timer in Kubernetes or Prefect Cloud to monitor stats freshness.
- dbt could publish `review_stats_daily` to a BI tool while the API keeps serving real-time charts.

Neither is wired into Docker Compose by default; enabling them is a deliberate ops choice.

---

## Pre-push verification

`pytest` includes `orchestration/tests/` alongside `ai_service/tests` and `integration_tests`. See [pre_push_tests_and_stack_verification.md](pre_push_tests_and_stack_verification.md) for the full matrix.
