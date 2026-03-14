---
name: qa
description: Run browser flows and snapshot checks, then score release readiness.
allowed-tools:
  - Read
  - Bash
---

# /qa

Use this mode when the agent should validate a product surface, not just inspect code.

## Objective

Run repeatable browser verification, collect evidence, and turn it into a ship/no-ship QA report.

## Workflow

1. Choose the target URL and named browser session.
2. Run one or more checked-in flows when behavior needs end-to-end validation.
3. Capture or compare a snapshot when visual/text drift matters.
4. Score the result with findings, severity, evidence, and a recommendation.
5. Save the QA report under `.codex-stack/qa/`, including annotated screenshot evidence when snapshot failures occur.
6. Publish tracked copies into `docs/qa/` when the shipping workflow needs GitHub-linkable evidence.

## CLI

```bash
node dist/cli.js qa http://127.0.0.1:4173/dashboard --flow portal-dashboard --snapshot portal-dashboard --session demo --json
node dist/cli.js qa http://127.0.0.1:4173/login --flow portal-full-demo --snapshot portal-login --session demo
node scripts/qa-run.mjs --fixture ./tmp/qa-fixture.json --json
```

## Output format

- Overall QA status
- Health score
- Findings with severity
- Snapshot evidence
- Flow pass/fail summary
- Recommendation

## Guardrails

- Do not claim QA passed without runtime evidence.
- Prefer checked-in flows and named snapshots for repeatable environments.
- Refresh a snapshot baseline only when the UI change is intentional.
