# Kafka event stream guide — topics, consumer groups, offsets, and reliability

This document explains how the Suspicious Email Triage project uses **Redpanda** (a Kafka-compatible broker) to move work from the Node API to the Python scoring pipeline. You do not need prior Kafka experience: each section builds on the previous one and points to the code you can read in this repository.

**Related:** [worker-architecture.md](worker-architecture.md), [VERSIONS_BUILDS_AND_SIMULATION.md](VERSIONS_BUILDS_AND_SIMULATION.md), [pre_push_tests_and_stack_verification.md](pre_push_tests_and_stack_verification.md).

---

## Why Kafka is here at all

When an analyst submits a suspicious email for review, the API must:

1. Save the review quickly so the UI feels responsive.
2. Hand off heavy work (LLM scoring, enrichment) to background workers without blocking the HTTP request.

Kafka (via Redpanda in local dev) is the **buffer and contract** between those two steps. The API publishes a small JSON event; a Python **dispatcher** consumes it and enqueues a Celery task. If workers are slow or temporarily down, messages wait safely in the topic instead of being lost.

Think of a topic as a **durable append-only log** that many services can read independently.

---

## Core vocabulary (plain language)

| Term | What it means in this project |
|------|-------------------------------|
| **Broker** | Redpanda container (`redpanda:9092` inside Docker; `localhost:19092` from your host). Holds topics and serves clients. |
| **Topic** | Named stream of messages, like `email.review.ingested`. Producers append; consumers read. |
| **Partition** | A topic is split into partitions for parallelism. Messages with the same **key** land on the same partition, preserving order *for that key*. |
| **Producer** | Publishes messages. Here: Node `reviewIngestProducer.js` after a review is stored. |
| **Consumer** | Reads messages. Here: Python `kafka_dispatcher.py`. |
| **Consumer group** | Label shared by competing consumers. The broker assigns each partition to **at most one** consumer in the group so work is divided without duplicate processing. |
| **Offset** | Position of the next message to read in a partition. Committed offsets are bookmarks: “I have finished processing up to here.” |
| **DLQ (dead-letter queue)** | Separate topic for messages that cannot be processed (bad JSON, missing fields). Keeps poison messages from blocking the main stream. |

---

## Topic design in this repo

We use two topics:

| Topic | Purpose | Partitions (dev default) |
|-------|---------|--------------------------|
| `email.review.ingested` | “A review was saved; please score it asynchronously.” | `KAFKA_TOPIC_PARTITIONS` (default **3**) |
| `email.review.ingested.dlq` | Invalid or poison messages with error metadata for debugging/replay | **1** |

**Message key:** `reviewId` (set by the Node producer). Using the review ID as the key means all events for one review go to the **same partition**, which gives you ordering per review even when multiple partitions exist.

**Message value (JSON):**

```json
{"reviewId":"507f1f77bcf86cd799439011","at":"2026-05-24T12:00:00.000Z"}
```

**Code locations:**

- Node producer: `backend/src/kafka/reviewIngestProducer.js`
- Python constants and partition helper: `ai_service/kafka_patterns/topics.py`

**Why more than one partition?** With three partitions and one dispatcher, one consumer reads all three. If you run **two dispatchers** with the same consumer group name, Kafka **rebalances**: each dispatcher owns a subset of partitions. That is the standard way to scale consumption horizontally.

---

## Consumer groups in practice

| Group ID (env) | Service | Role |
|----------------|---------|------|
| `triage-dispatcher` (`KAFKA_GROUP_DISPATCHER`) | `ai-kafka-dispatch` container | Reads `email.review.ingested`, validates payload, enqueues Celery `analyze_review` |

**Experiment (local):** set `KAFKA_TOPIC_PARTITIONS=3`, start two `ai-kafka-dispatch` containers with the same `KAFKA_GROUP_DISPATCHER`, submit several reviews, and watch logs — each container should handle different partitions.

Environment variables: `KAFKA_GROUP_DISPATCHER`, `KAFKA_BROKERS` / `KAFKA_BOOTSTRAP_SERVERS`.

---

## Offsets: auto vs manual commit

An **offset** is how far a consumer has read in each partition. **Committing** an offset tells the broker: “Do not redeliver messages at or before this position to my consumer group.”

| Mode | Environment | Behavior | Trade-off |
|------|-------------|----------|-----------|
| **Manual commit (default)** | `KAFKA_AUTO_COMMIT=false` | Commit **only after** Celery enqueue succeeds | Safer: crash before commit → message redelivered (at-least-once toward workers) |
| Auto commit | `KAFKA_AUTO_COMMIT=true` | Broker commits on a timer while polling | Simpler but can lose work if the process dies after poll but before enqueue |

**Code:** `ai_service/kafka_patterns/offsets.py`, `ai_service/kafka_dispatcher.py`.

**Dev reset:** `POST /dev/reset-local-state` (requires developer role) recreates ingest and DLQ topics with the configured partition count — useful after experiments left bad state.

---

## Reliability patterns implemented here

1. **Validation** — `validate_ingest_payload()` in `ai_service/kafka_patterns/reliability.py` rejects empty bodies and messages missing `reviewId`.
2. **DLQ routing** — invalid messages are copied to `email.review.ingested.dlq` with reason, source topic/partition/offset, and original bytes for forensics.
3. **Partition key** — same `reviewId` → same partition → ordered handling per review.
4. **Soft-fail publish** — if Kafka is unreachable, the API logs and continues (optional BullMQ fallback when enabled).

These patterns mirror production systems: validate early, isolate poison messages, commit offsets only after successful handoff.

**Unit tests (no broker required):** `ai_service/tests/test_kafka_patterns.py`.

---

## Try it locally

```bash
cd ~/suspicious-email-triage
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d redpanda backend ai-kafka-dispatch ai-celery
docker compose -f infra/docker/docker-compose.yml logs -f ai-kafka-dispatch
```

Submit a review from the UI or `POST /reviews`, then confirm dispatcher and Celery logs show the handoff.

Pre-push tests include Python unit coverage for validators and partition helpers — see [pre_push_tests_and_stack_verification.md](pre_push_tests_and_stack_verification.md).
