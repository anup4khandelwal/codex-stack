---
name: browse
description: Browser-based QA workflow for Codex.
allowed-tools:
  - Read
  - Bash
---

# /browse

Use this mode when the agent needs to inspect a real web page, click through a flow, or validate a deployment visually.

## Objective

Give the agent eyes for QA and deployment checks.

## Current state

This repo currently scaffolds the browser mode. The runtime is not fully implemented in `v0.1.0`.

## Planned commands

- `goto`
- `text`
- `snapshot`
- `click`
- `fill`
- `console`
- `network`
- `screenshot`

## Guardrails

- Do not claim visual validation without screenshots or runtime output.
- Prefer deterministic selectors and stable flows.
