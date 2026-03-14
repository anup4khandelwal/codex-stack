---
name: upgrade
description: Audit codex-stack install health and update drift across Bun, dependencies, workflow actions, and installed skills.
allowed-tools:
  - Read
  - Bash
---

# /upgrade

Use this mode when the operator wants to check whether `codex-stack` itself needs maintenance, refresh local skill installs, or review daily upgrade drift.

## Objective

Turn upgrade work into a repeatable audit instead of an ad hoc sweep through package versions, wrappers, and workflows.

## Workflow

1. Run the upgrade report locally.
2. Inspect runtime alignment for Bun and package metadata.
3. Check dependency drift when network access is available.
4. Check GitHub Actions `uses:` refs for stale majors or exact tags.
5. Verify local wrapper and installed skill link health.
6. Report the recommended follow-up commands instead of mutating the repo unless the operator explicitly asks for changes.
7. When operating in CI, publish the markdown report into the step summary or a stable issue.

## CLI

```bash
bun src/cli.ts upgrade --offline
bun src/cli.ts upgrade --json
bun src/cli.ts upgrade --markdown-out docs/daily-update-check.md --json-out docs/daily-update-check.json
```

## Output format

- Overall upgrade status
- Runtime alignment
- Dependency drift
- Workflow action drift
- Install health
- Recommended actions

## Guardrails

- Do not claim a dependency or workflow update exists without current evidence.
- Treat offline runs as partial audits and mark skipped checks clearly.
- Do not auto-edit dependency versions or workflow refs unless the user explicitly asks for the upgrade to be applied.
