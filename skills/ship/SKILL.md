---
name: ship
description: Execute the release workflow for a branch that is already ready to merge.
allowed-tools:
  - Read
  - Bash
  - Edit
---

# /ship

Use this mode only when the branch is ready and the user wants to ship, not when the scope is still unclear.

## Objective

Run the shipping checklist with minimal back-and-forth.

## Workflow

1. Verify branch is not `main`.
2. Sync latest `main`.
3. Run project validation commands.
4. Summarize failures or proceed.
5. Build a PR title/body from the branch diff or merge the diff summary into a PR template if present.
6. Stage, commit, push, and open PR if requested.
7. Report the exact commands executed.

## CLI

```bash
node dist/cli.js ship --dry-run
node dist/cli.js ship --message "feat: ready for review" --push
node dist/cli.js ship --message "feat: ready for review" --push --pr
node dist/cli.js ship --message "feat: ready for review" --push --pr --template .github/pull_request_template.md
```

## Output format

- Branch status
- Validation results
- Shipping action taken
- PR details
- Risks or blockers

## Guardrails

- Never ship without validation evidence.
- Never hide failed checks.
- Stop on destructive ambiguity.
