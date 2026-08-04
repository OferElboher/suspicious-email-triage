# Mailbox ingest UI — `#ingest` dashboard and simulation

This guide explains the **Mailbox ingest gateway** sub-window in the React app: where to find it, what the charts mean, and how to run **dev simulation** at a custom email rate.

**Audience:** analysts and developers who want to watch inbound mailbox traffic (real or simulated) without reading Go or Docker logs.

**Related:** [data_guide_mailbox_ingest_gateway.md](data_guide_mailbox_ingest_gateway.md), [ui_guide_app_navigation.md](ui_guide_app_navigation.md), [ui_guide_flow_dashboard.md](ui_guide_flow_dashboard.md).

---

## Opening the ingest tab

1. Sign in at `http://localhost:3001` ([stack_guide_build_and_run.md](stack_guide_build_and_run.md)).
2. Click the **envelope + arrow** icon in the top navigation bar.
3. URL hash becomes **`#ingest`**.

**Permission:** `metrics.read` (managers, admins, developers). The tab appears when `GET /dev/features` reports `mailboxIngest: true` and the Go container is enabled via `MAILBOX_INGEST_ENABLED=true`.

---

## What you see on the dashboard

| UI section | Data source | Meaning |
|------------|-------------|---------|
| Stat cards (Total received, Webhook, Simulation, Errors) | Go `/v1/stats/dashboard` via Node proxy | Lifetime counters since gateway start |
| Last minute | Same snapshot | Rolling ingest rate |
| Per-minute bar chart | `series.perMinute[]` | Webhook vs simulation vs errors each minute |
| Dev simulation panel | `POST /metrics/mailbox-ingest/simulation` | Single **Start simulation** / **Stop simulation** toggle (same labels as the Node Dev simulation card) |
| **Outbound verdict delivery** | `GET /metrics/verdict-delivery` | Webhook delivered/failed counts, mock receiver log, verdict bar chart |

The page **auto-refreshes every 3 seconds** (ingest stats) and **6 seconds** (verdict delivery panel).

---

## Outbound verdict delivery panel

After simulated or real mailbox ingest completes analysis, Node **POSTs the verdict** to the configured webhook (`VERDICT_CALLBACK_URL` → **mock-verdict-callback** in dev). This panel shows:

| UI element | Meaning |
|------------|---------|
| Delivered / Failed / Skipped | Mongo `verdictDelivery` audit counts |
| Mock received / Valid HMAC | Rows accepted by `mock-verdict-callback:4569` |
| Verdict bar chart | Breakdown of mock callbacks by verdict |
| Recent mock platform callbacks | Table with `externalMessageId` and verdict |
| Phishing simulation templates | Rotating scenarios (URL phish, credential, urgent, benign) |

Full integration guide: [data_guide_verdict_webhooks.md](data_guide_verdict_webhooks.md).

---

## Dev simulation controls

When you have **`dev.simulation`** permission (admin/developer in dev):

1. Set **Emails/min** (capped by `MAILBOX_INGEST_MAX_EVENTS_PER_MIN`, default 30). The field is **locked while simulation runs** — stop first to change the rate.
2. Click **Start simulation** — the Go service starts a goroutine that creates reviews with `source=mailbox_simulation`. Each tick rotates a **phishing demo template** (URL phish, credential keywords, urgent link, benign) so rule_engine verdicts vary. The same button becomes **Stop simulation** (red) while running; it is **grayed out** briefly while the start/stop request is in flight.
3. Watch the purple **Simulation** bars grow on the chart.
4. Click **Stop simulation** when finished.

**UI pattern:** one toggle button (not separate Start and Stop buttons) so only the relevant action is shown — matching the Review dashboard **Dev simulation** card ([stack_guide_dev_simulation.md](stack_guide_dev_simulation.md)).

Synthetic mailbox reviews are **hidden** from the default review queue (like `dev_simulation`). Enable **Include simulation** on the workspace list to inspect them.

---

## How ingest paths compare

| Path | Source field | Endpoint | Who triggers |
|------|--------------|----------|--------------|
| Manual UI or `POST /reviews` | `user` | Node `POST /reviews` (JWT) | Analyst or trusted script with analyst token |
| Node dev simulation card | `dev_simulation` | Node `/dev/simulation` timer | Node timer in dev |
| Go gateway webhook | `mailbox_ingest` | Go `POST /v1/ingest/email` → Node internal | Mailbox platform HTTP webhook |
| Go gateway simulation | `mailbox_simulation` | Go ticker in dev | **#ingest** tab toggle |

Full comparison: [data_guide_mailbox_ingest_gateway.md — Three ways to get email into triage](data_guide_mailbox_ingest_gateway.md#three-ways-to-get-email-into-triage).

All paths enqueue **`email.review.ingested`** when `USE_KAFKA_INGEST=true`.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Tab missing | Check role has `metrics.read`; verify `MAILBOX_INGEST_ENABLED=true` |
| “Gateway unreachable” banner | Start `ingest-gateway` container — see [stack_guide_full_feature_activation.md](stack_guide_full_feature_activation.md) |
| Simulation start fails | Confirm `DEPLOYMENT_ENV=dev` and rate ≤ max |
| Reviews stay pending | Ensure `ai-celery` + `ai-kafka-dispatch` running |

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — fetch dashboard JSON through Node (requires JWT — use browser network tab or login curl)</p>

```bash
curl -sS http://localhost:8080/v1/stats/dashboard | python3 -m json.tool
```

</div>
