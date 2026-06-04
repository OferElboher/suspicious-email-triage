# CI Pipeline Architecture — Distributed AI Demo

This document describes the **final, production‑style CI pipeline** for the Distributed AI Demo project.

The pipeline is intentionally **layered**, allowing failures to stop early, keeping errors clear, and minimizing runtime.

---

# Goals

The CI pipeline ensures that every commit:

* builds in a clean environment
* installs dependencies via Poetry
* validates code quality
* runs Django unit tests
* validates DB integration
* validates Celery workers
* validates Kafka pipeline
* builds Docker images
* (future) deploys automatically

The pipeline is structured to fail **as early as possible**.

---

# High-Level Pipeline

```
Lint / Format
      ↓
Unit Tests (pure Python)
      ↓
Django + Postgres tests
      ↓
Redis + Celery tests
      ↓
Kafka integration tests
      ↓
Distributed pipeline test (E2E)
      ↓
Docker build
      ↓
( future ) deployment
```

---

# Pipeline Layers

## Layer 1 — Lint & Formatting (Fastest)

Purpose:

* catch syntax errors
* enforce style
* prevent broken commits

Runs:

* ruff check
* ruff format --check
* trailing whitespace fixer

No services required.

Runtime: depends on the actual linting rules and codebase size

---

## Layer 2 — Unit Tests (Python Only)

Purpose:

* validate pure Python logic
* serializer logic
* utilities
* task logic (mocked)

Runs:

* Django tests without external services

No services required.

Runtime: depends on the actual Python unit tests and their scope (mocking vs real logic)

---

## Layer 3 — Database Integration Tests

Purpose:

* validate Django models
* migrations
* ORM queries
* API endpoints

Services started:

* PostgreSQL

Steps:

* run migrations
* run Django tests

Runtime: depends on Django migration state, DB schema complexity, and query load in tests

---

## Layer 4 — Redis + Celery Tests

Purpose:

* validate background tasks
* Celery queue
* worker execution

Services started:

* Redis
* Celery worker

Tests:

* enqueue task
* wait for completion
* verify DB result

Runtime: depends on Redis availability, Celery configuration, task complexity, and worker behavior

---

## Layer 5 — Kafka Integration Tests

Purpose:

* validate Kafka producer
* validate Kafka consumer
* validate event flow

Services started:

* Zookeeper
* Kafka broker

Tests:

* produce event
* consume event
* verify processing

Runtime: depends on Kafka broker startup time, topic configuration, message volume, and consumer processing logic

---

## Layer 6 — End‑to‑End Distributed Pipeline Test

Purpose:

Validate full system:

REST API → Kafka → Celery → AI worker → DB

Services started:

* PostgreSQL
* Redis
* Kafka
* Celery worker
* Django app

Test:

* call REST endpoint
* verify Kafka message
* verify Celery execution
* verify DB result

Runtime: depends on the actual end-to-end pipeline complexity (REST → Kafka → Celery → worker → DB) and system synchronization requirements

---

## Layer 7 — Docker Build

Purpose:

Ensure production containers build correctly.

Builds:

* Django backend image
* worker image
* kafka tools (optional)

No tests executed.

Runtime: depends on Dockerfile efficiency (layer caching), dependency installation time (Poetry installs), and overall project size

---

# Failure Behavior

Each layer depends on the previous one.

If a layer fails:

* pipeline stops
* later layers are skipped
* failure is isolated

Example:

```
✔ lint
✔ unit-tests
✖ postgres-tests
⏭ celery-tests (skipped)
⏭ kafka-tests (skipped)
⏭ docker-build (skipped)
```

This makes debugging straightforward.

---

# GitHub Actions Job Graph

Final dependency structure:

```
lint
  ↓
unit-tests
  ↓
postgres-tests
  ↓
celery-tests
  ↓
kafka-tests
  ↓
e2e-tests
  ↓
docker-build
```

---

# Parallelization (Optional Optimization)

Some jobs can run in parallel:

```
          lint
        /      \
   format     type-check
        \      /
        unit-tests
             ↓
        integration
```

This reduces CI runtime.

---

# Services Used in CI

## PostgreSQL

Used for:

* Django ORM tests
* migrations
* API tests

---

## Redis

Used for:

* Celery broker
* async tasks

---

## Kafka

Used for:

* event pipeline
* producer/consumer tests

---

## Celery Worker

Used for:

* background processing
* AI worker simulation

---

# Local vs CI Responsibilities

Local development:

* pre-commit hooks
* fast lint
* quick tests

CI pipeline:

* full distributed tests
* container build
* environment validation

---

# CI Trigger Events

Pipeline runs on:

* push to main
* pull request to main

Optional future:

* nightly full integration run
* release builds

---

# Optional CD (Continuous Deployment)

After CI succeeds:

```
CI success
    ↓
Build images
    ↓
Push to registry
    ↓
Deploy staging
    ↓
Run smoke tests
    ↓
Deploy production
```

Deployment targets (optional):

* Fly.io
* Render
* Railway
* Kubernetes
* self-hosted VPS

---

# Pipeline Design Principles

The CI pipeline follows:

1. Fail fast
2. Test smallest scope first
3. Add services gradually
4. Keep runtime short
5. Separate unit vs integration tests
6. Test distributed flow explicitly
7. Build containers last

---

# Estimated Final Runtime

| Layer        | Time                                                                                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| lint         | Runtime: depends on the actual linting rules and codebase size                                                                              |
| unit tests   | Runtime: depends on the actual Python unit tests and their scope (mocking vs real logic)                                                    |
| postgres     | Runtime: depends on Django migration state, DB schema complexity, and query load in tests                                                   |
| celery       | Runtime: depends on Redis availability, Celery configuration, task complexity, and worker behavior                                          |
| kafka        | Runtime: depends on Kafka broker startup time, topic configuration, message volume, and consumer processing logic                           |
| e2e          | Runtime: depends on the actual end-to-end pipeline complexity (REST → Kafka → Celery → worker → DB) and system synchronization requirements |
| docker build | Runtime: depends on Dockerfile efficiency (layer caching), dependency installation time (Poetry installs), and overall project size         |

Total runtime is variable and depends on implementation details and CI environment conditions.

---

# Result

This pipeline provides:

* production-grade CI
* distributed system validation
* fast debugging
* deterministic builds
* safe refactoring
* deployment readiness

---

# End of Document
