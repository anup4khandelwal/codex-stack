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
```

## Browse mode

```bash
node dist/cli.js browse text https://example.com --session staging
node dist/cli.js browse screenshot https://example.com /tmp/example.png --session staging
node dist/cli.js browse sessions
```

## Retro mode

```bash
node dist/cli.js retro --since "7 days ago"
node dist/cli.js retro --since "14 days ago" --json
```
