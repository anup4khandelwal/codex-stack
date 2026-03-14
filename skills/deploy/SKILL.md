---
name: deploy
description: Verify a preview or staging deploy with page/device checks, flows, snapshots, and visual evidence.
allowed-tools:
  - Read
  - Bash
---

# /deploy

Use this mode when the operator needs evidence that a live preview or staging deploy is actually safe to merge.

## Objective

Resolve the live deploy URL, wait for readiness, verify the important paths across devices, run reusable flows and snapshots, and publish a merge-ready report with screenshots and findings.

## Workflow

1. Resolve the deploy URL from either an explicit URL or a template.
2. Import `--session-bundle <path>` into the named deploy session when the target requires authentication.
3. Wait for the target to become ready before running browser checks.
4. Verify each configured path across the requested device presets.
5. Capture screenshots and collect HTTP plus console evidence for each page check.
6. Run any configured QA flows and snapshot comparisons.
7. Publish markdown/json/comment artifacts plus a screenshot manifest under the publish directory.
8. Mark the run as `critical`, `warning`, or `pass` based on HTTP failures, console drift, and QA findings.

## CLI

```bash
bun src/cli.ts deploy --url-template "https://preview-{pr}.example.com" --pr 42 --branch feat/42-preview --sha abcdef123 --path / --path /dashboard --device desktop --device mobile --flow portal-dashboard --snapshot portal-dashboard
bun src/cli.ts deploy --url https://staging.example.com --path /dashboard --device desktop --flow portal-dashboard --session staging-auth --session-bundle .codex-stack/private/staging-auth.json --json
bun src/cli.ts deploy --url http://127.0.0.1:4173 --path /dashboard --device desktop --publish-dir docs/qa/local-demo/deploy --strict-console --json
```

## Output format

- Deploy URL and resolution source
- Readiness status with attempt count and last HTTP status
- Page/device matrix with console counts and screenshot paths
- QA status, health score, recommendation, and findings
- Snapshot results and artifact paths
- Screenshot manifest and workflow run link when available

## Guardrails

- Do not report a deploy as verified unless readiness passed in the current run.
- Treat missing or broken deploy URLs as a verification failure, not as a skipped check.
- Keep authentication in `--session-bundle` inputs, not in checked-in flows or tracked artifacts.
- Keep deploy verification read-only; do not mutate the live environment.
- Publish tracked evidence when the report is meant to live in GitHub or GitHub Pages.
