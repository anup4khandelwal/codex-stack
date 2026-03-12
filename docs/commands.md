# Commands

## Root CLI

```bash
node dist/cli.js list
node dist/cli.js show review
node dist/cli.js path ship
node dist/cli.js review
node dist/cli.js review --json
node dist/cli.js doctor
node dist/cli.js browse doctor
node dist/cli.js browse text https://example.com
node dist/cli.js browse screenshot https://example.com /tmp/example.png
```

## Review workflow

```bash
node scripts/review-diff.mjs
node scripts/review-diff.mjs --json
node scripts/review-diff.mjs --base origin/main
```

## Planned future commands

```bash
codex-stack browse goto http://localhost:3000
codex-stack browse snapshot
codex-stack retro --since 7d
```
