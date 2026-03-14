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
bun dist/cli.js review
```

## QA mode

```text
Use codex-stack-qa to verify the staging dashboard flow, compare it to the saved snapshot, and tell me if it is safe to ship.
```

CLI:

```bash
bun dist/cli.js qa http://127.0.0.1:4173/dashboard --flow portal-dashboard --snapshot portal-dashboard --session demo --json
```

## Ship mode

```text
Use codex-stack-ship to validate the branch, push it, and open a PR if checks pass.
```

CLI:

```bash
bun dist/cli.js ship --dry-run
bun dist/cli.js ship --message "feat: ready for review" --push --pr
bun dist/cli.js ship --message "feat: ready for review" --push --pr --template .github/pull_request_template.md
bun dist/cli.js ship --message "feat: ready for review" --push --pr --reviewer octocat --assignee @me --project "Engineering Roadmap" --label release-candidate
bun dist/cli.js ship --dry-run --pr --verify-url http://127.0.0.1:4173/dashboard --verify-flow portal-dashboard --verify-snapshot portal-dashboard
```

## Browse mode

```bash
bun run demo:start
bun dist/cli.js browse flows
bun dist/cli.js browse export-flow portal-full-demo /tmp/portal-full-demo.md
bun dist/cli.js browse import-flow portal-copy /tmp/portal-full-demo.md
bun dist/cli.js browse snapshot http://127.0.0.1:4173/dashboard portal-dashboard --session friend-demo
bun dist/cli.js browse compare-snapshot http://127.0.0.1:4173/dashboard portal-dashboard --session friend-demo
bun dist/cli.js browse run-flow http://127.0.0.1:4173/login portal-login --session friend-demo
bun dist/cli.js browse run-flow http://127.0.0.1:4173/dashboard portal-dashboard --session friend-demo
bun dist/cli.js browse run-flow http://127.0.0.1:4173/login portal-full-demo --session friend-demo
bun dist/cli.js browse screenshot http://127.0.0.1:4173/dashboard /tmp/customer-portal-demo.png --session friend-demo
```

## Retro mode

```bash
bun dist/cli.js retro --since "7 days ago"
bun dist/cli.js retro --since "14 days ago" --json
bun dist/cli.js retro --since "7 days ago" --artifact-dir .codex-stack/retros
bun dist/cli.js retro --since "7 days ago" --repo anup4khandelwal/codex-stack
bun run weekly
bun scripts/weekly-digest.mjs --since "7 days ago" --publish-dir docs/weekly-digest-publish --no-github
```
