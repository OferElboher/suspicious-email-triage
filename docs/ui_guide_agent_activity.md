# Agent activity UI — visualizing bounded FSM runs

This guide explains how the React app **visualizes** agent triage activity: what you see in the browser, which APIs power each panel, and why the design is safe for your **dev laptop** and for **staging/production servers**.

If you are new to **finite-state machines (FSMs)** or **LLM agents**: an FSM is a fixed checklist of steps (intake → plan → tools → synthesize → validate). Our agent is **bounded** — it cannot loop forever or call unlimited tools. The UI shows exactly which steps ran and whether the system fell back to deterministic rules.

**Related:** [data_guide_agent_triage.md](data_guide_agent_triage.md) (backend FSM), [ui_guide_review_dashboard.md](ui_guide_review_dashboard.md) (review detail panel), [ui_guide_app_navigation.md](ui_guide_app_navigation.md) (hash tabs).

---

## Two complementary views

| View | Where | What it shows |
|------|-------|---------------|
| **Per-review trace** | Review dashboard → detail panel | One email’s `agentTrace`: FSM timeline, tools, guardrails |
| **Fleet activity** | `#agent` tab (Agent activity) | Last 25 agent runs + safety caps + aggregate stats |

**Pattern:** *interleaved detail + fleet dashboard* — analysts drill into one review; SOC leads scan recent agent behavior without opening each message.

---

## Per-review: `AgentTracePanel`

### When it appears

The panel mounts inside `ReviewDetailPanel.jsx` when Mongo returns `review.agentTrace` (populated only when `AGENT_TRIAGE_ENABLED=true` on the Celery worker).

### What each section means

| UI section | Mongo field | Meaning |
|------------|-------------|---------|
| Provider / Model | `agentTrace.provider`, `modelId` | Which cloud LLM adapter ran (`mock`, `bedrock`, `vertex`) |
| Duration | `wallDurationMs` | Wall-clock time for the whole FSM (monotonic timer in Python) |
| FSM states visited | `statesVisited[]` | Ordered audit trail — e.g. `INTAKE` → `PLAN` → `TOOL_LOOP` → `PERSIST` |
| Tool calls | `toolCalls[]` | Allowlisted tools (`run_rule_engine`, `get_graph_neighborhood`, …) with `ok` and `latencyMs` |
| Guardrail events | `guardrailEvents[]` | Pre/post safety rules (PII mask, injection filter, JSON schema) |
| Plan intent | `plan.intent` | What the PLAN stage asked the LLM to investigate |

### Technologies

| Piece | Technology | Why |
|-------|------------|-----|
| Component | React function component (`AgentTracePanel.jsx`) | Renders only when trace exists — zero cost when agent is off |
| Labels | Pure helpers (`agentTraceFormat.js`) | Human-readable FSM names; easy to unit test |
| Styling | CSS BEM classes in `triage.css` (`.agent-trace-panel__*`) | Theme-safe timeline; no chart library |
| Data source | Existing `GET /reviews/:id` | No extra API call — trace rides with the review document |

### Fallback banner

If `statesVisited` includes `FALLBACK_RULES`, a yellow banner explains that **rule-only output** was used (guardrail hard-fail, LLM error, or wall-clock budget exceeded). The analyst’s override path is unchanged.

---

## Fleet view: `AgentActivityView` (`#agent`)

### Navigation

Open the round **hub icon** in the header (hover label: “Agent activity”). Requires JWT permission **`metrics.read`** — same as the Live flow dashboard.

URL hash: `#agent` (see [ui_guide_app_navigation.md](ui_guide_app_navigation.md)).

### API: `GET /metrics/agent-triage`

| Aspect | Detail |
|--------|--------|
| Auth | JWT + `metrics.read` |
| Backend | `backend/src/metrics/agentTriageMetrics.js` |
| Mongo query | `{ agentTrace: { $exists: true } }`, sort by `updatedAt`, **limit 25** |
| Fields returned | Subject, sender, verdict, states, tools, duration — **no email body** |
| Safety metadata | `safetyLimits` echo env caps (`AGENT_MAX_TOOL_STEPS`, `AGENT_MAX_WALL_MS`, `AGENT_MAX_BODY_CHARS`) |

**Why capped at 25?** Prevents heavy Mongo scans on a laptop or small API pod when thousands of reviews exist.

### UI sections

1. **Safety limits card** — displays server-configured caps so operators know the FSM cannot run unbounded.
2. **Summary stats** — total reviews with traces, recent fallbacks, average duration in the sample.
3. **Recent runs table** — one row per agent run; fallback rows highlighted.

Refresh is **manual** (button) — no background polling, so dev laptops are not hammered.

### Technologies

| Piece | Technology |
|-------|------------|
| View | `AgentActivityView.jsx` |
| HTTP | `getJson("/metrics/agent-triage")` via shared API client |
| Tests | `AgentActivityView.test.jsx` (mocked `getJson`) |

---

## Safety for dev laptops and servers

These UI and API choices intentionally avoid harm:

| Risk | Mitigation |
|------|------------|
| Runaway LLM cost | Agent **off by default** (`AGENT_TRIAGE_ENABLED=false`); dev uses **mock-cloud-llm** ($0) |
| Unbounded tool/LLM loops | `app/agent/safety.py` enforces `AGENT_MAX_TOOL_STEPS` and `AGENT_MAX_WALL_MS` in the orchestrator |
| Heavy Mongo reads | Metrics endpoint returns **at most 25** lean documents; no full-body scan |
| Secret leakage in UI | Docs and UI reference **variable names only** — never paste `AGENT_INTERNAL_SERVICE_TOKEN` |
| Accidental prod charges | `LLM_CLOUD_PROVIDER=mock` in dev; Bedrock/Vertex only when explicitly configured |

See [data_guide_agent_triage.md#safety-limits](data_guide_agent_triage.md) for the full backend safety section.

---

## Enabling traces to populate the UI

1. Set `AGENT_TRIAGE_ENABLED=true` in `backend/.env.dev` (committed metadata — safe in Git).
2. Ensure `LLM_CLOUD_PROVIDER=mock` and `mock-cloud-llm` container is running.
3. Recreate Celery: `DEPLOYMENT_ENV=dev docker compose -f infra/docker/docker-compose.yml up -d --force-recreate ai-celery mock-cloud-llm backend`
4. Submit a review via the dashboard or `POST /reviews`.
5. Open the completed review — **Agent triage trace** appears in the detail panel.
6. Open **#agent** — the run appears in the recent table.

---

## Files reference

| File | Role |
|------|------|
| `frontend/src/components/AgentTracePanel.jsx` | Per-review timeline |
| `frontend/src/views/AgentActivityView.jsx` | Fleet `#agent` view |
| `frontend/src/lib/agentTraceFormat.js` | Label/duration helpers |
| `backend/src/metrics/agentTriageMetrics.js` | Mongo snapshot builder |
| `backend/src/api/metrics.js` | `GET /metrics/agent-triage` route |
| `ai_service/app/agent/safety.py` | Wall-clock and env caps |

---

## Tests

```bash
cd ~/suspicious-email-triage/frontend
npm test -- --watchAll=false --testPathPattern="AgentTrace|AgentActivity|agentTraceFormat"

cd ~/suspicious-email-triage/backend
npm test -- --watchAll=false --testPathPattern="agentTriageMetrics|metricsApi"
```

---

## Command you can run (this guide) {#run-one-command}

<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — open Agent activity after signing in</p>

```bash
cd ~/suspicious-email-triage
# Sign in at http://localhost:3000 then navigate to:
# http://localhost:3000/#agent
```

</div>
