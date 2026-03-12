# Commands

## Root CLI

```bash
node dist/cli.js list
node dist/cli.js show review
node dist/cli.js path ship
node dist/cli.js review
node dist/cli.js review --json
node dist/cli.js ship --dry-run
node dist/cli.js retro --since "7 days ago"
node dist/cli.js doctor
node dist/cli.js browse doctor
node dist/cli.js browse text https://example.com --session staging
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
```

## Retro workflow

```bash
node scripts/retro-report.mjs --since "7 days ago"
node scripts/retro-report.mjs --since "14 days ago" --json
node scripts/retro-report.mjs --since "30 days ago" --out .codex-stack/retros/latest.md --json-out .codex-stack/retros/latest.json
```

## Planned future commands

```bash
codex-stack browse goto http://localhost:3000
codex-stack browse snapshot
codex-stack ship --label release-candidate
```
