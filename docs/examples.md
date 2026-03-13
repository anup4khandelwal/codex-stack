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
node dist/cli.js ship --message "feat: ready for review" --push --pr --reviewer octocat --assignee @me --project "Engineering Roadmap" --label release-candidate
```

## Browse mode

```bash
npm run demo:start
node dist/cli.js browse flows
node dist/cli.js browse export-flow portal-full-demo /tmp/portal-full-demo.md
node dist/cli.js browse import-flow portal-copy /tmp/portal-full-demo.md
node dist/cli.js browse run-flow http://127.0.0.1:4173/login portal-login --session friend-demo
node dist/cli.js browse run-flow http://127.0.0.1:4173/dashboard portal-dashboard --session friend-demo
node dist/cli.js browse run-flow http://127.0.0.1:4173/login portal-full-demo --session friend-demo
node dist/cli.js browse screenshot http://127.0.0.1:4173/dashboard /tmp/customer-portal-demo.png --session friend-demo
```

## Retro mode

```bash
node dist/cli.js retro --since "7 days ago"
node dist/cli.js retro --since "14 days ago" --json
node dist/cli.js retro --since "7 days ago" --artifact-dir .codex-stack/retros
node dist/cli.js retro --since "7 days ago" --repo anup4khandelwal/codex-stack
npm run weekly
node scripts/weekly-digest.mjs --since "7 days ago" --publish-dir docs/weekly-digest-publish --no-github
```
