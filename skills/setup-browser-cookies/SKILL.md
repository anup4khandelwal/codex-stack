---
name: setup-browser-cookies
description: Capture authenticated browser state from a local Chrome-family profile and prepare it for Codex preview/QA runs.
allowed-tools:
  - Read
  - Bash
---

# /setup-browser-cookies

Use this mode when the operator needs authenticated `browse`, `qa`, `preview`, or `deploy` runs without logging in manually inside every flow.

## Objective

Turn an existing signed-in local browser session into a reusable Codex session bundle and CI secret.

## Workflow

1. Import cookies from a local macOS Chrome-family browser profile into a named Codex browser session.
2. Verify the imported session with a lightweight authenticated page probe.
3. Export that Codex session as a bundle file.
4. Base64-encode the bundle for `CODEX_STACK_PREVIEW_SESSION_BUNDLE_B64` when CI preview verification also needs authentication.
5. Keep the bundle out of git-tracked paths.

## CLI

```bash
bun src/cli.ts browse import-browser-cookies chrome --session preview-auth --profile Default
bun src/cli.ts browse probe https://example.com/dashboard --session preview-auth
bun src/cli.ts browse export-session ./.tmp/preview-auth-session.json --session preview-auth
base64 < ./.tmp/preview-auth-session.json | pbcopy
```

## Output format

- Imported browser and profile
- Target Codex session name
- Cookie/origin counts
- Follow-up commands for probe, export, and CI secret setup

## Guardrails

- This command is macOS-only in v1.
- Use a non-tracked path such as `.tmp/` for exported bundles.
- Do not print session bundle contents into logs or PR comments.
- If the browser profile is locked, close the browser and retry.
