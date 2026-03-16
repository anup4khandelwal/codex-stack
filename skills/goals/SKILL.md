---
name: goals
summary: Track goal hierarchy and an assignable task queue for multiple agents.
allowed-tools: Bash, Read, Grep, Glob
---

# Goals

Use this mode when you need to model an initiative, attach repo goals, or assign persistent tasks to named agents.

## What it does
- records goal hierarchy with owners and status
- maintains a local task queue with assignees and blocked/completed state
- exposes a queue view for manager-style triage

## Useful commands
```bash
bun src/cli.ts goals add --id release-q2 --title "Release Q2 hardening" --owner lead-1 --status active
bun src/cli.ts goals task add --id task-review --goal release-q2 --title "Review agent contracts" --assignee reviewer-1
bun src/cli.ts goals queue --json
```
