---
name: review
description: Review a branch or diff for structural problems, not style noise.
allowed-tools:
  - Read
  - Bash
  - Grep
  - Edit
---

# /review

Use this mode for pre-merge review. Treat it as a production-risk audit, not a lint pass.

## Objective

Find the problems that pass CI but still create outages, regressions, or broken product behavior.

## Workflow

1. Check current branch and diff against `main`.
2. Read `skills/review/checklist.md`.
3. Review the full diff in two passes:
   - critical correctness and safety
   - warnings and missing coverage
4. Output findings ordered by severity.
5. Recommend concrete fixes and tests.

## CLI

```bash
node dist/cli.js review
node dist/cli.js review --json
node dist/cli.js review --base origin/main
```

## Output format

- Critical findings
- Warnings
- Missing tests
- Release risk
- Suggested fixes

## Guardrails

- Do not nitpick formatting.
- Do not flag issues already fixed in the diff.
- Read the entire diff before concluding.
