---
name: mcp
summary: Expose codex-stack workflows and evidence through a local stdio MCP server.
allowed-tools: Bash, Read, Grep, Glob
---

# MCP

Use this mode when you need to wire `codex-stack` into an MCP-capable client.

## What it does
- starts a local `stdio` MCP server from the current repo
- exposes read-only workflow tools for review, QA, preview, deploy, ship planning, fleet planning, retro, and upgrade checks
- exposes resources for registered modes, skill files, published QA reports, and fleet metadata

## Operating rules
- v1 is read-only plus dry-run only
- do not expose live repo or GitHub mutation through MCP
- prefer existing JSON-capable scripts rather than re-implementing workflow logic

## Useful commands
```bash
bun src/cli.ts mcp inspect --json
bun src/cli.ts mcp serve
```
