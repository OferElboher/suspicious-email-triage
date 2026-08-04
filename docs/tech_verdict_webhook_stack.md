# Verdict webhook technology primer

This document explains the **technologies and patterns** used for **outbound verdict delivery** in plain language. Read [data_guide_verdict_webhooks.md](data_guide_verdict_webhooks.md) for operational steps and API shapes.

**Audience:** developers new to webhooks, HMAC signatures, or event-driven mail integrations.

---

## Webhook (HTTP callback)

A **webhook** is an HTTP **POST** your service sends to a **customer URL** when something happens — here, when email analysis finishes.

| Term | Meaning |
|------|---------|
| **Producer** | This triage app (Node `verdictDelivery.js`) |
| **Consumer** | Customer mail adapter at `callbackUrl` |
| **Payload** | JSON body with `verdict`, `externalMessageId`, etc. |

Unlike a browser calling your API, the **server initiates** the connection after async work completes.

---

## HMAC signature (`X-Verdict-Signature`)

**HMAC** (Hash-based Message Authentication Code) proves the POST was signed by someone who knows a **shared secret** — without putting the secret in the URL.

**Pattern:** GitHub, Stripe, and many SEG integrations use the same approach.

1. Serialize payload to JSON string (exact bytes matter).
2. Compute `HMAC-SHA256(secret, body)` → hex string.
3. Send hex in header `X-Verdict-Signature`.
4. Receiver recomputes HMAC and compares (use **timing-safe** compare in production).

**Implementation:** `backend/src/lib/verdictCallbackSign.js` — Node built-in `crypto.createHmac`.

**Secret storage:** `VERDICT_CALLBACK_HMAC_SECRET` in AWS Secrets Manager (staging/prod) or gitignored `dev.secrets` (local).

---

## Fire-and-forget scheduling

Verdict delivery must **not block** Celery or the analyst override HTTP response.

**Pattern:** `scheduleVerdictDelivery(reviewId)` uses `setImmediate` to run `deliverVerdictForReview` on the next event-loop tick — same style as `scheduleSnowflakeExport` and `scheduleGraphSync`.

---

## Internal service token (not JWT)

Celery (Python) calls Node **`POST /ingest/internal/verdict-deliver/:id`** with header **`X-Ingest-Internal-Token`**.

| Why not JWT? | Workers are long-lived services, not logged-in users. A static shared secret matches `graphInternal.js` and `ingestInternal.js`. |
| Rotation | Update `INGEST_INTERNAL_TOKEN` in secrets manager and restart Go + Celery + backend containers together. |

---

## Kafka completion topic

**Kafka** (Redpanda in dev) is a **durable event log**. Publishing `email.review.completed` lets mail adapters **subscribe** instead of exposing HTTPS.

**Technology:** KafkaJS producer (`reviewCompletedProducer.js`), partition key = `reviewId` (same stickiness as ingest topic).

---

## Mock receiver in dev

**mock-verdict-callback** is a tiny Node `http` server (pattern copied from `mock-aws-s3`) that stores POST bodies in memory so you can demo end-to-end verdict return **without** a real SEG tenant.

---

## Related files

| File | Role |
|------|------|
| `backend/src/services/verdictDelivery.js` | Webhook POST + Mongo audit |
| `backend/src/api/ingestInternal.js` | Ingest + poll + deliver routes |
| `ai_service/app/verdict_delivery.py` | Celery → Node trigger |
| `infra/mock-verdict-callback/server.js` | Dev receiver |
| `shared/phishing_simulation_templates.json` | Demo email scenarios |

```bash
cd ~/suspicious-email-triage
bash scripts/test-all.sh
```
