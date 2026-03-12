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
- `sessions`
- `flows`
- `save-flow <name> <json-steps>`
- `show-flow <name>`
- `delete-flow <name>`
- `clear-session`
- `text <url>`
- `html <url> [selector]`
- `links <url>`
- `screenshot <url> [path]`
- `eval <url> <expression>`
- `click <url> <selector>`
- `fill <url> <selector> <value>`
- `wait <url> [selector|ms:<n>|url:<target>]`
- `press <url> <selector> <key>`
- `assert-visible <url> <selector>`
- `assert-text <url> <selector> <expected>`
- `assert-url <url> <expected>`
- `assert-count <url> <selector> <expected-count>`
- `flow <url> <json-steps>`
- `run-flow <url> <name>`
- `login <url> <name>`

## Example

```bash
node dist/cli.js browse text https://example.com --session staging
node dist/cli.js browse save-flow login-local '[{"action":"fill","selector":"input[name=email]","value":"demo@example.com"},{"action":"fill","selector":"input[name=password]","value":"demo-pass"},{"action":"click","selector":"button[type=submit]"}]'
node dist/cli.js browse login https://example.com/login login-local --session staging
node dist/cli.js browse assert-text https://example.com "h1" "Example Domain" --session staging
node dist/cli.js browse screenshot https://example.com /tmp/example.png --session staging
node dist/cli.js browse sessions
```

## Guardrails

- Do not claim visual validation without screenshots or runtime output.
- Prefer deterministic selectors and stable flows.
- Reuse named sessions for authenticated flows so login state persists.
