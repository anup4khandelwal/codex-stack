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
7. Run deploy verification first when the operator provides a verification URL, path, device, flow, or snapshot.
8. Apply assignee and project metadata when the operator requests it.
9. If the branch follows `<prefix>/<issue-number>-slug`, include `Closes #<issue-number>` in the generated PR body.
10. Create missing labels in GitHub if required, then stage, commit, push, open PR, apply metadata, publish tracked deploy evidence, and post the deploy summary comment with branch and post-merge Pages links when verification ran.
11. Leave merge automation opt-in by label; do not force auto-merge without an explicit signal such as `automerge`.
10. Report the exact commands executed.

## CLI

```bash
bun src/cli.ts ship --dry-run
bun src/cli.ts ship --message "feat: ready for review" --push
bun src/cli.ts ship --message "feat: ready for review" --push --pr
bun src/cli.ts ship --message "feat: ready for review" --push --pr --template .github/pull_request_template.md
bun src/cli.ts ship --message "feat: ready for review" --push --pr --reviewer octocat --assignee @me --project "Engineering Roadmap" --label release-candidate
bun src/cli.ts ship --dry-run --pr --verify-url https://staging.example.com --verify-path /dashboard --verify-device mobile --verify-console-errors --verify-flow landing-smoke --verify-snapshot landing-home
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
