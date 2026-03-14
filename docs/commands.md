# Commands

## Root CLI

```bash
node dist/cli.js list
node dist/cli.js show review
node dist/cli.js path ship
node dist/cli.js review
node dist/cli.js review --json
node dist/cli.js qa http://127.0.0.1:4173/dashboard --flow portal-dashboard --snapshot portal-dashboard --session demo --json
node dist/cli.js ship --dry-run
node dist/cli.js ship --message "feat: ready for review" --push --pr --template .github/pull_request_template.md
node dist/cli.js ship --message "feat: ready for review" --push --pr --reviewer octocat --team-reviewer acme/platform --assignee @me --project "Engineering Roadmap" --label release-candidate
node dist/cli.js ship --dry-run --pr --verify-url http://127.0.0.1:4173/dashboard --verify-flow portal-dashboard --verify-snapshot portal-dashboard
node dist/cli.js retro --since "7 days ago"
node dist/cli.js retro --since "7 days ago" --artifact-dir .codex-stack/retros
node dist/cli.js retro --since "7 days ago" --repo anup4khandelwal/codex-stack
node dist/cli.js retro --since "7 days ago" --no-github
node dist/cli.js doctor
node dist/cli.js browse doctor
node dist/cli.js browse flows
node dist/cli.js browse text https://example.com --session staging
node dist/cli.js browse save-flow login-local '[{"action":"fill","selector":"input[name=email]","value":"demo@example.com"},{"action":"fill","selector":"input[name=password]","value":"demo-pass"},{"action":"click","selector":"button[type=submit]"}]'
node dist/cli.js browse save-repo-flow landing-smoke '[{"action":"assert-visible","selector":"main"}]'
node dist/cli.js browse import-flow login-local ./docs/login-flow.md
node dist/cli.js browse import-repo-flow landing-smoke ./docs/landing-smoke.yaml
node dist/cli.js browse export-flow portal-full-demo ./docs/portal-full-demo.md
node dist/cli.js browse snapshot https://example.com marketing-home --session staging
node dist/cli.js browse compare-snapshot https://example.com marketing-home --session staging
node dist/cli.js browse login https://example.com/login login-local --session staging
node dist/cli.js browse click https://example.com "button[type=submit]" --session staging
node dist/cli.js browse fill https://example.com/login "input[name=email]" demo@example.com --session staging
node dist/cli.js browse wait https://example.com/dashboard "text=Dashboard" --session staging
node dist/cli.js browse assert-visible https://example.com "main" --session staging
node dist/cli.js browse assert-text https://example.com "h1" "Example Domain" --session staging
node dist/cli.js browse assert-count https://example.com "a" 1 --session staging
node dist/cli.js browse run-flow http://127.0.0.1:4173/login portal-full-demo --session friend-demo
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
node scripts/ship-branch.mjs --message "feat: ready for review" --push --pr --reviewer octocat --team-reviewer acme/platform --assignee @me --project "Engineering Roadmap" --label release-candidate
node scripts/ship-branch.mjs --dry-run --pr --verify-url http://127.0.0.1:4173/dashboard --verify-flow portal-dashboard --verify-snapshot portal-dashboard
node scripts/ship-branch.mjs --message "feat: ready for review" --push --pr --draft
```

Notes:

- If no PR title is supplied, `ship` derives one from the latest commit or branch name.
- If no PR body is supplied, `ship` generates one from the diff and will merge it into a detected PR template when available.
- `ship` infers labels from branch and changed files, and infers reviewers from `CODEOWNERS` unless you disable that behavior.
- When GitHub access is available, `ship` creates missing labels before attaching them to the PR.
- `ship` can also assign users and attach projects with `--assignee`, `--assign-self`, and `--project`.
- `ship` can call the QA workflow before push/PR creation with `--verify-url`, `--verify-flow`, and `--verify-snapshot`.

## QA workflow

```bash
node scripts/qa-run.mjs http://127.0.0.1:4173/dashboard --flow portal-dashboard --snapshot portal-dashboard --session demo --json
node scripts/qa-run.mjs http://127.0.0.1:4173/login --flow portal-full-demo --snapshot portal-login --session demo
```

Notes:

- `qa` writes markdown/json artifacts under `.codex-stack/qa/`.
- It upgrades raw browser evidence into findings, severity, health score, and recommendation.
- Snapshot-based failures also emit annotated SVG evidence under `.codex-stack/qa/annotations/`.
- Use `--update-snapshot` when the UI change is intentional and the baseline should move.

## Retro workflow

```bash
node scripts/retro-report.mjs --since "7 days ago"
node scripts/retro-report.mjs --since "14 days ago" --json
node scripts/retro-report.mjs --since "30 days ago" --out .codex-stack/retros/latest.md --json-out .codex-stack/retros/latest.json
node scripts/retro-report.mjs --since "7 days ago" --artifact-dir .codex-stack/retros
node scripts/retro-report.mjs --since "7 days ago" --no-artifacts
node scripts/retro-report.mjs --since "7 days ago" --repo anup4khandelwal/codex-stack
node scripts/retro-report.mjs --since "7 days ago" --no-github
node scripts/weekly-digest.mjs --since "7 days ago" --no-github
node scripts/weekly-digest.mjs --since "7 days ago" --publish-dir docs/weekly-digest-publish --no-github
```

Notes:

- By default, every retro run writes `latest.md`, `latest.json`, and timestamped snapshots under `.codex-stack/retros/`.
- When GitHub data is available, `retro` adds PR throughput, merge time, first-review latency, backlog, and reviewer load metrics.
- `weekly-digest.mjs` also writes publication-ready artifacts under `docs/weekly-digest-publish/`: `summary.txt`, `slack.md`, `slack.json`, `email.md`, and `manifest.json`.

## Browse workflow

```bash
node browse/dist/cli.js flows
node browse/dist/cli.js save-flow smoke-login '[{"action":"fill","selector":"input[name=email]","value":"demo@example.com"},{"action":"fill","selector":"input[name=password]","value":"demo-pass"},{"action":"click","selector":"button[type=submit]"},{"action":"wait","selector":"text=Dashboard"}]'
node browse/dist/cli.js save-repo-flow landing-smoke '[{"action":"assert-visible","selector":"body"}]'
node browse/dist/cli.js import-flow smoke-login ./docs/smoke-login.yaml
node browse/dist/cli.js export-flow portal-full-demo ./docs/portal-full-demo.md
node browse/dist/cli.js snapshot https://example.com marketing-home --session staging
node browse/dist/cli.js compare-snapshot https://example.com marketing-home --session staging
node browse/dist/cli.js run-flow https://example.com/login smoke-login --session staging
node browse/dist/cli.js press https://example.com "input[name=search]" Enter --session staging
node browse/dist/cli.js assert-text https://example.com "h1" "Example Domain" --session staging
node browse/dist/cli.js assert-visible https://example.com "main" --session staging
```

Notes:

- Checked-in flows live under `browse/flows/`.
- Local flows live under `.codex-stack/browse/flows/` and override same-named repo flows.
- Use `{"action":"use-flow","name":"portal-login"}` inside a checked-in flow to compose a larger QA sequence.
- Flow import/export supports `.json`, `.yaml` / `.yml`, and Markdown files with fenced JSON or YAML blocks.
- Leading `{"action":"clear-storage"}` steps run before navigation, which is useful for repeatable login flows on persistent sessions.
- Snapshots are stored under `.codex-stack/browse/snapshots/`; comparison artifacts are stored under `.codex-stack/browse/artifacts/`.
