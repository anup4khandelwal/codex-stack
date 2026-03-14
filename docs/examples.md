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
bun src/cli.ts review
```

## QA mode

```text
Use codex-stack-qa to verify the staging dashboard flow, compare it to the saved snapshot, and tell me if it is safe to ship.
```

CLI:

```bash
bun src/cli.ts qa http://127.0.0.1:4173/dashboard --flow portal-dashboard --snapshot portal-dashboard --session demo --json
```

## Ship mode

```text
Use codex-stack-ship to validate the branch, push it, and open a PR if checks pass.
```

CLI:

```bash
bun src/cli.ts issue start --title "Harden PR workflow" --label automation --prefix feat
bun src/cli.ts ship --dry-run
bun src/cli.ts ship --message "feat: ready for review" --push --pr
bun src/cli.ts ship --message "feat: ready for review" --push --pr --template .github/pull_request_template.md
bun src/cli.ts ship --message "feat: ready for review" --push --pr --reviewer octocat --assignee @me --project "Engineering Roadmap" --label release-candidate
bun src/cli.ts ship --dry-run --pr --verify-url http://127.0.0.1:4173/dashboard --verify-flow portal-dashboard --verify-snapshot portal-dashboard
```

## Browse mode

```bash
bun run demo:start
bun src/cli.ts browse flows
bun src/cli.ts browse export-flow portal-full-demo /tmp/portal-full-demo.md
bun src/cli.ts browse import-flow portal-copy /tmp/portal-full-demo.md
bun src/cli.ts browse snapshot http://127.0.0.1:4173/dashboard portal-dashboard --session friend-demo
bun src/cli.ts browse compare-snapshot http://127.0.0.1:4173/dashboard portal-dashboard --session friend-demo
bun src/cli.ts browse run-flow http://127.0.0.1:4173/login portal-login --session friend-demo
bun src/cli.ts browse run-flow http://127.0.0.1:4173/dashboard portal-dashboard --session friend-demo
bun src/cli.ts browse run-flow http://127.0.0.1:4173/login portal-full-demo --session friend-demo
bun src/cli.ts browse screenshot http://127.0.0.1:4173/dashboard /tmp/customer-portal-demo.png --session friend-demo
```

## Retro mode

```bash
bun src/cli.ts retro --since "7 days ago"
bun src/cli.ts retro --since "14 days ago" --json
bun src/cli.ts retro --since "7 days ago" --artifact-dir .codex-stack/retros
bun src/cli.ts retro --since "7 days ago" --repo anup4khandelwal/codex-stack
bun run weekly
bun scripts/weekly-digest.ts --since "7 days ago" --publish-dir docs/weekly-digest-publish --no-github
```

## Upgrade mode

```text
Use codex-stack-upgrade to check whether this codex-stack install is behind on dependencies, workflow actions, or local skill links.
```

CLI:

```bash
bun src/cli.ts upgrade --offline
bun src/cli.ts upgrade --json
bun src/cli.ts upgrade --markdown-out docs/daily-update-check.md --json-out docs/daily-update-check.json
```
