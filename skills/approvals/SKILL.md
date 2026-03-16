---
name: approvals
summary: Manage approval requests and gate high-risk autonomous actions.
allowed-tools: Bash, Read, Grep, Glob
---

# Approvals

Use this mode when an agent needs explicit approval before a high-risk action or after exceeding its budget.

## What it does
- creates approval requests
- approves, rejects, or cancels them
- checks whether a specific gate is currently open

## Useful commands
```bash
bun src/cli.ts approvals request --agent ship-1 --kind ship-pr --target ship-pr --summary "Open release PR"
bun src/cli.ts approvals approve <id> --by lead-1 --note "Approved release PR"
bun src/cli.ts approvals gate --agent ship-1 --kind ship-pr --target ship-pr --json
```
