# Commands

## Root CLI

```bash
bun src/cli.ts list
bun src/cli.ts show review
bun src/cli.ts path ship
bun src/cli.ts issue start --title "Add PR workflow" --label automation --prefix feat
bun src/cli.ts issue branch 42 --title "Add PR workflow" --prefix feat
bun src/cli.ts review
bun src/cli.ts review --json
bun src/cli.ts qa http://127.0.0.1:4173/dashboard --flow portal-dashboard --snapshot portal-dashboard --session demo --json
bun src/cli.ts qa https://preview.example.com --mode diff-aware --base-ref origin/main --session preview --json
bun src/cli.ts preview --url-template "https://preview-{pr}.example.com" --pr 42 --branch feat/42-preview --sha abcdef1234567890 --path / --path /dashboard --device desktop --device mobile --flow landing-smoke --snapshot landing-home
bun src/cli.ts deploy --url https://staging.example.com --path / --path /dashboard --device desktop --device mobile --flow portal-dashboard --snapshot portal-dashboard
bun src/cli.ts ship --dry-run
bun src/cli.ts ship --message "feat: ready for review" --push --pr --template .github/pull_request_template.md
bun src/cli.ts ship --message "feat: ready for review" --push --pr --reviewer octocat --team-reviewer acme/platform --assignee @me --project "Engineering Roadmap" --label release-candidate
bun src/cli.ts ship --dry-run --pr --verify-url http://127.0.0.1:4173 --verify-path /dashboard --verify-device mobile --verify-console-errors --verify-flow portal-dashboard --verify-snapshot portal-dashboard
bun src/cli.ts retro --since "7 days ago"
bun src/cli.ts retro --since "7 days ago" --artifact-dir .codex-stack/retros
bun src/cli.ts retro --since "7 days ago" --repo anup4khandelwal/codex-stack
bun src/cli.ts retro --since "7 days ago" --no-github
bun src/cli.ts upgrade --offline
bun src/cli.ts upgrade --json
bun src/cli.ts upgrade --offline --apply
bun src/cli.ts upgrade --markdown-out docs/daily-update-check.md --json-out docs/daily-update-check.json
bun src/cli.ts doctor
bun src/cli.ts browse doctor
bun src/cli.ts browse flows
bun src/cli.ts browse export-session ./tmp/staging-session.json --session staging
bun src/cli.ts browse import-session ./tmp/staging-session.json --session staging-copy
bun src/cli.ts browse import-cookies ./tmp/cookies.json --session staging-copy
bun src/cli.ts browse text https://example.com --session staging
bun src/cli.ts browse probe https://example.com/settings --session staging
bun src/cli.ts browse upload https://example.com/profile "input[type=file]" ./fixtures/avatar.png --session staging
bun src/cli.ts browse dialog https://example.com/settings accept "#delete-confirm" --session staging
bun src/cli.ts browse click https://example.com/login "role:button:Continue" --session staging --device mobile
bun src/cli.ts browse fill https://example.com/login "label:Email" demo@example.com --session staging
bun src/cli.ts browse html https://example.com/search "placeholder:Search" --session staging
bun src/cli.ts browse assert-visible https://example.com/home "testid:hero" --session staging
bun src/cli.ts browse click https://example.com/checkout "role:button:Pay now" --session staging --frame "name:payment"
bun src/cli.ts browse mock https://example.com/app "**/api/profile" '{"status":503,"json":{"error":"offline"}}' --session staging
bun src/cli.ts browse block https://example.com/app "**/analytics/**" --session staging
bun src/cli.ts browse download https://example.com/reports "role:button:Export CSV" ./artifacts/report.csv --session staging
bun src/cli.ts browse assert-download https://example.com/reports "role:button:Export CSV" report.csv ./artifacts/report.csv --session staging
bun src/cli.ts browse save-flow login-local '[{"action":"fill","selector":"input[name=email]","value":"demo@example.com"},{"action":"fill","selector":"input[name=password]","value":"demo-pass"},{"action":"click","selector":"button[type=submit]"}]'
bun src/cli.ts browse save-repo-flow landing-smoke '[{"action":"assert-visible","selector":"main"}]'
bun src/cli.ts browse import-flow login-local ./docs/login-flow.md
bun src/cli.ts browse import-repo-flow landing-smoke ./docs/landing-smoke.yaml
bun src/cli.ts browse export-flow portal-full-demo ./docs/portal-full-demo.md
bun src/cli.ts browse snapshot https://example.com marketing-home --session staging
bun src/cli.ts browse compare-snapshot https://example.com marketing-home --session staging
bun src/cli.ts browse login https://example.com/login login-local --session staging
bun src/cli.ts browse click https://example.com "button[type=submit]" --session staging
bun src/cli.ts browse fill https://example.com/login "input[name=email]" demo@example.com --session staging
bun src/cli.ts browse wait https://example.com/dashboard "text=Dashboard" --session staging
bun src/cli.ts browse wait https://example.com/dashboard load:domcontentloaded --session staging
bun src/cli.ts browse wait https://example.com/dashboard state:hidden:#toast --session staging
bun src/cli.ts browse assert-visible https://example.com "main" --session staging
bun src/cli.ts browse assert-hidden https://example.com "#toast" --session staging
bun src/cli.ts browse assert-enabled https://example.com "button[type=submit]" --session staging
bun src/cli.ts browse assert-disabled https://example.com "button[disabled]" --session staging
bun src/cli.ts browse assert-checked https://example.com "input[type=checkbox]" --session staging
bun src/cli.ts browse assert-editable https://example.com "textarea" --session staging
bun src/cli.ts browse assert-focused https://example.com "input[name=email]" --session staging
bun src/cli.ts browse assert-text https://example.com "h1" "Example Domain" --session staging
bun src/cli.ts browse assert-count https://example.com "a" 1 --session staging
bun src/cli.ts browse run-flow http://127.0.0.1:4173/login portal-full-demo --session friend-demo
bun src/cli.ts browse sessions
bun src/cli.ts browse clear-session staging
bun src/cli.ts browse screenshot https://example.com /tmp/example.png
bun run typecheck
```

## Review workflow

```bash
bun scripts/review-diff.ts
bun scripts/review-diff.ts --json
bun scripts/review-diff.ts --base origin/main
bun scripts/render-pr-review.ts --input review.json --markdown-out review.md --summary-out review-summary.json
bun scripts/render-pr-review.ts --input review.json --preview-input preview.json --markdown-out review.md --summary-out review-summary.json
```

Notes:

- `pr-review.yml` uses `review-diff.ts` plus `render-pr-review.ts` to comment on every PR.
- For same-repo PRs, `pr-review.yml` also publishes a GitHub Pages preview under `pr-preview/pr-<number>/`, runs `preview-verify.ts` against that live URL, and merges the preview deploy evidence into the review comment.
- The review workflow fails when critical findings are present in either structural review or preview verification.

## Issue workflow

```bash
bun scripts/issue-flow.ts create --title "Add PR workflow" --label automation
bun scripts/issue-flow.ts branch 42 --title "Add PR workflow" --prefix feat --base main
bun scripts/issue-flow.ts start --title "Add PR workflow" --label automation --prefix feat
```

## Ship workflow

```bash
bun scripts/ship-branch.ts --dry-run
bun scripts/ship-branch.ts --message "feat: ready for review" --push
bun scripts/ship-branch.ts --message "feat: ready for review" --push --pr
bun scripts/ship-branch.ts --message "feat: ready for review" --push --pr --template .github/pull_request_template.md
bun scripts/ship-branch.ts --message "feat: ready for review" --push --pr --reviewer octocat --team-reviewer acme/platform --assignee @me --project "Engineering Roadmap" --label release-candidate
bun scripts/ship-branch.ts --dry-run --pr --verify-url http://127.0.0.1:4173 --verify-path /dashboard --verify-device mobile --verify-console-errors --verify-flow portal-dashboard --verify-snapshot portal-dashboard
bun scripts/ship-branch.ts --message "feat: ready for review" --push --pr --draft
```

Notes:

- If no PR title is supplied, `ship` derives one from the latest commit or branch name.
- If no PR body is supplied, `ship` generates one from the diff and will merge it into a detected PR template when available.
- If the branch name looks like `feat/123-something`, `ship` adds `Closes #123` to the generated PR body.
- `ship` infers labels from branch and changed files, and infers reviewers from `CODEOWNERS` unless you disable that behavior.
- When GitHub access is available, `ship` creates missing labels before attaching them to the PR.
- `ship` can also assign users and attach projects with `--assignee`, `--assign-self`, and `--project`.
- `ship` can call the deploy verification workflow before push/PR creation with `--verify-url`, `--verify-path`, `--verify-device`, `--verify-flow`, and `--verify-snapshot`.
- `--verify-console-errors` upgrades captured console errors from warnings to merge-blocking failures.
- When `ship --pr` runs with deploy verification, it also posts a PR comment with the deploy summary and any available artifact references.
- During verification, `ship` publishes tracked evidence under `docs/qa/<branch>/deploy/` before push/PR creation.
- `ship --pr` includes both immediate branch artifact links and post-merge GitHub Pages links for deploy evidence when tracked artifacts exist.
- Add the `automerge` label to a PR if you want `pr-automerge.yml` to enable GitHub auto-merge after checks pass.

## QA workflow

```bash
bun scripts/qa-run.ts http://127.0.0.1:4173/dashboard --flow portal-dashboard --snapshot portal-dashboard --session demo --json
bun scripts/qa-run.ts http://127.0.0.1:4173/login --flow portal-full-demo --snapshot portal-login --session demo
bun scripts/qa-run.ts https://preview.example.com --mode diff-aware --base-ref origin/main --session preview --json
bun scripts/qa-trends.ts --dir .codex-stack/qa --json
```

Notes:

- `qa` writes markdown/json artifacts under `.codex-stack/qa/`.
- It upgrades raw browser evidence into categorized findings, severity, health score, and recommendation.
- `--mode diff-aware` inspects the git diff, infers changed routes for common app/page layouts, and probes those URLs from the supplied base URL.
- Snapshot-based failures also emit annotated SVG evidence under `.codex-stack/qa/annotations/`.
- Every `qa-run` also refreshes `.codex-stack/qa/trends.json` and `.codex-stack/qa/trends.md` so you can compare the latest run against prior QA history.
- Use `--publish-dir docs/qa/<name>` when you want tracked copies of the QA report and evidence.
- Use `--update-snapshot` when the UI change is intentional and the baseline should move.
- Run `bun scripts/render-qa-pages.ts --out .site` to turn tracked `docs/qa/` artifacts into a static site locally or in CI.

## Preview site build

```bash
bun scripts/build-preview-site.ts --out .preview-site
open .preview-site/index.html
```

Notes:

- `build-preview-site.ts` rewrites the demo app into a path-based static site that works under GitHub Pages subpaths like `pr-preview/pr-42/`.
- The generated site includes `index.html`, `login/index.html`, `dashboard/index.html`, and `.nojekyll`.

## Preview workflow

```bash
bun scripts/preview-verify.ts --url "https://anup4khandelwal.github.io/codex-stack/pr-preview/pr-42/" --repo anup4khandelwal/codex-stack --pr 42 --branch feat/42-preview --sha abcdef1234567890 --path /login --path /dashboard --device desktop --device mobile --flow portal-full-demo --markdown-out preview.md --json-out preview.json --comment-out preview-comment.md
bun scripts/preview-verify.ts --url-template "https://preview-{pr}.example.com" --repo anup4khandelwal/codex-stack --pr 42 --branch feat/42-preview --sha abcdef1234567890 --path / --path /dashboard --device desktop --device mobile --flow landing-smoke --snapshot landing-home --markdown-out preview.md --json-out preview.json --comment-out preview-comment.md
bun scripts/preview-verify.ts --url "https://anup4khandelwal.github.io/codex-stack/pr-preview/pr-42/" --repo anup4khandelwal/codex-stack --pr 42 --branch feat/42-preview --sha abcdef1234567890 --path /dashboard --device desktop --flow portal-dashboard --session preview-auth --session-bundle .codex-stack/private/preview-auth.json --markdown-out preview.md --json-out preview.json --comment-out preview-comment.md
bun scripts/preview-verify.ts --url https://preview.example.com --path /dashboard --device desktop --flow landing-smoke --snapshot landing-home --json
```

Notes:

- `preview-verify.ts` resolves the preview URL from either `--url` or `--url-template`.
- Template placeholders support `{repo}`, `{owner}`, `{repo_name}`, `{pr}`, `{branch}`, `{branch_slug}`, `{sha}`, and `{short_sha}`.
- The script polls preview readiness before it delegates to `deploy-verify.ts`.
- `--session-bundle <path>` imports an exported browser session into the named preview session before live checks run.
- `preview-verify.yml` is the manual rerun path. `pr-review.yml` is the automatic PR-time path and publishes the GitHub Pages preview before verification.
- Both preview workflows can consume the repo secret `CODEX_STACK_PREVIEW_SESSION_BUNDLE_B64` and decode it to a temp bundle file without exposing the contents in logs.
- The workflow uploads `preview.md`, `preview.json`, `preview-comment.md`, and the published deploy artifacts as a workflow artifact, then updates a stable PR comment.

## Deploy workflow

```bash
bun scripts/deploy-verify.ts --url https://staging.example.com --path / --path /dashboard --device desktop --device mobile --flow portal-dashboard --snapshot portal-dashboard --markdown-out deploy.md --json-out deploy.json --comment-out deploy-comment.md
bun scripts/deploy-verify.ts --url https://staging.example.com --path /dashboard --device desktop --flow portal-dashboard --session staging-auth --session-bundle .codex-stack/private/staging-auth.json --json
bun scripts/deploy-verify.ts --url-template "https://preview-{pr}.example.com" --repo anup4khandelwal/codex-stack --pr 42 --branch feat/42-preview --sha abcdef1234567890 --path /dashboard --device mobile --strict-console --strict-http --json
```

Notes:

- `deploy-verify.ts` resolves the live deploy URL from either `--url` or `--url-template`.
- It waits for readiness, verifies every requested `path x device` combination, and captures screenshots plus console evidence.
- Flow and snapshot checks are delegated to the existing QA runtime so the deploy report reuses the same finding model and artifacts.
- `--session-bundle <path>` validates the bundle up front, imports it into the named deploy session when live browser checks need it, and passes it through to `qa-run.ts`.
- The script writes `report.md`, `report.json`, `comment.md`, and `screenshots.json` under the publish directory even when you do not pass explicit output paths.

## Retro workflow

```bash
bun scripts/retro-report.ts --since "7 days ago"
bun scripts/retro-report.ts --since "14 days ago" --json
bun scripts/retro-report.ts --since "30 days ago" --out .codex-stack/retros/latest.md --json-out .codex-stack/retros/latest.json
bun scripts/retro-report.ts --since "7 days ago" --artifact-dir .codex-stack/retros
bun scripts/retro-report.ts --since "7 days ago" --no-artifacts
bun scripts/retro-report.ts --since "7 days ago" --repo anup4khandelwal/codex-stack
bun scripts/retro-report.ts --since "7 days ago" --no-github
bun scripts/weekly-digest.ts --since "7 days ago" --no-github
bun scripts/weekly-digest.ts --since "7 days ago" --publish-dir docs/weekly-digest-publish --no-github
bun scripts/upgrade-check.ts --offline
bun scripts/upgrade-check.ts --json
bun scripts/upgrade-check.ts --offline --apply
bun scripts/upgrade-check.ts --repo anup4khandelwal/codex-stack --markdown-out docs/daily-update-check.md --json-out docs/daily-update-check.json
```

Notes:

- By default, every retro run writes `latest.md`, `latest.json`, and timestamped snapshots under `.codex-stack/retros/`.
- When GitHub data is available, `retro` adds PR throughput, merge time, first-review latency, backlog, and reviewer load metrics.
- `weekly-digest.ts` also writes publication-ready artifacts under `docs/weekly-digest-publish/`: `summary.txt`, `slack.md`, `slack.json`, `email.md`, and `manifest.json`.

## Upgrade workflow

```bash
bun scripts/upgrade-check.ts --offline
bun scripts/upgrade-check.ts --json
bun scripts/upgrade-check.ts --offline --apply
bun scripts/upgrade-check.ts --repo anup4khandelwal/codex-stack --markdown-out docs/daily-update-check.md --json-out docs/daily-update-check.json
```

Notes:

- `upgrade-check.ts` audits Bun alignment, dependency drift, workflow action drift, and install health.
- Use `--offline` for deterministic local or CI smoke runs that should skip network calls.
- Use `--apply` when you want the script to run the safe local refresh path for wrappers and project skill links after the audit.
- `.github/workflows/daily-update-check.yml` runs the same script on a daily schedule and syncs the report into a stable GitHub issue.

## Browse workflow

```bash
bun browse/src/cli.ts flows
bun browse/src/cli.ts save-flow smoke-login '[{"action":"fill","selector":"input[name=email]","value":"demo@example.com"},{"action":"fill","selector":"input[name=password]","value":"demo-pass"},{"action":"click","selector":"button[type=submit]"},{"action":"wait","selector":"text=Dashboard"}]'
bun browse/src/cli.ts save-repo-flow landing-smoke '[{"action":"assert-visible","selector":"body"}]'
bun browse/src/cli.ts import-flow smoke-login ./docs/smoke-login.yaml
bun browse/src/cli.ts export-flow portal-full-demo ./docs/portal-full-demo.md
bun browse/src/cli.ts export-session ./tmp/staging-session.json --session staging
bun browse/src/cli.ts import-session ./tmp/staging-session.json --session staging-copy
bun browse/src/cli.ts import-browser-cookies chrome --session staging --profile Default
bun browse/src/cli.ts probe https://example.com/settings --session staging
bun browse/src/cli.ts snapshot https://example.com marketing-home --session staging
bun browse/src/cli.ts compare-snapshot https://example.com marketing-home --session staging
bun browse/src/cli.ts run-flow https://example.com/login smoke-login --session staging
bun browse/src/cli.ts press https://example.com "input[name=search]" Enter --session staging
bun browse/src/cli.ts assert-text https://example.com "h1" "Example Domain" --session staging
bun browse/src/cli.ts assert-visible https://example.com "main" --session staging
```

Notes:

- Checked-in flows live under `browse/flows/`.
- Local flows live under `.codex-stack/browse/flows/` and override same-named repo flows.
- Session bundles capture cookies plus origin storage so authenticated QA setups can move between named sessions.
- `import-browser-cookies` is the local macOS path for Chrome, Arc, Brave, and Edge profiles when you need to bootstrap an authenticated session without replaying login flows manually.
- `upload`, `dialog`, and the expanded assertion set are available both as direct commands and as flow actions.
- `wait` supports `load:<state>` plus `state:<visible|hidden|attached|detached>:<selector>` for richer synchronization.
- Selector arguments accept semantic prefixes as well as CSS: `role:<role>[:<name>]`, `label:<text>`, `placeholder:<text>`, `text:<text>`, and `testid:<value>`.
- Add `--device mobile|tablet|desktop` to browser commands when you need a specific responsive viewport.
- Add `--frame name:<name>`, `--frame url:<fragment>`, or `--frame <iframe-selector>` when the target lives inside an iframe.
- Flow steps can override the default frame with a `frame` property, for example `{ "action": "assert-text", "selector": "text:Frame ready", "frame": "name:payment" }`.
- Use `mock` for one-off fulfilled responses and `block` for one-off aborted requests on direct browser commands.
- Flow steps also support `{ "action": "route", ... }` and `{ "action": "clear-routes" }` so network controls can be armed before navigation.
- Use `download` to save a file to disk and `assert-download` when the filename fragment itself is part of the assertion.
- Flow steps also support `{ "action": "download", ... }` and `{ "action": "assert-download", ... }` for checked-in export flows.
- Use `{"action":"use-flow","name":"portal-login"}` inside a checked-in flow to compose a larger QA sequence.
- Flow import/export supports `.json`, `.yaml` / `.yml`, and Markdown files with fenced JSON or YAML blocks.
- Leading `{"action":"clear-storage"}` steps run before navigation, which is useful for repeatable login flows on persistent sessions.
- Snapshots are stored under `.codex-stack/browse/snapshots/`; comparison artifacts are stored under `.codex-stack/browse/artifacts/`.

## Authenticated preview setup

```bash
bun src/cli.ts browse import-browser-cookies chrome --session preview-auth --profile Default
bun src/cli.ts browse export-session .codex-stack/private/preview-auth.json --session preview-auth
base64 < .codex-stack/private/preview-auth.json > /tmp/codex-stack-preview-auth.b64
```

Notes:

- Save the base64 output as the repo secret `CODEX_STACK_PREVIEW_SESSION_BUNDLE_B64` when PR preview verification also needs authentication.
- `preview-cleanup.yml` removes `gh-pages/pr-preview/pr-<number>/` automatically on `pull_request.closed` and leaves the root QA site intact.
