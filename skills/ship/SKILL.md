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
5. Stage, commit, push, and open PR if requested.
6. Report the exact commands executed.

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
