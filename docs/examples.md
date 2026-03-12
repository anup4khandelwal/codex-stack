# Examples

## Product mode

```text
Use codex-stack-product to rethink this feature request:
"Add photo upload to the seller listing flow."
```

## Tech mode

```text
Use codex-stack-tech to create the engineering plan for the approved seller listing workflow.
```

## Review mode

```text
Use codex-stack-review to audit the current branch against main and focus on structural production risks.
```

CLI:

```bash
node dist/cli.js review
```

## Ship mode

```text
Use codex-stack-ship to validate the branch, push it, and open a PR if checks pass.
```

CLI:

```bash
node dist/cli.js ship --dry-run
node dist/cli.js ship --message "feat: ready for review" --push --pr
node dist/cli.js ship --message "feat: ready for review" --push --pr --template .github/pull_request_template.md
node dist/cli.js ship --message "feat: ready for review" --push --pr --reviewer octocat --label release-candidate
```

## Browse mode

```bash
node dist/cli.js browse flows
node dist/cli.js browse text https://example.com --session staging
node dist/cli.js browse fill https://example.com/login "input[name=email]" demo@example.com --session staging
node dist/cli.js browse click https://example.com/login "button[type=submit]" --session staging
node dist/cli.js browse save-flow login-local '[{"action":"fill","selector":"input[name=email]","value":"demo@example.com"},{"action":"fill","selector":"input[name=password]","value":"demo-pass"},{"action":"click","selector":"button[type=submit]"}]'
node dist/cli.js browse save-repo-flow landing-smoke '[{"action":"assert-visible","selector":"body"}]'
node dist/cli.js browse login https://example.com/login login-local --session staging
node dist/cli.js browse assert-visible https://example.com "main" --session staging
node dist/cli.js browse assert-text https://example.com "h1" "Example Domain" --session staging
node dist/cli.js browse screenshot https://example.com /tmp/example.png --session staging
node dist/cli.js browse sessions
```

## Retro mode

```bash
node dist/cli.js retro --since "7 days ago"
node dist/cli.js retro --since "14 days ago" --json
node dist/cli.js retro --since "7 days ago" --artifact-dir .codex-stack/retros
node dist/cli.js retro --since "7 days ago" --repo anup4khandelwal/codex-stack
```
