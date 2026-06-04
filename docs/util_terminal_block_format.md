# Terminal command blocks (documentation style)

Use this HTML wrapper so command-line instructions appear in a **gray box** in GitHub and most Markdown viewers.

## Template

Copy and fill in the command (one block per runnable step):

```html
<div style="background:#eef1f5;padding:1rem 1.25rem;border-left:4px solid #64748b;margin:1rem 0;border-radius:4px;">

<p><strong>Run in terminal</strong> — WSL, repository root (<code>~/suspicious-email-triage</code> unless noted)</p>

```bash
cd ~/suspicious-email-triage
YOUR_FULL_COMMAND_HERE
```

</div>
```

## Rules

- **Every guide** under `docs/` must include **at least one** runnable terminal sample (gray box or ` ```bash ` block) so readers never have to hunt another doc for a first command.
- When a doc mentions a **source file** (e.g. `backend/src/graph/campaignDetection.js`), include the matching **test command** on the same page, e.g. `npm test -- --watchAll=false --testPathPattern=campaignDetection` (see [stack_guide_running_tests.md](stack_guide_running_tests.md#map-backendsrc--jest-command)).
- Always include `cd ~/suspicious-email-triage` when the command must run from the repo root.
- Use **full** commands (no `...` omissions) so a novice can copy-paste.
- For tests, name the script or `npm test` / `pytest` path explicitly.
- Do not put real passwords or secrets in boxes — reference env var names instead.

## Linking sections

Add explicit HTML anchors for deep links:

```markdown
## Section title {#anchor-id}
```

Link from other docs: `[text](other_doc.md#anchor-id)`.
