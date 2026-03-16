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
bun src/cli.ts qa http://127.0.0.1:4173/dashboard --flow release-dashboard --snapshot release-dashboard --session demo --json
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
bun src/cli.ts deploy --url https://staging.example.com --path / --path /dashboard --path /changes --device desktop --device mobile --flow release-dashboard --flow release-changes --snapshot release-dashboard
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
bun src/cli.ts ship --dry-run --pr --verify-url http://127.0.0.1:4173 --verify-path /dashboard --verify-path /changes --verify-device desktop --verify-device mobile --verify-console-errors --verify-flow release-dashboard --verify-flow release-changes --verify-snapshot release-dashboard
```

## Browse mode

```bash
bun run demo:start
bun run demo:publish-qa
bun src/cli.ts browse flows
bun src/cli.ts browse export-flow release-full-demo /tmp/release-full-demo.md
bun src/cli.ts browse import-flow portal-copy /tmp/release-full-demo.md
bun src/cli.ts browse export-session /tmp/portal-session.json --session friend-demo
bun src/cli.ts browse import-session /tmp/portal-session.json --session friend-demo-copy
bun src/cli.ts browse import-browser-cookies chrome --session friend-demo --profile Default
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
bun src/cli.ts browse snapshot http://127.0.0.1:4173/dashboard release-dashboard --session friend-demo
bun src/cli.ts browse compare-snapshot http://127.0.0.1:4173/dashboard release-dashboard --session friend-demo
bun src/cli.ts browse run-flow http://127.0.0.1:4173/login release-login --session friend-demo
bun src/cli.ts browse run-flow http://127.0.0.1:4173/dashboard release-dashboard --session friend-demo
bun src/cli.ts browse run-flow http://127.0.0.1:4173/changes release-changes --session friend-demo
bun src/cli.ts browse run-flow http://127.0.0.1:4173/login release-full-demo --session friend-demo
bun src/cli.ts browse screenshot http://127.0.0.1:4173/changes /tmp/release-readiness-demo.png --session friend-demo
```

The public QA Pages landing view is backed by the tracked sample report in `docs/qa/release-readiness-demo/`. Refresh it with `bun run demo:publish-qa` whenever the demo story or evidence model changes.

## Authenticated preview verification

```bash
bun src/cli.ts browse import-browser-cookies chrome --session preview-auth --profile Default
bun src/cli.ts browse export-session .codex-stack/private/preview-auth.json --session preview-auth
bun src/cli.ts preview \
  --url "https://anup4khandelwal.github.io/codex-stack/pr-preview/pr-42/" \
  --pr 42 \
  --branch feat/42-preview \
  --sha abcdef1234567890 \
  --path /dashboard \
  --device desktop \
  --flow release-dashboard \
  --session preview-auth \
  --session-bundle .codex-stack/private/preview-auth.json
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

## Agents mode

```text
Use codex-stack-agents to register the active engineering agents, define who reports to whom, and show me the current local staffing view.
```

CLI:

```bash
bun src/cli.ts agents add --name lead-1 --runtime codex --role manager --team platform --status working
bun src/cli.ts agents add --name reviewer-1 --runtime claude-code --role reviewer --team platform --manager lead-1
bun src/cli.ts agents dashboard --out .codex-stack/control-plane/dashboard
```

## Goals mode

```text
Use codex-stack-goals to turn this initiative into a tracked goal tree with a real task queue for the assigned agents.
```

CLI:

```bash
bun src/cli.ts goals add --id release-q2 --title "Release Q2 hardening" --type initiative --owner lead-1 --status active
bun src/cli.ts goals task add --id review-contracts --goal release-q2 --title "Review agent contracts" --assignee reviewer-1
bun src/cli.ts goals task delegate review-contracts --id qa-contracts --title "Run delegated QA" --assignee qa-1
bun src/cli.ts goals queue --json
```

## Heartbeat mode

```text
Use codex-stack-heartbeat to schedule this agent on a loop, preserve its continuity state, and tell me what it should do next.
```

CLI:

```bash
bun src/cli.ts heartbeat schedule add --agent reviewer-1 --task review-contracts --trigger cron --expression "*/30 * * * *" --summary "Review queue" --retry-limit 2 --cooldown-minutes 30
bun src/cli.ts heartbeat due --agent reviewer-1 --json
bun src/cli.ts heartbeat beat --agent reviewer-1 --task review-contracts --summary "Reviewed queue" --next-action "Run QA after approval" --json
bun src/cli.ts heartbeat show reviewer-1 --json
```

## Approvals mode

```text
Use codex-stack-approvals when an agent needs an explicit gate before shipping, merging, updating snapshots, or exceeding its budget.
```

CLI:

```bash
bun src/cli.ts approvals request --agent reviewer-1 --kind ship-pr --target review-contracts --summary "Open release PR"
bun src/cli.ts approvals approve <approval-id> --by lead-1 --note "Approved release work"
bun src/cli.ts approvals gate --agent reviewer-1 --kind ship-pr --target review-contracts --json
bun src/cli.ts ship --dry-run --pr --control-agent reviewer-1 --control-state .codex-stack/control-plane/state.json
bun src/cli.ts fleet remediate --manifest .codex-stack/fleet.example.json --dry-run --open-prs --control-agent lead-1 --control-state .codex-stack/control-plane/state.json --json
```

## MCP mode

```text
Use codex-stack-mcp to expose codex-stack workflows and published QA evidence to an MCP-capable client without giving it mutation access.
```

CLI:

```bash
bun src/cli.ts mcp inspect --json
bun src/cli.ts mcp serve
```
