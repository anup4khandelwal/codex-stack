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
- `save-repo-flow <name> <json-steps>`
- `import-flow <name> <path>`
- `import-repo-flow <name> <path>`
- `export-flow <name> <path>`
- `show-flow <name>`
- `delete-flow <name>`
- `clear-session`
- `snapshot <url> [name]`
- `compare-snapshot <url> <name>`
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
- flow step action: `use-flow`

## Example

```bash
bun dist/cli.js browse text https://example.com --session staging
bun dist/cli.js browse save-flow login-local '[{"action":"fill","selector":"input[name=email]","value":"demo@example.com"},{"action":"fill","selector":"input[name=password]","value":"demo-pass"},{"action":"click","selector":"button[type=submit]"}]'
bun dist/cli.js browse save-repo-flow landing-smoke '[{"action":"assert-visible","selector":"body"}]'
bun dist/cli.js browse import-flow login-local ./docs/login-flow.md
bun dist/cli.js browse export-flow portal-full-demo ./docs/portal-full-demo.yaml
bun dist/cli.js browse snapshot https://example.com marketing-home --session staging
bun dist/cli.js browse compare-snapshot https://example.com marketing-home --session staging
bun dist/cli.js browse login https://example.com/login login-local --session staging
bun dist/cli.js browse assert-text https://example.com "h1" "Example Domain" --session staging
bun dist/cli.js browse screenshot https://example.com /tmp/example.png --session staging
bun dist/cli.js browse sessions
```

## Guardrails

- Do not claim visual validation without screenshots or runtime output.
- Prefer deterministic selectors and stable flows.
- Reuse named sessions for authenticated flows so login state persists.
- Check in shared flows under `browse/flows/`; keep machine-specific experiments in `.codex-stack/browse/flows/`.
- Prefer composing shared flows with `use-flow` instead of duplicating login/setup steps across many files.
- Prefer Markdown or YAML exports when flows need code review, because they diff more cleanly than inline JSON strings.
- For repeatable authenticated demos, start the flow with a `clear-storage` step so persistent sessions do not skip the login screen.
- Use snapshots when you need a baseline for later regression checks; use `qa` when you need a scored report built from those checks.
