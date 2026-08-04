# Outbound verdict webhooks — mail platform integration guide

This guide explains how **Suspicious Email Triage** returns analysis **verdicts** to email servers and secure email gateways (SEGs) after mailbox ingest. It covers the **webhook POST** pattern, the **polling API**, optional **Kafka completion events**, and the **dev mock receiver** used in Docker Compose.

**Audience:** developers wiring Microsoft Graph, Gmail, Postfix, or a commercial SEG to this product — including readers new to webhooks and async triage.

**Related:** [data_guide_mailbox_ingest_gateway.md](data_guide_mailbox_ingest_gateway.md), [tech_verdict_webhook_stack.md](tech_verdict_webhook_stack.md), [ui_guide_mailbox_ingest.md](ui_guide_mailbox_ingest.md), [ops_guide_secrets_management.md](ops_guide_secrets_management.md).

---

## Why verdicts are not returned at ingest time

When a mail platform calls `POST /v1/ingest/email` on the Go **ingest-gateway**, the response is **`201 Created`** with `{ id, status: "pending" }` — **not** a final verdict. Analysis runs asynchronously:

```text
Ingest (201 pending) → Kafka → Celery → rule_engine + LLM/agent → status completed
                                                              ↓
                                    Outbound verdict webhook (this guide)
```

**Pattern:** **Async SOC triage** — the edge accepts mail quickly; scoring takes seconds. Mail platforms that need a final action (quarantine, release, label) should either **wait for the webhook** or **poll** the verdict API documented below.

---

## Correlation fields on ingest

Extend the mailbox ingest JSON body with optional correlation fields:

| Field | Meaning |
|-------|---------|
| `externalMessageId` | The mail platform’s message identifier (Graph message id, Postfix queue id, etc.) — echoed in the verdict webhook so your adapter knows which message to act on. |
| `callbackUrl` | Optional **per-message** webhook URL. When set, it overrides the environment default `VERDICT_CALLBACK_URL`. |

**Design choice:** We store both fields on the MongoDB **Review** document. There is **no separate Postgres tenant table** in this repo yet — per-tenant defaults use **`VERDICT_CALLBACK_URL`** in `.env` / AWS Secrets Manager; per-message overrides use `callbackUrl` on high-volume integrations.

Example ingest body (Go `:8080/v1/ingest/email` or Node `POST /ingest/internal/mailbox`):

```bash
curl -sS -X POST "http://localhost:8080/v1/ingest/email" \
  -H "Content-Type: application/json" \
  -d '{
    "senderName": "Alerts",
    "senderEmail": "alert@example.com",
    "subject": "Invoice attached",
    "body": "Please review...",
    "externalMessageId": "AAMkAGI2TG93AAA=",
    "callbackUrl": "https://your-seg.example/verdict-hook"
  }'
```

---

## Outbound webhook (primary integration)

When a review reaches **`completed`** (or an analyst saves an **override**), Node **POSTs JSON** to the resolved callback URL.

**Technology:** Node `fetch`, **HMAC-SHA256** signature in header `X-Verdict-Signature` (same idea as GitHub webhooks — shared secret, no JWT on the customer endpoint).

**Implementation:** `backend/src/services/verdictDelivery.js`, triggered from:

- Celery `analyze_review` → `ai_service/app/verdict_delivery.py` → `POST /ingest/internal/verdict-deliver/:id`
- Analyst override → `scheduleVerdictDelivery` in `backend/src/api/reviews.js`

### Webhook payload shape

```json
{
  "reviewId": "507f1f77bcf86cd799439011",
  "externalMessageId": "AAMkAGI2TG93AAA=",
  "status": "completed",
  "verdict": "likely_phishing",
  "recommendedAction": "report_and_block",
  "effectiveVerdict": "likely_phishing",
  "source": "mailbox_ingest",
  "reason": "analysis_complete",
  "completedAt": "2026-08-03T14:00:00.000Z",
  "analysisVerdict": "likely_phishing",
  "overrideVerdict": null
}
```

| Header | Meaning |
|--------|---------|
| `Content-Type` | `application/json` |
| `X-Verdict-Signature` | Hex HMAC-SHA256 of the raw JSON body using `VERDICT_CALLBACK_HMAC_SECRET` |
| `X-Verdict-Event` | `analysis_complete` or `override` |

**Retries:** Up to **3** in-process attempts with short backoff. Failures are recorded on `review.verdictDelivery` in MongoDB for the **#ingest** dashboard.

### Environment variables

| Variable | Where | Meaning |
|----------|-------|---------|
| `VERDICT_CALLBACK_URL` | `backend/.env.dev` (committed name, not secret) | Default webhook URL when ingest omits `callbackUrl` |
| `VERDICT_CALLBACK_HMAC_SECRET` | gitignored `backend/dev.secrets` | Shared secret for HMAC — **never commit real values** |
| `VERDICT_DELIVERY_ENABLED` | `.env.dev` | When `false`, Celery skips dispatch (tests/CI) |
| `VERDICT_CALLBACK_TIMEOUT_MS` | optional | Outbound HTTP timeout (default 8000 ms) |

Dev Docker default: `VERDICT_CALLBACK_URL=http://mock-verdict-callback:4569/webhook`

---

## Polling API (alternative integration)

Mail platforms that cannot receive inbound HTTP can **poll** Node with the same internal token used for ingest.

**Route:** `GET /ingest/internal/verdict/:reviewId`  
**Auth:** `X-Ingest-Internal-Token` (same as `INGEST_INTERNAL_TOKEN` in dev.secrets — **not** analyst JWT)

```bash
curl -sS "http://localhost:3000/ingest/internal/verdict/REVIEW_ID" \
  -H "X-Ingest-Internal-Token: YOUR_INGEST_INTERNAL_TOKEN"
```

Response includes `status`, `verdict`, `recommendedAction`, `externalMessageId`, and `verdictDelivery` audit fields.

**Pattern:** **Poll after 201** — store `reviewId` from ingest response; poll until `status` is `completed` or `failed`.

---

## Kafka completion event (optional)

After a **successful** webhook POST, Node may publish **`email.review.completed`** (Kafka/Redpanda) with the same JSON fields. Disable with `VERDICT_KAFKA_COMPLETED=false`.

**Technology:** KafkaJS producer in `backend/src/kafka/reviewCompletedProducer.js` — mail adapters can consume events instead of hosting HTTPS webhooks.

**Topic env:** `KAFKA_TOPIC_REVIEW_COMPLETED` (default `email.review.completed`)

---

## Dev mock receiver

Service **`mock-verdict-callback`** (port **4569**) simulates a customer SEG endpoint:

| Route | Method | Purpose |
|-------|--------|---------|
| `/webhook` | POST | Receives verdict JSON; validates HMAC |
| `/callbacks` | GET | Lists received payloads (for demos) |
| `/stats` | GET | Counts by verdict |
| `/health` | GET | Liveness |

The React **#ingest** tab includes **Outbound verdict delivery** stats (see [ui_guide_mailbox_ingest.md](ui_guide_mailbox_ingest.md)).

```bash
curl -sS "http://localhost:4569/stats"
curl -sS "http://localhost:4569/callbacks?limit=10"
```

---

## Phishing-aware dev simulation

Go mailbox simulation and Node dev simulation **rotate templates** from `shared/phishing_simulation_templates.json` so demos exercise every **rule_engine** heuristic:

| Template id | Expected verdict |
|-------------|------------------|
| `url_phishing` | `likely_phishing` (URL hostname hints) |
| `credential_phishing` | `likely_phishing` (password/MFA keywords) |
| `urgent_link` | `suspicious` (urgent + http) |
| `benign_newsletter` | `benign` |

Each simulated message includes an **`externalMessageId`** like `dev-sim-url_phishing-42` so mock webhook rows are easy to correlate in the UI.

---

## Security notes

- **Never** paste `VERDICT_CALLBACK_HMAC_SECRET` or `INGEST_INTERNAL_TOKEN` into markdown or tickets — read from gitignored `backend/dev.secrets` locally.
- Verify `X-Verdict-Signature` on your receiver before quarantining mail.
- Use HTTPS for production `callbackUrl` targets; dev mock uses plain HTTP inside the Docker network only.

---

## Tests

```bash
cd ~/suspicious-email-triage/backend
npm test -- --watchAll=false --testPathPattern="verdictDelivery|ingestInternal|verdictCallbackSign"

cd ~/suspicious-email-triage
ai_service/.venv/bin/pytest ai_service/tests/test_verdict_delivery.py -v
```

See also [stack_guide_running_tests.md](stack_guide_running_tests.md).
