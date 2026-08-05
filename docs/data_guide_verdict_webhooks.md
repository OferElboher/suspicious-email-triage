# Outbound verdict webhooks — mail platform integration guide

This guide explains how **Suspicious Email Triage** returns analysis **verdicts** to email servers and **SEGs** (Secure Email Gateways) after mailbox ingest. It covers **per-client webhook registration**, the **HTTP POST webhook** pattern, **HMAC** signatures, **polling**, optional **Kafka** events, and the **dev mock receiver**.

**Audience:** developers wiring Microsoft Graph, Gmail, Postfix, or a commercial SEG — including readers new to webhooks and async triage.

**Related:** [data_guide_mailbox_ingest_gateway.md](data_guide_mailbox_ingest_gateway.md), [ui_guide_mailbox_ingest.md](ui_guide_mailbox_ingest.md), [ops_guide_secrets_management.md](ops_guide_secrets_management.md), [util_acronym_glossary.md](util_acronym_glossary.md).

---

## Why verdicts are not returned at ingest time

When a mail platform calls `POST /v1/ingest/email` on the Go **ingest-gateway**, the response is **`201 Created`** with `{ id, status: "pending" }` — **not** a final verdict. Analysis runs asynchronously:

```text
Ingest (201 pending) → Kafka → Celery → rule_engine + LLM/agent → status completed
                                                              ↓
                         Outbound verdict webhook (this guide)
```

**Pattern:** **Async SOC triage** — the edge accepts mail quickly; scoring takes seconds. Platforms that need quarantine/release actions should **receive the webhook** or **poll** the verdict API below.

---

## How each mail platform gets its own default webhook URL

A single global `VERDICT_CALLBACK_URL` is only meaningful for **one-tenant dev demos**. Real deployments have **many customers**, each with its own SEG adapter URL.

### Postgres `ingest_clients` registry

**Technology:** PostgreSQL table `ingest_clients` in the same stats database as chart events (`backend/src/ingest/ingestClientsPg.js`).

| Column | Meaning |
|--------|---------|
| `client_id` | Stable slug your adapter sends on every ingest (e.g. `contoso-graph`, `fabrikam-postfix`) |
| `display_name` | Human label for admin UI |
| `callback_url` | Default HTTPS webhook for that platform |
| `is_active` | When `false`, ingest with that id is rejected |

**Dev seeds** (inserted idempotently on first use):

| client_id | Purpose |
|-----------|---------|
| `dev-mock` | Default for Go/Node simulation → `mock-verdict-callback:4569` |
| `dev-contoso-graph` | Example Microsoft Graph adapter |
| `dev-fabrikam-postfix` | Example Postfix milter adapter |

### Callback URL resolution priority

When Celery finishes scoring (or an analyst saves an **override**), Node must decide **which HTTPS URL** receives the outbound verdict webhook. Only **one** URL is used per delivery attempt. The lookup runs inside `resolveCallbackUrl()` in `backend/src/services/verdictDelivery.js` and follows this order:

| Priority | Source | When to use |
|----------|--------|-------------|
| **1 (highest)** | `callbackUrl` on the individual Review document | One-off override for a single message (e.g. staging test against a temporary endpoint) |
| **2** | Postgres `ingest_clients.callback_url` for the Review's `ingestClientId` | Normal production path — each mail platform registers once and sends the same `ingestClientId` on every ingest |
| **3 (lowest)** | `VERDICT_CALLBACK_URL` environment variable | **Dev/single-tenant fallback only** when no per-message URL and no `ingestClientId` were stored |

**Important:** `VERDICT_CALLBACK_URL` is **not** a per-customer setting. It exists so local Docker demos can deliver verdicts without registering a client row. Multi-tenant deployments should register every platform in `ingest_clients` instead.

#### How a mail platform registers its own default webhook URL

A platform integration team needs a stable **`ingestClientId`** (slug) and a **`callback_url`** (where Node POSTs the verdict JSON). This repo supports **three registration paths**:

**Path 1 — Self-service HTTP (automation / the platform registers itself)**

The platform's adapter calls the registration API with a shared secret **`INGEST_CLIENT_REGISTRATION_TOKEN`** (gitignored in `backend/dev.secrets`; AWS Secrets Manager in staging/prod). This token is **narrower** than `INGEST_INTERNAL_TOKEN` — it can only upsert webhook defaults, not create reviews.

Node route (direct):

```bash
curl -sS -X PUT "http://localhost:3000/ingest/register/contoso-graph" \
  -H "X-Ingest-Registration-Token: YOUR_INGEST_CLIENT_REGISTRATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Contoso Microsoft Graph adapter",
    "callbackUrl": "https://seg.contoso.example/v1/triage-verdict"
  }'
```

Go ingest-gateway edge (same semantics, proxies to Node — typical for production ingress on port **8080**):

```bash
curl -sS -X PUT "http://localhost:8080/v1/clients/contoso-graph" \
  -H "X-Ingest-Registration-Token: YOUR_INGEST_CLIENT_REGISTRATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Contoso Microsoft Graph adapter",
    "callbackUrl": "https://seg.contoso.example/v1/triage-verdict"
  }'
```

**Response (200):** `{ "client": { "clientId", "displayName", "callbackUrl", "isActive" } }`  
**Errors:** **401** invalid token; **400** missing fields or non-HTTP(S) URL.

After registration, every ingest from that platform includes `"ingestClientId": "contoso-graph"`. When analysis completes, Node reads the stored `callback_url` and POSTs the verdict there (with HMAC header `X-Verdict-Signature`).

**Path 2 — React UI (operators with login)**

1. Sign in at `http://localhost:3001` as **admin**, **manager**, or **developer** (roles with `ingest.clients.write`).
2. Open the **#ingest** tab → scroll to **Outbound verdict delivery** → **Register mail platform webhook**.
3. Fill **Client ID**, **Display name**, and **Default callback URL** → **Save platform webhook**.

**Technology:** React form (`RegisterIngestClientForm.jsx`) → JWT `PUT /ingest/clients/:clientId` → Postgres upsert via `ingestClientsPg.js`. The registered clients table below refreshes automatically.

**Path 3 — Operator JWT curl (same API as the UI)**

```bash
TOKEN="…"   # from POST /auth/login — see auth_guide_obtain_jwt.md
curl -sS -X PUT "http://localhost:3000/ingest/clients/contoso-graph" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "displayName": "Contoso Graph adapter",
    "callbackUrl": "https://seg.contoso.example/v1/triage-verdict"
  }'
```

**Path 4 — Internal ops token** (Terraform / break-glass; full internal privileges): `PUT /ingest/internal/clients/:clientId` with `X-Ingest-Internal-Token` — see [api_reference_rest.md](api_reference_rest.md).

**Path 5 — SQL** (migrations / break-glass): insert into `ingest_clients` via `psql` against the stats Postgres database.

#### Demonstration (dev stack)

```bash
# 1) Register dev platform pointing at mock receiver (port 4569)
curl -sS -X PUT "http://localhost:8080/v1/clients/my-dev-seg" \
  -H "X-Ingest-Registration-Token: YOUR_INGEST_CLIENT_REGISTRATION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"displayName":"My dev SEG","callbackUrl":"http://localhost:4569/webhook"}'

# 2) Ingest one message with that client id
curl -sS -X POST "http://localhost:8080/v1/ingest/email" \
  -H "Content-Type: application/json" \
  -d '{
    "ingestClientId": "my-dev-seg",
    "senderEmail": "phish@example.com",
    "subject": "Urgent wire transfer",
    "body": "Click http://evil.example/login"
  }'

# 3) After Celery completes (~seconds), check mock receiver
curl -sS "http://localhost:4569/stats"
```

Or use the **#ingest** UI form with `callbackUrl` = `http://mock-verdict-callback:4569/webhook` (Docker network hostname from inside containers) or `http://localhost:4569/webhook` (from your host browser/curl).

### Sending `ingestClientId` on ingest

Include in JSON body **or** HTTP header `X-Ingest-Client-Id`:

```bash
curl -sS -X POST "http://localhost:8080/v1/ingest/email" \
  -H "Content-Type: application/json" \
  -d '{
    "ingestClientId": "contoso-graph",
    "senderEmail": "alert@example.com",
    "subject": "Invoice",
    "body": "Please review...",
    "externalMessageId": "AAMkAGI2TG93AAA="
  }'
```

Node validates the client exists and is active before creating the Review.

| Field | Meaning |
|-------|---------|
| `externalMessageId` | Platform message id — echoed in webhook JSON |
| `ingestClientId` | Selects default webhook from Postgres registry |
| `callbackUrl` | Optional per-message override (highest priority) |

---

## Technology primer — webhooks and HMAC

### Webhook (HTTP callback)

A **webhook** is an HTTP **POST** your service sends to a customer URL when analysis finishes.

| Term | Meaning |
|------|---------|
| **Producer** | This triage app (`verdictDelivery.js`) |
| **Consumer** | Customer adapter at `callback_url` |
| **Payload** | JSON with `verdict`, `externalMessageId`, `ingestClientId`, etc. |

Unlike a browser calling your API, the **server initiates** the connection after async work completes.

### HMAC signature (`X-Verdict-Signature`)

**HMAC** (Hash-based Message Authentication Code) proves the POST was signed by someone who knows a **shared secret** — without putting the secret in the URL. GitHub, Stripe, and many SEG products use the same pattern.

1. Serialize payload to JSON string (exact bytes matter).
2. Compute `HMAC-SHA256(secret, body)` → hex string.
3. Send hex in header `X-Verdict-Signature`.
4. Receiver recomputes HMAC and compares (use **timing-safe** compare in production).

**Implementation:** `backend/src/lib/verdictCallbackSign.js` — Node built-in `crypto.createHmac`.  
**Secret:** `VERDICT_CALLBACK_HMAC_SECRET` in gitignored `dev.secrets` / AWS Secrets Manager — **never commit values**.

### Fire-and-forget scheduling

Verdict delivery must **not block** Celery or analyst override HTTP responses.

**Pattern:** `scheduleVerdictDelivery(reviewId)` uses `setImmediate` — same style as `scheduleSnowflakeExport` and `scheduleGraphSync`.

### Internal service token (not JWT)

Celery calls `POST /ingest/internal/verdict-deliver/:id` with **`X-Ingest-Internal-Token`**. Workers are not logged-in users; a static shared secret matches `graphInternal.js` and `ingestInternal.js`.

---

## Outbound webhook (primary integration)

When a review reaches **`completed`** (or analyst **override**), Node **POSTs JSON** to the resolved callback URL.

**Triggered from:**

- Celery `analyze_review` → `ai_service/app/verdict_delivery.py` → internal deliver route
- Analyst override → `scheduleVerdictDelivery` in `backend/src/api/reviews.js`

### Webhook payload shape

```json
{
  "reviewId": "507f1f77bcf86cd799439011",
  "externalMessageId": "AAMkAGI2TG93AAA=",
  "ingestClientId": "contoso-graph",
  "status": "completed",
  "verdict": "likely_phishing",
  "recommendedAction": "report_and_block",
  "effectiveVerdict": "likely_phishing",
  "source": "mailbox_ingest",
  "reason": "analysis_complete",
  "completedAt": "2026-08-03T14:00:00.000Z"
}
```

| Header | Meaning |
|--------|---------|
| `Content-Type` | `application/json` |
| `X-Verdict-Signature` | Hex HMAC-SHA256 of raw JSON body |
| `X-Verdict-Event` | `analysis_complete` or `override` |

**Retries:** Up to **3** attempts with backoff; audit stored on `review.verdictDelivery` in MongoDB.

### Environment variables

| Variable | Meaning |
|----------|---------|
| `VERDICT_CALLBACK_URL` | **Dev-only fallback** when no `ingestClientId` / `callbackUrl` |
| `VERDICT_CALLBACK_HMAC_SECRET` | HMAC signing secret (gitignored) |
| `VERDICT_DELIVERY_ENABLED` | `false` disables Celery dispatch |
| `VERDICT_CALLBACK_TIMEOUT_MS` | Outbound HTTP timeout (default 8000 ms) |

---

## Polling API (alternative integration)

**Route:** `GET /ingest/internal/verdict/:reviewId`  
**Auth:** `X-Ingest-Internal-Token`

```bash
curl -sS "http://localhost:3000/ingest/internal/verdict/REVIEW_ID" \
  -H "X-Ingest-Internal-Token: YOUR_INGEST_INTERNAL_TOKEN"
```

**Pattern:** Store `reviewId` from ingest `201`; poll until `status` is `completed` or `failed`.

---

## Kafka completion event (optional)

After successful webhook POST, Node may publish **`email.review.completed`** (Redpanda/Kafka). Disable with `VERDICT_KAFKA_COMPLETED=false`.

**Technology:** KafkaJS — `backend/src/kafka/reviewCompletedProducer.js`; partition key = `reviewId`.

---

## Dev mock receiver

**mock-verdict-callback** (port **4569**) simulates customer SEG endpoints:

| Route | Method | Purpose |
|-------|--------|---------|
| `/webhook` | POST | Receives verdict JSON; validates HMAC |
| `/callbacks` | GET | Lists received payloads |
| `/stats` | GET | Counts by verdict |

React **#ingest** tab shows delivery stats and registered clients.

```bash
curl -sS "http://localhost:4569/stats"
```

---

## Phishing-aware dev simulation

Simulators rotate templates from `shared/phishing_simulation_templates.json` and set **`ingestClientId: dev-mock`** so webhooks hit the mock receiver without per-message `callbackUrl`.

| Template id | Expected verdict |
|-------------|------------------|
| `url_phishing` | `likely_phishing` |
| `credential_phishing` | `likely_phishing` |
| `urgent_link` | `suspicious` |
| `benign_newsletter` | `benign` |

---

## Security notes

- Never paste `VERDICT_CALLBACK_HMAC_SECRET` or `INGEST_INTERNAL_TOKEN` into docs, chat, or git.
- Verify `X-Verdict-Signature` before quarantining mail.
- Production `callback_url` values must use **HTTPS**.

---

## Tests

```bash
cd ~/suspicious-email-triage/backend
npm test -- --watchAll=false --testPathPattern="verdictDelivery|ingestClients|ingestInternal"

cd ~/suspicious-email-triage
ai_service/.venv/bin/pytest ai_service/tests/test_verdict_delivery.py -v
```

See [stack_guide_running_tests.md](stack_guide_running_tests.md).

---

## Related implementation files

| File | Role |
|------|------|
| `backend/src/ingest/ingestClientsPg.js` | Postgres client registry |
| `backend/src/services/verdictDelivery.js` | Webhook POST + resolution |
| `backend/src/api/ingestInternal.js` | Ingest, poll, deliver, client CRUD |
| `ai_service/app/verdict_delivery.py` | Celery → Node trigger |
| `infra/mock-verdict-callback/server.js` | Dev receiver |

```bash
cd ~/suspicious-email-triage
bash scripts/test-all.sh
```
