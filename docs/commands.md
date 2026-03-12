# Commands

## Root CLI

```bash
node dist/cli.js list
node dist/cli.js show review
node dist/cli.js path ship
node dist/cli.js review
node dist/cli.js review --json
node dist/cli.js ship --dry-run
node dist/cli.js ship --message "feat: ready for review" --push --pr --template .github/pull_request_template.md
node dist/cli.js retro --since "7 days ago"
node dist/cli.js retro --since "7 days ago" --artifact-dir .codex-stack/retros
node dist/cli.js doctor
node dist/cli.js browse doctor
node dist/cli.js browse text https://example.com --session staging
node dist/cli.js browse save-flow login-local '[{"action":"fill","selector":"input[name=email]","value":"demo@example.com"},{"action":"fill","selector":"input[name=password]","value":"demo-pass"},{"action":"click","selector":"button[type=submit]"}]'
node dist/cli.js browse login https://example.com/login login-local --session staging
node dist/cli.js browse click https://example.com "button[type=submit]" --session staging
node dist/cli.js browse fill https://example.com/login "input[name=email]" demo@example.com --session staging
node dist/cli.js browse wait https://example.com/dashboard "text=Dashboard" --session staging
node dist/cli.js browse sessions
node dist/cli.js browse clear-session staging
node dist/cli.js browse screenshot https://example.com /tmp/example.png
```

## Review workflow

```bash
node scripts/review-diff.mjs
node scripts/review-diff.mjs --json
node scripts/review-diff.mjs --base origin/main
```

## Ship workflow

```bash
node scripts/ship-branch.mjs --dry-run
node scripts/ship-branch.mjs --message "feat: ready for review" --push
node scripts/ship-branch.mjs --message "feat: ready for review" --push --pr
node scripts/ship-branch.mjs --message "feat: ready for review" --push --pr --template .github/pull_request_template.md
node scripts/ship-branch.mjs --message "feat: ready for review" --push --pr --draft
```

Notes:

- If no PR title is supplied, `ship` derives one from the latest commit or branch name.
- If no PR body is supplied, `ship` generates one from the diff and will merge it into a detected PR template when available.

## Retro workflow

```bash
node scripts/retro-report.mjs --since "7 days ago"
node scripts/retro-report.mjs --since "14 days ago" --json
node scripts/retro-report.mjs --since "30 days ago" --out .codex-stack/retros/latest.md --json-out .codex-stack/retros/latest.json
node scripts/retro-report.mjs --since "7 days ago" --artifact-dir .codex-stack/retros
node scripts/retro-report.mjs --since "7 days ago" --no-artifacts
```

Notes:

- By default, every retro run writes `latest.md`, `latest.json`, and timestamped snapshots under `.codex-stack/retros/`.

## Browse workflow

```bash
node browse/dist/cli.js flows
node browse/dist/cli.js save-flow smoke-login '[{"action":"fill","selector":"input[name=email]","value":"demo@example.com"},{"action":"fill","selector":"input[name=password]","value":"demo-pass"},{"action":"click","selector":"button[type=submit]"},{"action":"wait","selector":"text=Dashboard"}]'
node browse/dist/cli.js run-flow https://example.com/login smoke-login --session staging
node browse/dist/cli.js press https://example.com "input[name=search]" Enter --session staging
```
