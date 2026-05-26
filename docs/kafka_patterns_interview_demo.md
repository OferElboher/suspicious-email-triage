# Kafka patterns interview demo — topic design, consumer groups, offsets, reliability

This project’s **primary async path** uses Redpanda/Kafka for review ingest. The `ai_service/kafka_patterns/` package and updated dispatcher illustrate interview talking points.

**Related:** [worker-architecture.md](worker-architecture.md), [VERSIONS_BUILDS_AND_SIMULATION.md](VERSIONS_BUILDS_AND_SIMULATION.md).

---

## Topic design

| Topic | Purpose | Partitions (dev) |
|-------|---------|------------------|
| `email.review.ingested` | Domain event: review persisted, ready for scoring | `KAFKA_TOPIC_PARTITIONS` (default **3**) |
| `email.review.ingested.dlq` | Dead-letter queue for invalid/poison messages | 1 |

**Message key:** `reviewId` (Node producer) — keeps all events for one review on the same partition (ordering per review).

**Message value:** `{"reviewId":"...","at":"ISO8601"}`

Code: `backend/src/kafka/reviewIngestProducer.js`, `ai_service/kafka_patterns/topics.py`.

---

## Consumer groups

| Group | Service | Role |
|-------|---------|------|
| `triage-dispatcher` | `ai-kafka-dispatch` container | Reads ingest topic, enqueues Celery |

Run **two dispatchers** with the same `KAFKA_GROUP_DISPATCHER` and `KAFKA_TOPIC_PARTITIONS=3` to demo partition assignment (each consumer owns a subset of partitions).

Env: `KAFKA_GROUP_DISPATCHER`, `KAFKA_BROKERS`.

---

## Offset management

| Mode | Env | Behavior |
|------|-----|----------|
| **Manual commit (default demo)** | `KAFKA_AUTO_COMMIT=false` | Commit **after** successful `analyze_review.delay()` |
| Auto commit (legacy) | `KAFKA_AUTO_COMMIT=true` | Broker commits on poll interval (at-most-once toward Celery) |

Code: `ai_service/kafka_patterns/offsets.py`, `ai_service/kafka_dispatcher.py`.

**Dev reset:** `POST /dev/reset-local-state` (developer role) recreates ingest + DLQ topics with configured partition count.

---

## Reliability patterns

1. **Validation** — `validate_ingest_payload()` rejects missing `reviewId`.
2. **DLQ** — invalid messages copied to `email.review.ingested.dlq` with source offset metadata.
3. **Partition key** — same `reviewId` → same partition.
4. **Soft-fail publish** — API logs and continues if Kafka is down (optional BullMQ fallback).

Tests: `ai_service/tests/test_kafka_patterns.py`.

---

## Try it locally

```bash
DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d redpanda backend ai-kafka-dispatch ai-celery
docker compose -f infra/docker/docker-compose.yml logs -f ai-kafka-dispatch
# Submit a review via UI or POST /reviews — watch dispatch + Celery logs
```

Pre-push tests include unit coverage for validators and partition helpers — see [pre_push_tests_and_stack_verification.md](pre_push_tests_and_stack_verification.md).
