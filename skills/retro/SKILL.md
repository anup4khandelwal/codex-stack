---
name: retro
description: Weekly engineering retrospective from git history and shipping behavior.
allowed-tools:
  - Read
  - Bash
  - Grep
---

# /retro

Use this mode to understand how the team shipped over a period of time.

## Objective

Summarize throughput, hotspots, review bottlenecks, and recurring failure patterns.

## Workflow

1. Gather recent commit and PR history.
2. Identify clusters of work and churn.
3. Highlight review latency and rework patterns.
4. Summarize wins, friction, and risks.
5. Recommend one or two process changes.

## CLI

```bash
bun dist/cli.js retro --since "7 days ago"
bun dist/cli.js retro --since "30 days ago" --json
bun dist/cli.js retro --since "14 days ago" --artifact-dir .codex-stack/retros
bun dist/cli.js retro --since "14 days ago" --no-artifacts
bun dist/cli.js retro --since "14 days ago" --repo anup4khandelwal/codex-stack
bun scripts/weekly-digest.mjs --since "7 days ago" --publish-dir docs/weekly-digest-publish --no-github
```

## Output format

- Delivery summary
- Workstream breakdown
- Bottlenecks
- Rework or churn signals
- Review latency and reviewer load when GitHub data is available
- Actions for next week
- Publish-ready weekly summary outputs for Slack, email, and status posts when `weekly-digest.mjs` is used

## Guardrails

- Focus on evidence, not vague culture commentary.
- Keep recommendations operational and measurable.
- Keep the generated markdown/json snapshots under `.codex-stack/retros/` unless the operator explicitly disables artifacts.
- Treat GitHub analytics as additive; if `gh` or repo access is unavailable, still return the git-based retrospective.
