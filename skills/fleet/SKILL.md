---
name: fleet
description: Roll out codex-stack policy packs across multiple repositories and aggregate org-level health.
---

# /fleet

## Objective

Operate codex-stack as a multi-repo platform instead of a single-repo tool.

## Workflow

1. Validate the fleet manifest and policy-pack references.
2. Plan rollout drift per target repo.
3. Sync generated fleet files locally or open rollout PRs remotely.
4. Collect normalized fleet-status reports from target repos.
5. Render a dashboard that ranks rollout health and unresolved risks.
6. Run remediation to open rollout PRs for drift and stable issues for runtime problems.

## CLI

```bash
bun src/cli.ts fleet validate --manifest .codex-stack/fleet.example.json
bun src/cli.ts fleet sync --manifest .codex-stack/fleet.example.json --dry-run --json
bun src/cli.ts fleet collect --manifest .codex-stack/fleet.example.json --json
bun src/cli.ts fleet dashboard --manifest .codex-stack/fleet.example.json --out .fleet-site
bun src/cli.ts fleet remediate --manifest .codex-stack/fleet.example.json --dry-run --json
```

## Output format

- `validate`: control-plane summary of repos, policy packs, and required checks
- `sync`: deterministic rollout plan or write/PR results per repo
- `collect`: normalized multi-repo health report with ranked risks
- `dashboard`: static HTML + JSON summary for Pages or local review
- `remediate`: planned or executed rollout PR / remediation issue actions per repo

## Guardrails

- Treat policy packs as the source of truth for required checks.
- Prefer `--dry-run` before `--open-prs`.
- Use `localPath` targets for local testing and fixtures.
- Do not weaken required checks in repo-local overrides.
