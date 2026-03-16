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
- `export-session <path>`
- `import-session <path>`
- `import-cookies <path>`
- `import-browser-cookies <browser>`
- `a11y <url>`
- `perf <url>`
- `snapshot <url> [name]`
- `compare-snapshot <url> <name>`
- `probe <url>`
- `text <url>`
- `html <url> [selector]`
- `links <url>`
- `screenshot <url> [path]`
- `mock <url> <pattern> <json-config>`
- `block <url> <pattern>`
- `download <url> <selector> [path]`
- `assert-download <url> <selector> <expected-name-fragment> [path]`
- `eval <url> <expression>`
- `click <url> <selector>`
- `fill <url> <selector> <value>`
- `upload <url> <selector> <path>`
- `dialog <url> <accept|dismiss> [selector] [prompt]`
- `wait <url> [selector|ms:<n>|url:<target>|load:<state>|state:<state>:<selector>]`
- `press <url> <selector> <key>`
- `assert-visible <url> <selector>`
- `assert-hidden <url> <selector>`
- `assert-enabled <url> <selector>`
- `assert-disabled <url> <selector>`
- `assert-checked <url> <selector>`
- `assert-editable <url> <selector>`
- `assert-focused <url> <selector>`
- `assert-text <url> <selector> <expected>`
- `assert-url <url> <expected>`
- `assert-count <url> <selector> <expected-count>`
- `flow <url> <json-steps>`
- `run-flow <url> <name>`
- `login <url> <name>`
- flow step action: `use-flow`
- flow step action: `route`
- flow step action: `clear-routes`
- flow step action: `download`
- flow step action: `assert-download`

## Example

```bash
bun src/cli.ts browse text https://example.com --session staging
bun src/cli.ts browse save-flow login-local '[{"action":"fill","selector":"input[name=email]","value":"demo@example.com"},{"action":"fill","selector":"input[name=password]","value":"demo-pass"},{"action":"click","selector":"button[type=submit]"}]'
bun src/cli.ts browse save-repo-flow landing-smoke '[{"action":"assert-visible","selector":"body"}]'
bun src/cli.ts browse import-flow login-local ./docs/login-flow.md
bun src/cli.ts browse export-flow release-full-demo ./docs/release-full-demo.yaml
bun src/cli.ts browse export-session ./tmp/staging-session.json --session staging
bun src/cli.ts browse import-session ./tmp/staging-session.json --session staging-copy
bun src/cli.ts browse import-browser-cookies chrome --session staging --profile Default
bun src/cli.ts browse a11y https://example.com/dashboard --scope main --impact serious --session staging
bun src/cli.ts browse perf https://example.com/dashboard --budget lcp=2s --budget cls=0.1 --wait-ms 400 --session staging
bun src/cli.ts browse probe https://example.com/settings --session staging
bun src/cli.ts browse upload https://example.com/profile "input[type=file]" ./fixtures/avatar.png --session staging
bun src/cli.ts browse dialog https://example.com/settings accept "#delete-confirm" --session staging
bun src/cli.ts browse wait https://example.com/dashboard load:domcontentloaded --session staging
bun src/cli.ts browse click https://example.com/login "role:button:Continue" --session staging --device mobile
bun src/cli.ts browse fill https://example.com/login "label:Email" demo@example.com --session staging
bun src/cli.ts browse html https://example.com/search "placeholder:Search" --session staging
bun src/cli.ts browse assert-visible https://example.com/home "testid:hero" --session staging
bun src/cli.ts browse click https://example.com/checkout "role:button:Pay now" --session staging --frame "name:payment"
bun src/cli.ts browse mock https://example.com/app "**/api/profile" '{"status":503,"json":{"error":"offline"}}' --session staging
bun src/cli.ts browse block https://example.com/app "**/analytics/**" --session staging
bun src/cli.ts browse download https://example.com/reports "role:button:Export CSV" ./artifacts/report.csv --session staging
bun src/cli.ts browse assert-download https://example.com/reports "role:button:Export CSV" report.csv ./artifacts/report.csv --session staging
bun src/cli.ts browse snapshot https://example.com marketing-home --session staging
bun src/cli.ts browse compare-snapshot https://example.com marketing-home --session staging
bun src/cli.ts browse login https://example.com/login login-local --session staging
bun src/cli.ts browse assert-focused https://example.com/login "input[name=email]" --session staging
bun src/cli.ts browse assert-disabled https://example.com/settings "button[disabled]" --session staging
bun src/cli.ts browse assert-text https://example.com "h1" "Example Domain" --session staging
bun src/cli.ts browse screenshot https://example.com /tmp/example.png --session staging
bun src/cli.ts browse sessions
```

## Guardrails

- Do not claim visual validation without screenshots or runtime output.
- Prefer deterministic selectors and stable flows.
- Prefer semantic selectors when possible: `role:button:Save`, `label:Email`, `placeholder:Search`, `text:Welcome back`, `testid:hero`.
- Use `--frame name:<name>`, `--frame url:<fragment>`, or `--frame <iframe-selector>` when the target element lives inside an iframe.
- Use `route` / `clear-routes` flow steps or the `mock` / `block` commands to stabilize flaky third-party calls and test failure paths before navigation starts.
- Use `download` / `assert-download` when the flow should prove that an export file was actually saved, not just that the export button was clicked.
- Reuse named sessions for authenticated flows so login state persists.
- Use `--device mobile|tablet|desktop` when the check is viewport-sensitive or when a bug only reproduces responsively.
- Export/import session bundles when authenticated QA needs to move between machines or named sessions.
- Use `a11y` and `perf` when you need raw browser evidence before turning it into a scored `qa` report.
- Use `import-browser-cookies` on macOS when you already have a signed-in Chrome, Arc, Brave, or Edge profile and want to bootstrap a named Codex session quickly.
- Use `dialog` before the click that triggers a modal or confirm prompt so the handler is armed in time.
- Check in shared flows under `browse/flows/`; keep machine-specific experiments in `.codex-stack/browse/flows/`.
- Prefer composing shared flows with `use-flow` instead of duplicating login/setup steps across many files.
- Prefer Markdown or YAML exports when flows need code review, because they diff more cleanly than inline JSON strings.
- For repeatable authenticated demos, start the flow with a `clear-storage` step so persistent sessions do not skip the login screen.
- Use snapshots when you need a baseline for later regression checks; use `qa` when you need a scored report built from those checks.
