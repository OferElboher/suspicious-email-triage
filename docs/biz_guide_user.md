# Suspicious Email Triage — guide for non‑technical readers

This document explains what the system is for, who uses it, and what people actually do in front of the computer when they want to protect their company from harmful email.

## What problem this solves

Companies receive a constant stream of email. Some messages are normal business correspondence. Others are attempts to steal passwords, install malware, or trick employees into sending money. Security teams need a place to **paste or forward suspicious content**, get a **structured risk assessment**, and keep an **audit trail** of decisions.

This project is a working example of that workflow. It is not “magic security”; it is a **triage desk tool** that organizes evidence, suggests next steps, and supports human judgment.

## Sign in

The website requires login. Your administrator creates accounts and assigns roles (analyst, manager, developer, and so on). Password recovery uses your email address. Details for staff and integrators are in `auth_guide_rbac.md`.

The main areas (**Triage workspace**, **Analytics & graphs**) each have a URL (for example `…/#analytics`). Refreshing the browser keeps you on the same area. Admins manage users in **Django admin** — see `auth_guide_django_admin_users.md`.

## The main actors

- **Analyst / security reviewer** — Uses the website to submit an email for analysis, reads the results, and may record a manual override with a written reason.
- **Client company leadership** — Cares about outcomes: fewer successful phishing incidents, faster response times, and accountability.
- **Engineering / operations** — Keeps the services running (databases, queues, workers), monitors logs, and controls environments (development vs staging vs production).

## What a typical day looks like (happy path)

1. An employee forwards a suspicious message to the security mailbox, or an analyst copies the message text from their mail client.
2. The analyst opens the triage website in a browser.
3. The analyst fills in sender details and pastes the email body, then clicks **Queue analysis**.
4. The system stores the message and schedules background processing. The UI shows statuses like **pending** and **processing** while work happens asynchronously.
5. When processing completes, the UI shows a **verdict**, a **recommended action**, a **short summary**, and a list of **findings** (reasons tied to evidence snippets).
6. If the analyst disagrees with the automated output, they can enter a reason and save an **override** so the company has a record of human judgment.

## Analytics graphs (for managers and power users)

The website includes an **Analytics & graphs** area. It is meant to answer questions like:

- “How many suspicious messages entered the system this week?”
- “Are we seeing spikes at certain times of day?”
- “What fraction of items are still pending versus completed?”

You can adjust the **time range** and the **bucket size** (for example hourly vs daily) to match the question you are asking. Turn **Auto-refresh** on to keep the charts on the rolling **last 24 hours** and update them automatically from PostgreSQL every 30 seconds; turn it off to pick a custom range and click **Apply range**. The charts are based on lightweight statistics stored in PostgreSQL, while the detailed email review records stay in MongoDB. This keeps the charts responsive as review history grows. For a full explanation of each chart (including why status bars may look equal in height), see `ui_guide_analytics_charts.md`.

## Simulation mode (development only)

In the **development** configuration, the product can optionally generate **synthetic test traffic** at a controlled rate. This helps engineers validate queues and dashboards without asking humans to repeatedly submit emails.

Simulation is rate-limited on purpose so a laptop does not get overwhelmed. It should **never** be treated as “real incidents”; it is a lab feature available only to users with the **developer** role in development configuration (`auth_guide_rbac.md`).

Development mode also includes a **reset local databases & queues** action. It is meant for engineers and demo operators: it turns simulation off, clears local review data, clears chart statistics, empties queue state, and gives the local system a clean start.

## What this product does *not* do (important expectations)

- It does not replace your corporate email security gateway.
- It does not automatically delete mail in user inboxes.
- It does not guarantee perfect accuracy; it provides structured assistance and traceability.

## If you only remember one sentence

This system is a **triage workbench**: it ingests suspicious email content, runs automated checks asynchronously, presents an explainable result, and supports human overrides for accountability.
---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — WSL, repository root unless noted</p>

```bash
cd ~/suspicious-email-triage
PORT=3001 npm start --prefix frontend
# Open http://localhost:3001 and sign in
```

</div>

