# codex-stack

`codex-stack` turns Codex from a generic coding assistant into a team of workflow specialists you can call on demand.

Ten opinionated workflow modes for Codex: product framing, technical planning, paranoid diff review, browser QA, preview verification, deploy verification, release shipping, browser automation, engineering retrospectives, and upgrade audits.

Inspired by [`gstack`](https://github.com/garrytan/gstack), `codex-stack` adapts the same specialist-workflow idea for Codex. If `gstack` is the Claude Code version of this pattern, `codex-stack` is the Codex-native version. This project is independently maintained and is not affiliated with `gstack`.

## Without codex-stack

- Requests stay vague, so the agent executes before the scope is really clear.
- Review depth varies from run to run because there is no shared checklist or report shape.
- Browser QA lives in one-off prompts instead of reusable checked-in flows.
- Shipping still needs manual PR setup, reviewer routing, labels, assignees, and project metadata.
- Deployment validation is disconnected from the shipping path.
- Weekly updates for stakeholders are assembled by hand.

## With codex-stack

| Skill | Mode | What it does |
| --- | --- | --- |
| `product` | Product thinker | Reframes a request into user outcomes, scope, and acceptance criteria. |
| `tech` | Tech lead | Locks architecture, trust boundaries, rollout risks, and the test plan. |
| `review` | Paranoid staff engineer | Audits the diff for structural production risks instead of style noise. |
| `qa` | QA lead | Runs browser flows, diff-aware route probes, and snapshot checks, then scores release readiness. |
| `preview` | Preview verifier | Resolves a PR preview URL, waits for readiness, runs QA, and reports whether the preview is safe to merge. |
| `deploy` | Deploy verifier | Verifies a preview or staging deploy across path and device checks, flows, snapshots, screenshots, and console evidence. |
| `ship` | Release engineer | Validates the branch, prepares PR metadata, and can run QA before opening the PR. |
| `browse` | QA engineer | Drives a real browser with persistent sessions, portable session bundles, named flows, snapshots, and artifacts. |
| `retro` | Engineering manager | Summarizes delivery patterns from git history and optional GitHub PR analytics. |
| `upgrade` | Repo maintainer | Audits Bun, dependency drift, workflow action drift, and install health for codex-stack itself. |

## Default workflow

Use the repo in this order:

1. Open an issue
2. Create a branch from that issue
3. Open a PR from the issue branch
4. Let `pr-review` comment and gate the PR automatically
5. Add the `automerge` label when the PR is ready to merge after checks

## What ships today

- Installable Codex skills under `skills/`
- Checked-in root CLI under `src/cli.ts`
- Playwright-backed browser runtime under `browse/src/cli.ts` with semantic selectors, device presets, iframe targeting, request mocking/blocking, download capture, upload, dialog, wait-state, and element-state assertions
- Persistent named browser sessions
- Portable session import/export with cookie and storage-state bundles
- Checked-in and local browser flows with import/export for JSON, YAML, and Markdown
- Page snapshots and snapshot comparison artifacts
- QA reports with typed categories, severity, health score, diff-aware route inference, saved evidence, and annotated screenshots for snapshot failures
- Historical QA trend artifacts under `.codex-stack/qa/trends.json` and `.codex-stack/qa/trends.md`
- Preview verification with URL template resolution, readiness polling, deploy/page verification, QA execution, and PR comment output for preview deployments
- Deploy verification with page and device matrices, screenshot manifests, console capture, and tracked evidence
- Shipping automation with PR body generation, labels, reviewers, assignees, projects, and optional deploy verification
- PR comments with deploy verification summaries and artifact references after `ship --pr`
- Tracked QA evidence published under `docs/qa/<branch>/` during shipping so PR comments can link to real files
- GitHub Pages publishing for `docs/qa/` so merged QA reports keep a stable URL after branch cleanup
- Issue-first workflow automation with PR review comments and opt-in auto-merge
- Retrospective analytics plus weekly digest publishing outputs for markdown, Slack, and email
- Upgrade auditing via CLI plus a daily scheduled update-check workflow that syncs a stable issue

## Quick start

```bash
bun --version
./setup
bun run typecheck
bunx playwright install chromium
bash scripts/install-skills.sh user
bun src/cli.ts list
```

`./setup` runs environment checks, installs Bun dependencies when needed, and creates local wrappers under `.codex-stack/bin/` for:

- `codex-stack`
- `codex-stack-browse`
- `product`
- `tech`
- `review`
- `qa`
- `preview`
- `deploy`
- `ship`
- `browse`
- `retro`
- `upgrade`

If you want shell-level commands, link those wrappers into your `PATH`:

```bash
bash scripts/link-commands.sh
```

## Swarm multiple agents

You can run multiple Codex sessions in parallel across separate worktrees or terminals.

Typical split:

- one agent in `review`
- one agent in `qa`
- one agent in `preview`
- one agent in `deploy`
- one agent in `ship`

Because the command contracts are shared, those agents stay aligned on the same review, QA, and shipping workflow.

## Demo the sample app

The repo includes a small demo app at `examples/customer-portal-demo/` so you can show a full workflow without a backend.

Start it:

```bash
bun run demo:start
```

Then run a realistic sequence:

```bash
bun src/cli.ts browse run-flow http://127.0.0.1:4173/login portal-full-demo --session friend-demo
bun src/cli.ts browse snapshot http://127.0.0.1:4173/dashboard portal-dashboard --session friend-demo
bun src/cli.ts qa http://127.0.0.1:4173/dashboard --flow portal-dashboard --snapshot portal-dashboard --session friend-demo
bun src/cli.ts deploy --url http://127.0.0.1:4173 --path /dashboard --device desktop --flow portal-dashboard --snapshot portal-dashboard --publish-dir docs/qa/demo/deploy
bun src/cli.ts ship --dry-run --pr --verify-url http://127.0.0.1:4173 --verify-path /dashboard --verify-device desktop --verify-flow portal-dashboard --verify-snapshot portal-dashboard
bun src/cli.ts retro --since "30 days ago" --no-github
bun run weekly
bun run qa:site
```

The checked-in `portal-login` flow clears the demo app's stored login state before navigation so you can re-run it safely on the same named browser session.

## Issue to merge flow

Create the work item and branch:

```bash
bun src/cli.ts issue start --title "Add issue-first PR workflow" --label automation --prefix feat
```

This creates a GitHub issue and a local branch like `feat/123-add-issue-first-pr-workflow`.

Ship the branch as a PR:

```bash
bun src/cli.ts ship --message "feat: add issue-first workflow" --push --pr
```

What happens next:

- `pr-review.yml` runs `codex-stack` review on the PR diff
- for same-repo PRs, the review workflow publishes a GitHub Pages preview at `https://<owner>.github.io/<repo>/pr-preview/pr-<number>/` and verifies that live preview before merging
- the workflow posts or updates a PR comment with structural findings plus any preview deploy evidence
- the job fails if critical findings are detected in either structural review or preview verification
- if the PR has the `automerge` label, `pr-automerge.yml` enables GitHub auto-merge

Branch naming matters: when the branch follows `<prefix>/<issue-number>-slug`, `ship` includes `Closes #<issue-number>` in the generated PR body so the issue closes on merge.

## Root CLI

```bash
bun src/cli.ts list
bun src/cli.ts show qa
bun src/cli.ts review --json --base origin/main
bun src/cli.ts qa http://127.0.0.1:4173/dashboard --flow portal-dashboard --snapshot portal-dashboard --session demo --json
bun src/cli.ts qa https://preview.example.com --mode diff-aware --base-ref origin/main --session preview --json
bun src/cli.ts qa https://preview.example.com/dashboard --flow portal-dashboard --session preview-auth --session-bundle .codex-stack/private/preview-auth.json --json
bun src/cli.ts preview --url "https://anup4khandelwal.github.io/codex-stack/pr-preview/pr-42/" --pr 42 --branch feat/42-preview --sha abcdef123 --path /login --path /dashboard --device desktop --device mobile --flow portal-full-demo
bun src/cli.ts preview --url-template "https://preview-{pr}.example.com" --pr 42 --branch feat/42-preview --sha abcdef123 --path / --path /dashboard --device desktop --device mobile --flow landing-smoke --snapshot landing-home
bun src/cli.ts preview --url "https://anup4khandelwal.github.io/codex-stack/pr-preview/pr-42/" --pr 42 --branch feat/42-preview --sha abcdef123 --path /dashboard --device desktop --flow portal-dashboard --session preview-auth --session-bundle .codex-stack/private/preview-auth.json
bun src/cli.ts deploy --url https://staging.example.com --path / --path /dashboard --device desktop --device mobile --flow portal-dashboard --snapshot portal-dashboard
bun src/cli.ts deploy --url https://staging.example.com --path /dashboard --device desktop --flow portal-dashboard --session staging-auth --session-bundle .codex-stack/private/staging-auth.json
bun src/cli.ts ship --message "feat: ready for review" --push --pr --reviewer octocat --assignee @me --project "Engineering Roadmap"
bun src/cli.ts ship --dry-run --pr --verify-url http://127.0.0.1:4173 --verify-path /dashboard --verify-device mobile --verify-console-errors --verify-flow portal-dashboard --verify-snapshot portal-dashboard
bun src/cli.ts retro --since "7 days ago" --repo anup4khandelwal/codex-stack
bun src/cli.ts upgrade --offline --json
bun src/cli.ts upgrade --offline --apply
bun src/cli.ts browse doctor
bun src/cli.ts browse flows
bun src/cli.ts browse export-session ./tmp/staging-session.json --session staging
bun src/cli.ts browse import-session ./tmp/staging-session.json --session staging-copy
bun src/cli.ts browse import-browser-cookies chrome --session staging --profile Default
bun src/cli.ts browse probe https://example.com/settings --session staging
bun src/cli.ts browse upload https://example.com/profile "input[type=file]" ./fixtures/avatar.png --session staging
bun src/cli.ts browse dialog https://example.com/settings accept "#delete-confirm" --session staging
bun src/cli.ts browse click https://example.com/login "role:button:Continue" --session staging --device mobile
bun src/cli.ts browse fill https://example.com/login "label:Email" demo@example.com --session staging
bun src/cli.ts browse assert-visible https://example.com/home "testid:hero" --session staging
bun src/cli.ts browse click https://example.com/checkout "role:button:Pay now" --session staging --frame "name:payment"
bun src/cli.ts browse mock https://example.com/app "**/api/profile" '{"status":503,"json":{"error":"offline"}}' --session staging
bun src/cli.ts browse download https://example.com/reports "role:button:Export CSV" ./artifacts/report.csv --session staging
bun src/cli.ts browse assert-focused https://example.com/login "input[name=email]" --session staging
bun src/cli.ts browse snapshot https://example.com marketing-home --session staging
bun src/cli.ts browse compare-snapshot https://example.com marketing-home --session staging
```

Useful Bun scripts:

```bash
bun run doctor
bun run typecheck
bun run smoke
bun run demo:start
bun run demo:smoke
bun run review
bun run qa -- http://127.0.0.1:4173/dashboard --flow portal-dashboard --snapshot portal-dashboard --session demo
bun run preview -- --url-template "https://preview-{pr}.example.com" --pr 42 --branch feat/42-preview --sha abcdef123 --path / --device desktop --flow landing-smoke --snapshot landing-home
bun run deploy -- --url https://staging.example.com --path /dashboard --device desktop --flow portal-dashboard --snapshot portal-dashboard
bun run ship:dry
bun run retro
bun run upgrade
bun run upgrade:apply
bun run weekly
```

## Browser QA model

`browse` is the runtime. `qa` is the report layer.

Use `browse` when you want raw control:

- sessions
- portable session bundles
- named flows
- snapshots
- route probes
- ad hoc assertions
- semantic selectors and responsive viewport presets
- iframe targeting by frame name, URL fragment, or iframe selector
- request blocking and mocked responses for repeatable QA and failure-path testing
- download capture and filename assertions for export flows
- local browser-profile import for Chrome, Arc, Brave, and Edge on macOS
- screenshots and artifacts

Use `qa` when you want a decision-ready report:

- pass / warning / critical status
- health score
- findings with category + evidence
- diff-aware route inference from changed files
- annotated SVG evidence for snapshot-based failures
- saved markdown/json report under `.codex-stack/qa/`
- automatic trend summaries across saved QA runs

## Preview verification

Use `preview` when the branch already has a preview deployment and you want merge readiness against the live preview, not only against the code diff.

Example:

```bash
bun src/cli.ts preview \
  --url "https://anup4khandelwal.github.io/codex-stack/pr-preview/pr-42/" \
  --pr 42 \
  --branch feat/42-preview \
  --sha abcdef1234567890 \
  --path /login \
  --path /dashboard \
  --device desktop \
  --device mobile \
  --flow portal-full-demo
```

For same-repo PRs, `pr-review.yml` publishes this preview site automatically to GitHub Pages before it verifies the deployment. `preview-verify.yml` remains available as a manual rerun or for external preview URLs.

Authenticated previews use the same session bundle format as `browse export-session`:

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
  --flow portal-dashboard \
  --session preview-auth \
  --session-bundle .codex-stack/private/preview-auth.json
```

For CI, base64-encode that bundle and save it as the repo secret `CODEX_STACK_PREVIEW_SESSION_BUNDLE_B64`. `pr-review.yml` and `preview-verify.yml` decode it into a temp file, pass `--session-bundle` into preview verification, and delete the temp file before the job exits.

## Ship verification

`ship` can call `qa` before push/PR creation.

Example:

```bash
bun src/cli.ts ship \
  --message "feat: ready for review" \
  --push \
  --pr \
  --verify-url https://staging.example.com/dashboard \
  --verify-flow landing-smoke \
  --verify-snapshot landing-home
```

This keeps QA in the shipping path instead of as a manual follow-up.
When verification runs during `ship`, the QA report and evidence are published into `docs/qa/<branch>/` before the branch is pushed, so the PR comment can point at tracked files on GitHub.
After merge, the `qa-pages` workflow renders those tracked artifacts into a GitHub Pages site so the report, annotation, and screenshot links remain stable even after the feature branch is deleted.

## Upgrade checks

Use `upgrade` when you want to audit the repo itself instead of a feature branch.

Examples:

```bash
bun src/cli.ts upgrade --offline
bun src/cli.ts upgrade --json
bun src/cli.ts upgrade --offline --apply
bun src/cli.ts upgrade --markdown-out docs/daily-update-check.md --json-out docs/daily-update-check.json
```

The upgrade report covers:

- Bun runtime alignment against `packageManager` and `engines.bun`
- dependency drift from npm when network access is available
- GitHub Actions `uses:` ref drift
- local wrapper and installed Codex skill link health
- optional safe local refresh results when `--apply` is used

`--apply` is intentionally narrow. It regenerates `.codex-stack/bin` wrappers with dependency install skipped and refreshes project skill links under `.codex/skills`. It does not mutate dependency versions or workflow refs.

`.github/workflows/daily-update-check.yml` runs that same report on a daily schedule, uploads the markdown/json artifacts, writes the markdown into the workflow summary, and syncs a stable GitHub issue titled `Daily codex-stack update check`.

## QA Pages

Build the static QA site locally:

```bash
bun run qa:site
open .site/index.html
```

On GitHub, `.github/workflows/qa-pages.yml` deploys the merged `docs/qa/` reports to Pages. `ship --pr` now emits two classes of QA links:

- branch artifact links that work immediately on the PR branch
- stable Pages links that activate after the branch is merged to `main`

The same `gh-pages` branch also hosts PR previews under `pr-preview/pr-<number>/`. Configure these repo variables if you want richer automatic preview coverage in `pr-review.yml`:

- `CODEX_STACK_PREVIEW_PATHS=/login,/dashboard`
- `CODEX_STACK_PREVIEW_DEVICES=desktop,mobile`
- `CODEX_STACK_PREVIEW_FLOW=portal-full-demo`
- `CODEX_STACK_PREVIEW_SNAPSHOT=<optional snapshot name>`
- `CODEX_STACK_PREVIEW_WAIT_TIMEOUT=300`

Optional authenticated preview secret:

- `CODEX_STACK_PREVIEW_SESSION_BUNDLE_B64=<base64 of browse export-session output>`

When a PR closes, `.github/workflows/preview-cleanup.yml` removes only `gh-pages/pr-preview/pr-<number>/` and keeps the root QA site plus other active PR previews intact.

## Install skills for Codex

User-level install:

```bash
bash scripts/install-skills.sh user
```

Project-level install:

```bash
bash scripts/install-skills.sh project /path/to/repo
```

This creates links such as:

- `~/.codex/skills/codex-stack-product`
- `~/.codex/skills/codex-stack-qa`
- `~/.codex/skills/codex-stack-review`
- `~/.codex/skills/codex-stack-browse`
- `~/.codex/skills/codex-stack-setup-browser-cookies`
- `~/.codex/skills/codex-stack-upgrade`

Example prompts after installation:

```text
Use codex-stack-product to tighten this feature request into acceptance criteria.
Use codex-stack-review to audit the current branch against main and focus on production risk.
Use codex-stack-qa to verify the staging dashboard flow and tell me if it is safe to ship.
Use codex-stack-browse to capture a baseline snapshot for the new onboarding page.
Use codex-stack-setup-browser-cookies to import my signed-in Chrome session and prepare a preview auth bundle for CI.
Use codex-stack-upgrade to audit whether this codex-stack install needs dependency, workflow, or skill-link refreshes.
```

## Repository layout

```text
codex-stack/
  browse/              Browser runtime, flows, and artifacts helpers
  docs/                Install, command, and example docs
  examples/            Sample apps for demos
  scripts/             Setup, review, qa, ship, retro, and digest helpers
  skills/              Installable Codex skills
  src/                 TypeScript source for the root CLI
```

## Documentation

- [Install guide](./docs/install.md)
- [Command reference](./docs/commands.md)
- [Examples](./docs/examples.md)

## License

[MIT](./LICENSE)
