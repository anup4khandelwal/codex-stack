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
bun src/cli.ts qa https://preview.example.com --mode diff-aware --base-ref origin/main --session preview --json
```

## Preview mode

```text
Use codex-stack-preview to verify the pull request preview deployment, wait for it to become ready, and tell me whether the preview is safe to merge.
```

CLI:

```bash
bun src/cli.ts preview --url-template "https://preview-{pr}.example.com" --pr 42 --branch feat/42-preview --sha abcdef1234567890 --path / --path /dashboard --device desktop --device mobile --flow landing-smoke --snapshot landing-home
```

## Deploy mode

```text
Use codex-stack-deploy to verify the staging deploy across key pages and devices, capture screenshots, and tell me if it is safe to merge.
```

CLI:

```bash
bun src/cli.ts deploy --url https://staging.example.com --path / --path /dashboard --device desktop --device mobile --flow portal-dashboard --snapshot portal-dashboard
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
bun src/cli.ts ship --dry-run --pr --verify-url http://127.0.0.1:4173 --verify-path /dashboard --verify-device desktop --verify-console-errors --verify-flow portal-dashboard --verify-snapshot portal-dashboard
```

## Browse mode

```bash
bun run demo:start
bun src/cli.ts browse flows
bun src/cli.ts browse export-flow portal-full-demo /tmp/portal-full-demo.md
bun src/cli.ts browse import-flow portal-copy /tmp/portal-full-demo.md
bun src/cli.ts browse export-session /tmp/portal-session.json --session friend-demo
bun src/cli.ts browse import-session /tmp/portal-session.json --session friend-demo-copy
bun src/cli.ts browse probe http://127.0.0.1:4173/dashboard --session friend-demo
bun src/cli.ts browse upload http://127.0.0.1:4173/profile "input[type=file]" ./fixtures/avatar.png --session friend-demo
bun src/cli.ts browse dialog http://127.0.0.1:4173/settings accept "#delete-confirm" --session friend-demo
bun src/cli.ts browse wait http://127.0.0.1:4173/dashboard load:domcontentloaded --session friend-demo
bun src/cli.ts browse click http://127.0.0.1:4173/login "role:button:Continue" --session friend-demo --device mobile
bun src/cli.ts browse fill http://127.0.0.1:4173/login "label:Email" demo@example.com --session friend-demo
bun src/cli.ts browse assert-visible http://127.0.0.1:4173/dashboard "testid:hero" --session friend-demo
bun src/cli.ts browse click http://127.0.0.1:4173/checkout "role:button:Pay now" --session friend-demo --frame "name:payment"
bun src/cli.ts browse mock http://127.0.0.1:4173/dashboard "**/api/profile" '{"status":503,"json":{"error":"offline"}}' --session friend-demo
bun src/cli.ts browse download http://127.0.0.1:4173/reports "role:button:Export CSV" ./artifacts/report.csv --session friend-demo
bun src/cli.ts browse assert-focused http://127.0.0.1:4173/login "input[name=email]" --session friend-demo
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
bun src/cli.ts upgrade --offline --apply
bun src/cli.ts upgrade --markdown-out docs/daily-update-check.md --json-out docs/daily-update-check.json
```
