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
bun src/cli.ts qa http://127.0.0.1:4173/dashboard --flow release-dashboard --snapshot release-dashboard --session demo --json
bun src/cli.ts qa http://127.0.0.1:4173/dashboard --flow release-dashboard --snapshot release-dashboard --a11y --a11y-scope main --perf --perf-budget lcp=2s --perf-budget cls=0.1 --session demo --json
bun src/cli.ts qa https://preview.example.com --mode diff-aware --base-ref origin/main --session preview --json
bun src/cli.ts qa-decide approve --snapshot release-dashboard --route /dashboard --device desktop --kind snapshot-drift --reason "Intentional redesign approved in PR #123"
bun src/cli.ts qa-decide suppress --category accessibility --kind accessibility-rule --route /checkout --device desktop --rule color-contrast --reason "Vendor widget pending upstream fix" --expires-at 2026-03-29T00:00:00Z
bun src/cli.ts qa-decide list --active-only
bun src/cli.ts qa-decide prune-expired
bun src/cli.ts preview --url-template "https://preview-{pr}.example.com" --pr 42 --branch feat/42-preview --sha abcdef1234567890 --path / --path /dashboard --device desktop --device mobile --flow landing-smoke --snapshot landing-home
bun src/cli.ts preview --url-template "https://preview-{pr}.example.com" --pr 42 --branch feat/42-preview --sha abcdef1234567890 --path /dashboard --device desktop --flow landing-smoke --snapshot landing-home --a11y --a11y-scope main --perf --perf-budget lcp=2s
bun src/cli.ts deploy --url https://staging.example.com --path / --path /dashboard --path /changes --device desktop --device mobile --flow release-dashboard --flow release-changes --snapshot release-dashboard
bun src/cli.ts deploy --url https://staging.example.com --path /dashboard --device desktop --flow release-dashboard --snapshot release-dashboard --a11y --a11y-scope main --perf --perf-budget lcp=2s --perf-budget cls=0.1
bun src/cli.ts ship --dry-run
bun src/cli.ts ship --message "feat: ready for review" --push --pr --template .github/pull_request_template.md
bun src/cli.ts ship --message "feat: ready for review" --push --pr --reviewer octocat --team-reviewer acme/platform --assignee @me --project "Engineering Roadmap" --label release-candidate
bun src/cli.ts ship --dry-run --pr --verify-url http://127.0.0.1:4173 --verify-path /dashboard --verify-path /changes --verify-device mobile --verify-console-errors --verify-flow release-dashboard --verify-flow release-changes --verify-snapshot release-dashboard
bun src/cli.ts ship --dry-run --pr --verify-url http://127.0.0.1:4173 --verify-path /dashboard --verify-path /changes --verify-device mobile --verify-flow release-dashboard --verify-flow release-changes --verify-snapshot release-dashboard --verify-a11y --verify-a11y-scope main --verify-perf --verify-perf-budget lcp=2s
bun src/cli.ts fleet validate --manifest .codex-stack/fleet.example.json
bun src/cli.ts fleet sync --manifest .codex-stack/fleet.example.json --dry-run --json
bun src/cli.ts fleet collect --manifest .codex-stack/fleet.example.json --json
bun src/cli.ts fleet dashboard --manifest .codex-stack/fleet.example.json --out .fleet-site
bun src/cli.ts fleet remediate --manifest .codex-stack/fleet.example.json --dry-run --json
bun src/cli.ts agents add --name lead-1 --runtime codex --role manager --team platform --status working
bun src/cli.ts agents dashboard --out .codex-stack/control-plane/dashboard
bun src/cli.ts goals add --id release-q2 --title "Release Q2 hardening" --type initiative --owner lead-1 --status active
bun src/cli.ts goals task add --id review-contracts --goal release-q2 --title "Review agent contracts" --assignee reviewer-1
bun src/cli.ts goals task delegate review-contracts --id qa-contracts --title "Run delegated QA" --assignee qa-1
bun src/cli.ts goals queue --json
bun src/cli.ts agents budget set --agent reviewer-1 --window daily --max-runs 8 --max-minutes 120 --max-cost-units 20
bun src/cli.ts heartbeat schedule add --agent reviewer-1 --task review-contracts --trigger cron --expression "*/30 * * * *" --summary "Review queue" --retry-limit 2 --cooldown-minutes 30
bun src/cli.ts heartbeat due --agent reviewer-1 --json
bun src/cli.ts heartbeat beat --agent reviewer-1 --task review-contracts --summary "Reviewed queue" --next-action "Open PR after approval"
bun src/cli.ts approvals gate --agent reviewer-1 --kind ship-pr --target review-contracts --json
bun src/cli.ts ship --dry-run --pr --control-agent reviewer-1 --control-state .codex-stack/control-plane/state.json
bun src/cli.ts fleet remediate --manifest .codex-stack/fleet.example.json --dry-run --open-prs --control-agent lead-1 --control-state .codex-stack/control-plane/state.json --json
bun src/cli.ts mcp inspect --json
bun src/cli.ts mcp serve
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
bun src/cli.ts browse export-flow release-full-demo ./docs/release-full-demo.md
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
bun src/cli.ts browse run-flow http://127.0.0.1:4173/login release-full-demo --session friend-demo
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
- For same-repo PRs, `pr-review.yml` also publishes a GitHub Pages preview under `pr-preview/pr-<number>/`, runs `preview-verify.ts` against that live URL, republishes review evidence under `pr-preview/pr-<number>/__codex/`, and merges that hosted visual pack into the review comment.
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
bun scripts/ship-branch.ts --dry-run --pr --verify-url http://127.0.0.1:4173 --verify-path /dashboard --verify-path /changes --verify-device mobile --verify-console-errors --verify-flow release-dashboard --verify-flow release-changes --verify-snapshot release-dashboard
bun scripts/ship-branch.ts --dry-run --pr --verify-url http://127.0.0.1:4173 --verify-path /dashboard --verify-path /changes --verify-device mobile --verify-flow release-dashboard --verify-flow release-changes --verify-snapshot release-dashboard --verify-a11y --verify-a11y-scope main --verify-perf --verify-perf-budget lcp=2s
bun scripts/ship-branch.ts --dry-run --pr --control-agent ship-1 --control-state .codex-stack/control-plane/state.json
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
- `ship` can also pass through accessibility and performance verification with `--verify-a11y`, `--verify-a11y-scope`, `--verify-a11y-impact`, `--verify-perf`, `--verify-perf-budget`, and `--verify-perf-wait-ms`.
- `ship` can require an approval gate from the local control-plane with `--control-agent`, `--control-state`, and optional `--control-target`.
- `--verify-console-errors` upgrades captured console errors from warnings to merge-blocking failures.
- When `ship --pr` runs with deploy verification, it also posts a PR comment with the deploy summary and any available artifact references.
- During verification, `ship` publishes tracked evidence under `docs/qa/<branch>/deploy/` before push/PR creation.
- `ship --pr` includes both immediate branch artifact links and post-merge GitHub Pages links for deploy evidence when tracked artifacts exist.
- Add the `automerge` label to a PR if you want `pr-automerge.yml` to enable GitHub auto-merge after checks pass.

## QA workflow

```bash
bun scripts/qa-run.ts http://127.0.0.1:4173/dashboard --flow release-dashboard --snapshot release-dashboard --session demo --json
bun scripts/qa-run.ts http://127.0.0.1:4173/dashboard --flow release-dashboard --snapshot release-dashboard --a11y --a11y-scope main --perf --perf-budget lcp=2s --perf-budget cls=0.1 --json
bun scripts/qa-run.ts http://127.0.0.1:4173/login --flow release-full-demo --snapshot release-login --session demo
bun scripts/qa-run.ts https://preview.example.com --mode diff-aware --base-ref origin/main --session preview --json
bun scripts/qa-decide.ts approve --snapshot release-dashboard --route /dashboard --device desktop --kind snapshot-drift --reason "Intentional redesign approved in PR #123"
bun scripts/qa-decide.ts suppress --category accessibility --kind accessibility-rule --route /checkout --device desktop --rule color-contrast --reason "Vendor widget pending upstream fix" --expires-at 2026-03-29T00:00:00Z
bun scripts/qa-decide.ts list --active-only
bun scripts/qa-decide.ts prune-expired
bun scripts/qa-trends.ts --dir .codex-stack/qa --json
```

Notes:

- `qa` writes markdown/json artifacts under `.codex-stack/qa/`.
- It upgrades raw browser evidence into categorized findings, severity, health score, and recommendation.
- `--mode diff-aware` inspects the git diff, infers changed routes for common app/page layouts, and probes those URLs from the supplied base URL.
- Snapshot-based failures also emit annotated SVG evidence under `.codex-stack/qa/annotations/`.
- `--a11y` injects `axe-core` into the current page/session and writes `a11y.json` plus `a11y.md` when enabled.
- `--perf` captures browser metrics like TTFB, FCP, LCP, CLS, and failed resources, then writes `performance.json` plus `performance.md`.
- `compare-snapshot` now emits a self-contained visual pack, and `qa --publish-dir ...` copies that pack into `visual/index.html` and `visual/manifest.json`.
- Every `qa-run` also refreshes `.codex-stack/qa/trends.json` and `.codex-stack/qa/trends.md` so you can compare the latest run against prior QA history.
- Snapshot baselines now store route/device metadata and QA flags stale baselines automatically when the saved reference ages out.
- `qa-run` also emits a consolidated visual-risk score so preview, deploy, and Pages rendering rank the same evidence consistently.
- `qa-run` also loads repo-tracked decisions from `.codex-stack/baseline-decisions/`, downgrades or suppresses approved regressions, and reports unresolved vs expired approvals explicitly.
- Decision files are narrow on purpose: route + device are always part of the match, and accessibility/performance decisions only apply to the exact rule or metric they name.
- Use `--publish-dir docs/qa/<name>` when you want tracked copies of the QA report and evidence.
- Use `--update-snapshot` when the UI change is intentional and the baseline should move.
- Run `bun scripts/render-qa-pages.ts --out .site` to turn tracked `docs/qa/` artifacts into a static site locally or in CI.
- Run `bun run demo:publish-qa` to refresh the checked-in sample report at `docs/qa/release-readiness-demo/`.

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
bun scripts/preview-verify.ts --url "https://anup4khandelwal.github.io/codex-stack/pr-preview/pr-42/" --repo anup4khandelwal/codex-stack --pr 42 --branch feat/42-preview --sha abcdef1234567890 --path /login --path /dashboard --device desktop --device mobile --flow release-full-demo --markdown-out preview.md --json-out preview.json --comment-out preview-comment.md
bun scripts/preview-verify.ts --url-template "https://preview-{pr}.example.com" --repo anup4khandelwal/codex-stack --pr 42 --branch feat/42-preview --sha abcdef1234567890 --path / --path /dashboard --device desktop --device mobile --flow landing-smoke --snapshot landing-home --markdown-out preview.md --json-out preview.json --comment-out preview-comment.md
bun scripts/preview-verify.ts --url-template "https://preview-{pr}.example.com" --repo anup4khandelwal/codex-stack --pr 42 --branch feat/42-preview --sha abcdef1234567890 --path /dashboard --device desktop --flow landing-smoke --snapshot landing-home --a11y --a11y-scope main --perf --perf-budget lcp=2s --markdown-out preview.md --json-out preview.json --comment-out preview-comment.md
bun scripts/preview-verify.ts --url "https://anup4khandelwal.github.io/codex-stack/pr-preview/pr-42/" --repo anup4khandelwal/codex-stack --pr 42 --branch feat/42-preview --sha abcdef1234567890 --path /dashboard --device desktop --flow release-dashboard --session preview-auth --session-bundle .codex-stack/private/preview-auth.json --markdown-out preview.md --json-out preview.json --comment-out preview-comment.md
bun scripts/preview-verify.ts --url https://preview.example.com --path /dashboard --device desktop --flow landing-smoke --snapshot landing-home --json
```

Notes:

- `preview-verify.ts` resolves the preview URL from either `--url` or `--url-template`.
- Template placeholders support `{repo}`, `{owner}`, `{repo_name}`, `{pr}`, `{branch}`, `{branch_slug}`, `{sha}`, and `{short_sha}`.
- The script polls preview readiness before it delegates to `deploy-verify.ts`.
- `--session-bundle <path>` imports an exported browser session into the named preview session before live checks run.
- Preview reports now expose the deploy visual-risk score, including stale-baseline counts and top drivers.
- Preview reports also surface accessibility counts, top a11y rules, performance budget failures, and the worst captured perf metrics when those checks are enabled.
- `preview-verify.yml` is the manual rerun path. `pr-review.yml` is the automatic PR-time path and publishes the GitHub Pages preview before verification.
- For same-repo PRs, preview evidence is republished into the same Pages subtree under `__codex/visual/index.html`.
- Both preview workflows can consume the repo secret `CODEX_STACK_PREVIEW_SESSION_BUNDLE_B64` and decode it to a temp bundle file without exposing the contents in logs.
- The workflow uploads `preview.md`, `preview.json`, `preview-comment.md`, and the published deploy artifacts as a workflow artifact, then updates a stable PR comment.

## Deploy workflow

```bash
bun scripts/deploy-verify.ts --url https://staging.example.com --path / --path /dashboard --path /changes --device desktop --device mobile --flow release-dashboard --flow release-changes --snapshot release-dashboard --markdown-out deploy.md --json-out deploy.json --comment-out deploy-comment.md
bun scripts/deploy-verify.ts --url https://staging.example.com --path /dashboard --device desktop --flow release-dashboard --snapshot release-dashboard --a11y --a11y-scope main --perf --perf-budget lcp=2s --perf-budget cls=0.1 --markdown-out deploy.md --json-out deploy.json --comment-out deploy-comment.md
bun scripts/deploy-verify.ts --url https://staging.example.com --path /dashboard --device desktop --flow release-dashboard --session staging-auth --session-bundle .codex-stack/private/staging-auth.json --json
bun scripts/deploy-verify.ts --url-template "https://preview-{pr}.example.com" --repo anup4khandelwal/codex-stack --pr 42 --branch feat/42-preview --sha abcdef1234567890 --path /dashboard --device mobile --strict-console --strict-http --json
```

Notes:

- `deploy-verify.ts` resolves the live deploy URL from either `--url` or `--url-template`.
- It waits for readiness, verifies every requested `path x device` combination, and captures screenshots plus console evidence.
- Flow and snapshot checks are delegated to the existing QA runtime so the deploy report reuses the same finding model and artifacts.
- The same runtime can also run accessibility and performance checks, and deploy reports now publish those summaries into both markdown and `visual/index.html`.
- `--session-bundle <path>` validates the bundle up front, imports it into the named deploy session when live browser checks need it, and passes it through to `qa-run.ts`.

## Fleet workflow

```bash
bun scripts/fleet.ts validate --manifest .codex-stack/fleet.example.json
bun scripts/fleet.ts sync --manifest .codex-stack/fleet.example.json --dry-run --json
bun scripts/fleet.ts collect --manifest .codex-stack/fleet.example.json --json
bun scripts/fleet.ts dashboard --manifest .codex-stack/fleet.example.json --out .fleet-site
bun scripts/fleet.ts remediate --manifest .codex-stack/fleet.example.json --dry-run --json
bun scripts/fleet.ts remediate --manifest .codex-stack/fleet.example.json --dry-run --open-prs --control-agent fleet-1 --control-state .codex-stack/control-plane/state.json --json
bun scripts/fleet.ts validate --manifest .codex-stack/fleet.anup4khandelwal.json
bun scripts/fleet.ts sync --manifest .codex-stack/fleet.anup4khandelwal.json --open-prs
bun scripts/fleet.ts remediate --manifest .codex-stack/fleet.anup4khandelwal.json --open-prs --issue-repo anup4khandelwal/codex-stack
```

Notes:

- `fleet validate` checks the manifest, policy-pack references, and required-check configuration.
- `fleet sync` generates a compiled member config, a self-contained fleet-status script, and a status workflow for each managed repo.
- Use `localPath` entries in the manifest for local testing. Use `--open-prs` to clone target repos, push a rollout branch, and open or update PRs remotely.
- `fleet collect` reads normalized `codex-stack-fleet-status` outputs and ranks repos by rollout drift plus unresolved QA risk.
- Policy packs define whether a repo must publish a latest codex-stack QA/deploy report. Review-only repos can still be healthy without `docs/qa/` artifacts when rollout drift is zero.
- `fleet dashboard` writes `index.html`, `manifest.json`, and `summary.md` so the control repo can publish an org dashboard with the same data.
- `fleet remediate` consumes the collected health state, opens rollout PRs for config drift when requested, creates or closes stable remediation issues in the control repo for runtime warnings and criticals, and can require a local control-plane approval gate before rollout PRs open.
- Start from `.codex-stack/fleet.example.json` and `.codex-stack/policies/default.json` when bootstrapping a new fleet.
- Use `.codex-stack/fleet.anup4khandelwal.json` for the current checked-in rollout targeting `autopilot-multi-agent-loop`, `awesome-codex-skills`, and the profile repo.
- The script writes `report.md`, `report.json`, `comment.md`, `screenshots.json`, and a visual review pack under `visual/index.html` and `visual/manifest.json`.
- Deploy reports now include a single visual-risk score that combines path/device failures, console errors, snapshot drift, and stale baselines.

## Control-plane workflow

```bash
bun src/cli.ts agents list --json
bun src/cli.ts agents add --name lead-1 --runtime codex --role manager --team platform --status working
bun src/cli.ts agents add --name reviewer-1 --runtime claude-code --role reviewer --team platform --manager lead-1
bun src/cli.ts goals add --id release-q2 --title "Release Q2 hardening" --type initiative --owner lead-1 --status active
bun src/cli.ts goals task add --id review-contracts --goal release-q2 --title "Review agent contracts" --assignee reviewer-1
bun src/cli.ts goals task delegate review-contracts --id qa-contracts --title "Run delegated QA" --assignee qa-1
bun src/cli.ts goals queue --assignee reviewer-1 --json
bun src/cli.ts agents dashboard --out .codex-stack/control-plane/dashboard
```

Notes:

- The local state file defaults to `.codex-stack/control-plane/state.json`.
- `agents` manages roster metadata such as runtime, role, team, manager, and staffing status.
- `goals` manages goal hierarchy plus a persistent task queue with claim, reassign, block, unblock, complete, and delegate actions.
- `agents dashboard` writes `index.html`, `manifest.json`, and `summary.md` so you can inspect the local control plane without needing a server.

## Heartbeat and governance workflow

```bash
bun src/cli.ts agents budget set --agent ship-1 --window daily --max-runs 8 --max-minutes 120 --max-cost-units 20
bun src/cli.ts heartbeat schedule add --agent ship-1 --task ship-pr --trigger cron --expression "*/15 * * * *" --summary "Check release branch" --retry-limit 2 --cooldown-minutes 30
bun src/cli.ts heartbeat due --agent ship-1 --json
bun src/cli.ts heartbeat beat --agent ship-1 --task ship-pr --summary "Ready to open PR" --next-action "Open PR after approval" --require-approval ship-pr --approval-target ship-pr --json
bun src/cli.ts approvals list --agent ship-1 --status pending --json
bun src/cli.ts approvals approve <approval-id> --by lead-1 --note "Approved release PR"
bun src/cli.ts ship --dry-run --pr --control-agent ship-1 --control-state .codex-stack/control-plane/state.json
bun src/cli.ts heartbeat show ship-1 --json
```

Notes:

- `heartbeat schedule` records named wakeups using `manual`, `cron`, or `event` triggers.
- `heartbeat schedule` also tracks retry limits and cooloff windows, and `heartbeat due` only returns schedules whose cooloff has expired.
- `heartbeat beat` records a run, updates per-agent continuity state, and can automatically request approvals when the action needs a gate.
- Budget policies are attached per agent and checked against heartbeat runs in a daily, weekly, or monthly window.
- When a beat would exceed budget without a `budget-override` approval, it is recorded as blocked and the pending approval is created automatically.
- `approvals gate` gives a cheap allow/block answer for a specific kind plus target pair.

## MCP workflow

```bash
bun src/cli.ts mcp inspect --json
bun src/cli.ts mcp serve
```

Notes:

- MCP v1 is `stdio` only.
- MCP v1 is read-only plus dry-run only. Live `ship`, `issue`, `qa-decide`, `fleet sync --open-prs`, and `fleet remediate --open-prs` are intentionally not exposed.
- Published QA resources come from local tracked files under `docs/qa/`, including the checked-in `release-readiness-demo` sample report.
- The MCP server advertises tools for review, QA, preview, deploy, ship planning, fleet planning, retro summaries, and upgrade checks, plus resources for registered modes, skills, QA reports, and fleet metadata.

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
- `retro` now also scans published visual-pack manifests under `docs/qa/`, `.codex-stack/qa/`, and `.codex-stack/browse/artifacts/` to rank the highest-regression screenshots.
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
bun browse/src/cli.ts export-flow release-full-demo ./docs/release-full-demo.md
bun browse/src/cli.ts export-session ./tmp/staging-session.json --session staging
bun browse/src/cli.ts import-session ./tmp/staging-session.json --session staging-copy
bun browse/src/cli.ts import-browser-cookies chrome --session staging --profile Default
bun browse/src/cli.ts a11y https://example.com/dashboard --scope main --impact serious --session staging
bun browse/src/cli.ts perf https://example.com/dashboard --budget lcp=2s --budget cls=0.1 --wait-ms 400 --session staging
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
- `compare-snapshot` creates a portable visual pack with baseline/current screenshots, diff heatmap, image-diff score, annotation SVG, manifest JSON, and an HTML index page.
- Snapshot baselines now record captured route/device metadata so later QA runs can detect stale or mismatched references more reliably.
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
- Use `{"action":"use-flow","name":"release-login"}` inside a checked-in flow to compose a larger QA sequence.
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
