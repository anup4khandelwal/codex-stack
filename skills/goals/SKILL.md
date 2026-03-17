---
name: goals
summary: Track goal hierarchy and an assignable task queue for multiple agents.
allowed-tools: Bash, Read, Grep, Glob
---

# Goals

Use this mode when you need to model an initiative, attach repo goals, or assign persistent tasks to named agents that the heartbeat executor can actually run.

## What it does
- records goal hierarchy with owners and status
- maintains a local task queue with assignees, blocked/completed state, and executable action metadata
- supports one built-in delegation template per parent task so a manager loop can spawn worker tasks automatically
- exposes a queue view for manager-style triage

## Useful commands
```bash
bun src/cli.ts goals add --id release-q2 --title "Release Q2 hardening" --owner lead-1 --status active
bun src/cli.ts goals task add --id task-review --goal release-q2 --title "Review agent contracts" --assignee reviewer-1 --action-kind review --action-arg --base --action-arg origin/main --expected-minutes 10
bun src/cli.ts goals task add --id release-train --goal release-q2 --title "Coordinate release" --assignee lead-1 --action-kind custom-command --action-arg node --action-arg -e --action-arg "console.log(JSON.stringify({summary:'lead ok',nextAction:'complete'}))" --delegate-id qa-contracts --delegate-title "Run delegated QA" --delegate-assignee qa-1 --delegate-action-kind qa --delegate-action-arg http://127.0.0.1:4173/dashboard --delegate-action-arg --flow --delegate-action-arg release-dashboard
bun src/cli.ts goals queue --json
```
