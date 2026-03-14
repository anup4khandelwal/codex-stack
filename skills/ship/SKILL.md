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
6. Infer labels from branch/files and reviewers from `CODEOWNERS` unless disabled.
7. Run QA verification first when the operator provides a verification URL, flow, or snapshot.
8. Apply assignee and project metadata when the operator requests it.
9. Create missing labels in GitHub if required, then stage, commit, push, open PR, and apply metadata.
10. Report the exact commands executed.

## CLI

```bash
node dist/cli.js ship --dry-run
node dist/cli.js ship --message "feat: ready for review" --push
node dist/cli.js ship --message "feat: ready for review" --push --pr
node dist/cli.js ship --message "feat: ready for review" --push --pr --template .github/pull_request_template.md
node dist/cli.js ship --message "feat: ready for review" --push --pr --reviewer octocat --assignee @me --project "Engineering Roadmap" --label release-candidate
node dist/cli.js ship --dry-run --pr --verify-url https://staging.example.com/dashboard --verify-flow landing-smoke --verify-snapshot landing-home
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
