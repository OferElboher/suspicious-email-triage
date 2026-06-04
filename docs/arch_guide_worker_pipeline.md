# Worker architecture and execution model

Email analysis is intentionally slower than saving a web form, so the system gently separates **accepting a request** from **processing it**.

## Default path

```text
Node API -> Kafka/Redpanda -> Python dispatcher -> Celery/Redis -> Python worker
```

The Node API stores the review in MongoDB, records a compact PostgreSQL statistics event, publishes a Kafka ingest message, and **schedules a Neo4j graph sync**. The Python worker later reads the MongoDB review, updates the result, writes status statistics to PostgreSQL, and **calls the backend internal graph sync** so verdicts and campaigns are updated.

## Why separate processes

Separate processes make the system easier to operate:

- the API can stay responsive,
- workers can be scaled separately,
- scoring failures do not directly crash the browser-facing API,
- statistics can be collected without scanning all MongoDB review documents.

## Legacy Node worker

A Node BullMQ worker still exists under `backend/src/worker/`. It is optional and useful for local experiments or fallback work, but the default Docker Compose path is Kafka + Celery.

## Local dev reset

Development mode includes a reset action that stops simulation, clears MongoDB reviews, truncates PostgreSQL statistics, flushes Redis queues/state, and recreates the local Kafka ingest topic. This keeps long-running demos from growing indefinitely.
---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — WSL, repository root unless noted</p>

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml logs -f --tail=50 ai-celery ai-kafka-dispatch
```

</div>

