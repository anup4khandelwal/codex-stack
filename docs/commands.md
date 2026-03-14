# Commands

## Root CLI

```bash
bun dist/cli.js list
bun dist/cli.js show review
bun dist/cli.js path ship
bun dist/cli.js issue start --title "Add PR workflow" --label automation --prefix feat
bun dist/cli.js issue branch 42 --title "Add PR workflow" --prefix feat
bun dist/cli.js review
bun dist/cli.js review --json
bun dist/cli.js qa http://127.0.0.1:4173/dashboard --flow portal-dashboard --snapshot portal-dashboard --session demo --json
bun dist/cli.js ship --dry-run
bun dist/cli.js ship --message "feat: ready for review" --push --pr --template .github/pull_request_template.md
bun dist/cli.js ship --message "feat: ready for review" --push --pr --reviewer octocat --team-reviewer acme/platform --assignee @me --project "Engineering Roadmap" --label release-candidate
bun dist/cli.js ship --dry-run --pr --verify-url http://127.0.0.1:4173/dashboard --verify-flow portal-dashboard --verify-snapshot portal-dashboard
bun dist/cli.js retro --since "7 days ago"
bun dist/cli.js retro --since "7 days ago" --artifact-dir .codex-stack/retros
bun dist/cli.js retro --since "7 days ago" --repo anup4khandelwal/codex-stack
bun dist/cli.js retro --since "7 days ago" --no-github
bun dist/cli.js doctor
bun dist/cli.js browse doctor
bun dist/cli.js browse flows
bun dist/cli.js browse text https://example.com --session staging
bun dist/cli.js browse save-flow login-local '[{"action":"fill","selector":"input[name=email]","value":"demo@example.com"},{"action":"fill","selector":"input[name=password]","value":"demo-pass"},{"action":"click","selector":"button[type=submit]"}]'
bun dist/cli.js browse save-repo-flow landing-smoke '[{"action":"assert-visible","selector":"main"}]'
bun dist/cli.js browse import-flow login-local ./docs/login-flow.md
bun dist/cli.js browse import-repo-flow landing-smoke ./docs/landing-smoke.yaml
bun dist/cli.js browse export-flow portal-full-demo ./docs/portal-full-demo.md
bun dist/cli.js browse snapshot https://example.com marketing-home --session staging
bun dist/cli.js browse compare-snapshot https://example.com marketing-home --session staging
bun dist/cli.js browse login https://example.com/login login-local --session staging
bun dist/cli.js browse click https://example.com "button[type=submit]" --session staging
bun dist/cli.js browse fill https://example.com/login "input[name=email]" demo@example.com --session staging
bun dist/cli.js browse wait https://example.com/dashboard "text=Dashboard" --session staging
bun dist/cli.js browse assert-visible https://example.com "main" --session staging
bun dist/cli.js browse assert-text https://example.com "h1" "Example Domain" --session staging
bun dist/cli.js browse assert-count https://example.com "a" 1 --session staging
bun dist/cli.js browse run-flow http://127.0.0.1:4173/login portal-full-demo --session friend-demo
bun dist/cli.js browse sessions
bun dist/cli.js browse clear-session staging
bun dist/cli.js browse screenshot https://example.com /tmp/example.png
```

## Review workflow

```bash
bun scripts/review-diff.mjs
bun scripts/review-diff.mjs --json
bun scripts/review-diff.mjs --base origin/main
bun scripts/render-pr-review.mjs --input review.json --markdown-out review.md --summary-out review-summary.json
```

Notes:

- `pr-review.yml` uses `review-diff.mjs` plus `render-pr-review.mjs` to comment on every PR.
- The review workflow fails when critical findings are present.

## Issue workflow

```bash
bun scripts/issue-flow.mjs create --title "Add PR workflow" --label automation
bun scripts/issue-flow.mjs branch 42 --title "Add PR workflow" --prefix feat --base main
bun scripts/issue-flow.mjs start --title "Add PR workflow" --label automation --prefix feat
```

## Ship workflow

```bash
bun scripts/ship-branch.mjs --dry-run
bun scripts/ship-branch.mjs --message "feat: ready for review" --push
bun scripts/ship-branch.mjs --message "feat: ready for review" --push --pr
bun scripts/ship-branch.mjs --message "feat: ready for review" --push --pr --template .github/pull_request_template.md
bun scripts/ship-branch.mjs --message "feat: ready for review" --push --pr --reviewer octocat --team-reviewer acme/platform --assignee @me --project "Engineering Roadmap" --label release-candidate
bun scripts/ship-branch.mjs --dry-run --pr --verify-url http://127.0.0.1:4173/dashboard --verify-flow portal-dashboard --verify-snapshot portal-dashboard
bun scripts/ship-branch.mjs --message "feat: ready for review" --push --pr --draft
```

Notes:

- If no PR title is supplied, `ship` derives one from the latest commit or branch name.
- If no PR body is supplied, `ship` generates one from the diff and will merge it into a detected PR template when available.
- If the branch name looks like `feat/123-something`, `ship` adds `Closes #123` to the generated PR body.
- `ship` infers labels from branch and changed files, and infers reviewers from `CODEOWNERS` unless you disable that behavior.
- When GitHub access is available, `ship` creates missing labels before attaching them to the PR.
- `ship` can also assign users and attach projects with `--assignee`, `--assign-self`, and `--project`.
- `ship` can call the QA workflow before push/PR creation with `--verify-url`, `--verify-flow`, and `--verify-snapshot`.
- When `ship --pr` runs with QA verification, it also posts a PR comment with the QA summary and any available artifact references.
- During verification, `ship` publishes tracked evidence under `docs/qa/<branch>/` before push/PR creation.
- `ship --pr` includes both immediate branch artifact links and post-merge GitHub Pages links for QA evidence when tracked artifacts exist.
- Add the `automerge` label to a PR if you want `pr-automerge.yml` to enable GitHub auto-merge after checks pass.

## QA workflow

```bash
bun scripts/qa-run.mjs http://127.0.0.1:4173/dashboard --flow portal-dashboard --snapshot portal-dashboard --session demo --json
bun scripts/qa-run.mjs http://127.0.0.1:4173/login --flow portal-full-demo --snapshot portal-login --session demo
```

Notes:

- `qa` writes markdown/json artifacts under `.codex-stack/qa/`.
- It upgrades raw browser evidence into findings, severity, health score, and recommendation.
- Snapshot-based failures also emit annotated SVG evidence under `.codex-stack/qa/annotations/`.
- Use `--publish-dir docs/qa/<name>` when you want tracked copies of the QA report and evidence.
- Use `--update-snapshot` when the UI change is intentional and the baseline should move.
- Run `bun scripts/render-qa-pages.mjs --out .site` to turn tracked `docs/qa/` artifacts into a static site locally or in CI.

## Retro workflow

```bash
bun scripts/retro-report.mjs --since "7 days ago"
bun scripts/retro-report.mjs --since "14 days ago" --json
bun scripts/retro-report.mjs --since "30 days ago" --out .codex-stack/retros/latest.md --json-out .codex-stack/retros/latest.json
bun scripts/retro-report.mjs --since "7 days ago" --artifact-dir .codex-stack/retros
bun scripts/retro-report.mjs --since "7 days ago" --no-artifacts
bun scripts/retro-report.mjs --since "7 days ago" --repo anup4khandelwal/codex-stack
bun scripts/retro-report.mjs --since "7 days ago" --no-github
bun scripts/weekly-digest.mjs --since "7 days ago" --no-github
bun scripts/weekly-digest.mjs --since "7 days ago" --publish-dir docs/weekly-digest-publish --no-github
```

Notes:

- By default, every retro run writes `latest.md`, `latest.json`, and timestamped snapshots under `.codex-stack/retros/`.
- When GitHub data is available, `retro` adds PR throughput, merge time, first-review latency, backlog, and reviewer load metrics.
- `weekly-digest.mjs` also writes publication-ready artifacts under `docs/weekly-digest-publish/`: `summary.txt`, `slack.md`, `slack.json`, `email.md`, and `manifest.json`.

## Browse workflow

```bash
bun browse/dist/cli.js flows
bun browse/dist/cli.js save-flow smoke-login '[{"action":"fill","selector":"input[name=email]","value":"demo@example.com"},{"action":"fill","selector":"input[name=password]","value":"demo-pass"},{"action":"click","selector":"button[type=submit]"},{"action":"wait","selector":"text=Dashboard"}]'
bun browse/dist/cli.js save-repo-flow landing-smoke '[{"action":"assert-visible","selector":"body"}]'
bun browse/dist/cli.js import-flow smoke-login ./docs/smoke-login.yaml
bun browse/dist/cli.js export-flow portal-full-demo ./docs/portal-full-demo.md
bun browse/dist/cli.js snapshot https://example.com marketing-home --session staging
bun browse/dist/cli.js compare-snapshot https://example.com marketing-home --session staging
bun browse/dist/cli.js run-flow https://example.com/login smoke-login --session staging
bun browse/dist/cli.js press https://example.com "input[name=search]" Enter --session staging
bun browse/dist/cli.js assert-text https://example.com "h1" "Example Domain" --session staging
bun browse/dist/cli.js assert-visible https://example.com "main" --session staging
```

Notes:

- Checked-in flows live under `browse/flows/`.
- Local flows live under `.codex-stack/browse/flows/` and override same-named repo flows.
- Use `{"action":"use-flow","name":"portal-login"}` inside a checked-in flow to compose a larger QA sequence.
- Flow import/export supports `.json`, `.yaml` / `.yml`, and Markdown files with fenced JSON or YAML blocks.
- Leading `{"action":"clear-storage"}` steps run before navigation, which is useful for repeatable login flows on persistent sessions.
- Snapshots are stored under `.codex-stack/browse/snapshots/`; comparison artifacts are stored under `.codex-stack/browse/artifacts/`.
