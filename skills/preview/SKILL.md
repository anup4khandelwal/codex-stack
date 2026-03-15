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

Turn preview verification into a repeatable workflow that resolves the right preview URL, waits for deployment readiness, delegates to deploy verification, and reports whether the preview is safe to merge.

## Workflow

1. Resolve the preview URL from either an explicit URL, a GitHub Pages PR preview, or a URL template.
2. Fill template placeholders from PR, branch, repo, and SHA context.
3. Import `--session-bundle <path>` into the named preview session when the preview requires authentication.
4. Poll the preview URL until it responds successfully or times out.
5. Delegate the live checks to `deploy`, including path/device screenshots, flows, snapshots, and optional a11y/perf checks.
6. Publish markdown/json artifacts for the preview run.
7. Write a PR-comment-ready markdown summary with findings, flow results, deploy checks, and evidence paths.
8. Fail the verification job when readiness fails or deploy verification returns a critical status.

## CLI

```bash
bun src/cli.ts preview --url-template "https://preview-{pr}.example.com" --pr 42 --branch feat/42-preview --sha abcdef123 --path / --path /dashboard --device desktop --device mobile --flow landing-smoke --snapshot landing-home
bun src/cli.ts preview --url-template "https://preview-{pr}.example.com" --pr 42 --branch feat/42-preview --sha abcdef123 --path /dashboard --device desktop --flow landing-smoke --snapshot landing-home --a11y --a11y-scope main --perf --perf-budget lcp=2s
bun src/cli.ts preview --url "https://anup4khandelwal.github.io/codex-stack/pr-preview/pr-42/" --pr 42 --branch feat/42-preview --sha abcdef123 --path /login --path /dashboard --device desktop --device mobile --flow portal-full-demo
bun src/cli.ts preview --url "https://anup4khandelwal.github.io/codex-stack/pr-preview/pr-42/" --pr 42 --branch feat/42-preview --sha abcdef123 --path /dashboard --device desktop --flow portal-dashboard --session preview-auth --session-bundle .codex-stack/private/preview-auth.json
bun src/cli.ts preview --url http://127.0.0.1:4173 --path /dashboard --device desktop --flow portal-dashboard --snapshot portal-dashboard --fixture /tmp/deploy-fixture.json --qa-fixture /tmp/qa-fixture.json --json
```

## Output format

- Preview URL and resolution source
- Readiness status with attempt count and last HTTP status
- QA status, health score, and recommendation
- Deploy path/device matrix with screenshot evidence and console counts
- Accessibility and performance summaries when enabled
- Regression triage summary for approved versus unresolved regressions
- Findings and flow results
- Artifact paths and workflow run link when available

## Guardrails

- Do not claim a preview is ready unless the URL responded successfully in the current run.
- Use `branch_slug` rather than raw `branch` when the template feeds a hostname.
- Keep auth material in exported session bundles or CI secrets, never in checked-in preview flows.
- Treat readiness failure as a hard verification failure rather than attempting deploy checks anyway.
- Keep preview verification read-only; do not mutate the deployment environment.
