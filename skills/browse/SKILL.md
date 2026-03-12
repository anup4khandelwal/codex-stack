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

## Available commands

- `doctor`
- `status`
- `text <url>`
- `html <url> [selector]`
- `links <url>`
- `screenshot <url> [path]`
- `eval <url> <expression>`
- `flow <url> <json-steps>`

## Example

```bash
node dist/cli.js browse text https://example.com
node dist/cli.js browse screenshot https://example.com /tmp/example.png
node dist/cli.js browse flow https://example.com '[{"action":"click","selector":"a"}]'
```

## Guardrails

- Do not claim visual validation without screenshots or runtime output.
- Prefer deterministic selectors and stable flows.
