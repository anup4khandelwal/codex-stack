---
name: agents
summary: Manage named engineering agents, reporting lines, and dashboard views.
allowed-tools: Bash, Read, Grep, Glob
---

# Agents

Use this mode when you need to register workers, assign them to teams, or inspect the current local control-plane roster.

## What it does
- records named agents with runtime, role, team, manager, and status
- lists and shows the current roster
- writes a static dashboard summarizing current staffing and assigned work

## Useful commands
```bash
bun src/cli.ts agents list --json
bun src/cli.ts agents add --name reviewer-1 --runtime codex --role reviewer --team platform
bun src/cli.ts agents dashboard --out .codex-stack/control-plane/dashboard
```
