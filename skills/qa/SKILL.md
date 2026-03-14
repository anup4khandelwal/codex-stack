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
2. Import `--session-bundle <path>` first when the target requires authenticated state.
3. Use `--mode diff-aware` plus `--base-ref` when the goal is to probe the pages changed by the current diff from a preview base URL.
4. Run one or more checked-in flows when behavior needs end-to-end validation.
5. Capture or compare a snapshot when visual/text drift matters.
6. Score the result with categorized findings, severity, evidence, and a recommendation.
7. Save the QA report under `.codex-stack/qa/`, including annotated screenshot evidence when snapshot failures occur.
8. Refresh `.codex-stack/qa/trends.json` and `.codex-stack/qa/trends.md` so the operator can compare the latest run against prior QA history.
9. Publish tracked copies into `docs/qa/` when the shipping workflow needs GitHub-linkable evidence.
10. Render `docs/qa/` through `scripts/render-qa-pages.ts` when the operator needs a static review site.

## CLI

```bash
bun src/cli.ts qa http://127.0.0.1:4173/dashboard --flow portal-dashboard --snapshot portal-dashboard --session demo --json
bun src/cli.ts qa http://127.0.0.1:4173/login --flow portal-full-demo --snapshot portal-login --session demo
bun src/cli.ts qa https://preview.example.com/dashboard --flow portal-dashboard --session preview-auth --session-bundle .codex-stack/private/preview-auth.json --json
bun src/cli.ts qa https://preview.example.com --mode diff-aware --base-ref origin/main --session preview --json
bun scripts/qa-run.ts --fixture ./tmp/qa-fixture.json --json
bun scripts/qa-trends.ts --dir .codex-stack/qa --json
```

## Output format

- Overall QA status
- Health score
- Findings with category + severity
- Diff-aware route probe summary
- Snapshot evidence
- Flow pass/fail summary
- Recommendation
- Trend delta vs previous runs via `.codex-stack/qa/trends.json`

## Guardrails

- Do not claim QA passed without runtime evidence.
- Prefer checked-in flows and named snapshots for repeatable environments.
- Use `--session-bundle` instead of embedding secrets into flows when preview or staging authentication is required.
- Use `--mode diff-aware` only when the provided URL is the deploy base, not a single leaf page.
- Refresh a snapshot baseline only when the UI change is intentional.
