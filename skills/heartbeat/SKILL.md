---
name: heartbeat
summary: Run or schedule agent heartbeats and maintain per-agent continuity state.
allowed-tools: Bash, Read, Grep, Glob
---

# Heartbeat

Use this mode when you want to wake an agent on a loop, claim executable work, run one bounded workflow step, and preserve the next action for the next run.

## What it does
- records heartbeat schedules, autonomous execution runs, and live/manual heartbeat runs
- persists per-agent continuity state such as current task, branch, PR, summary, and next action
- enforces approval and budget checks through the shared control-plane state
- writes an execution ledger so you can inspect blocked, skipped, warning, and successful loop steps separately from raw heartbeat records

## Useful commands
```bash
bun src/cli.ts heartbeat schedule add --agent ship-1 --task ship-pr --trigger cron --expression "*/15 * * * *" --summary "Check release branch"
bun src/cli.ts goals task add --id review-contracts --goal release-q2 --title "Review agent contracts" --assignee reviewer-1 --action-kind review --action-arg --base --action-arg origin/main --expected-minutes 10
bun src/cli.ts heartbeat run-due --max-agents 1 --max-tasks 1 --json
bun src/cli.ts heartbeat run-agent --agent ship-1 --json
bun src/cli.ts heartbeat beat --agent ship-1 --task ship-pr --summary "Ready to open PR" --next-action "Open PR after approval" --require-approval ship-pr --approval-target ship-pr --json
bun src/cli.ts heartbeat show ship-1 --json
bun src/cli.ts heartbeat inspect --agent ship-1 --json
```
