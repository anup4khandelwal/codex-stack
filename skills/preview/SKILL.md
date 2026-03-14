---
name: preview
description: Resolve a PR preview URL, wait for it to become ready, run QA against it, and summarize merge readiness.
allowed-tools:
  - Read
  - Bash
---

# /preview

Use this mode when the operator wants to verify a preview deployment before merge instead of checking only the code diff.

## Objective

Turn preview verification into a repeatable workflow that resolves the right preview URL, waits for deployment readiness, runs Codex QA against it, and reports whether the preview is safe to merge.

## Workflow

1. Resolve the preview URL from either an explicit URL or a URL template.
2. Fill template placeholders from PR, branch, repo, and SHA context.
3. Poll the preview URL until it responds successfully or times out.
4. Run `qa` with the configured flows and snapshot against the ready preview.
5. Publish markdown/json artifacts for the preview run.
6. Write a PR-comment-ready markdown summary with findings, flow results, and evidence paths.
7. Fail the verification job when readiness fails or QA returns a critical status.

## CLI

```bash
bun src/cli.ts preview --url-template "https://preview-{pr}.example.com" --pr 42 --branch feat/42-preview --sha abcdef123 --flow landing-smoke --snapshot landing-home
bun src/cli.ts preview --url http://127.0.0.1:4173/dashboard --flow portal-dashboard --snapshot portal-dashboard --qa-fixture /tmp/qa-fixture.json --json
```

## Output format

- Preview URL and resolution source
- Readiness status with attempt count and last HTTP status
- QA status, health score, and recommendation
- Findings and flow results
- Artifact paths and workflow run link when available

## Guardrails

- Do not claim a preview is ready unless the URL responded successfully in the current run.
- Use `branch_slug` rather than raw `branch` when the template feeds a hostname.
- Treat readiness failure as a hard verification failure rather than attempting QA anyway.
- Keep preview verification read-only; do not mutate the deployment environment.
