---
name: heartbeat
summary: Run or schedule agent heartbeats and maintain per-agent continuity state.
allowed-tools: Bash, Read, Grep, Glob
---

# Heartbeat

Use this mode when you want to wake an agent on a loop, record what it just did, and preserve the next action for the next run.

## What it does
- records heartbeat schedules and live heartbeat runs
- persists per-agent continuity state such as current task, branch, PR, summary, and next action
- enforces approval and budget checks through the shared control-plane state

## Useful commands
```bash
bun src/cli.ts heartbeat schedule add --agent ship-1 --task ship-pr --trigger cron --expression "*/15 * * * *" --summary "Check release branch"
bun src/cli.ts heartbeat beat --agent ship-1 --task ship-pr --summary "Ready to open PR" --next-action "Open PR after approval" --require-approval ship-pr --approval-target ship-pr --json
bun src/cli.ts heartbeat show ship-1 --json
```
