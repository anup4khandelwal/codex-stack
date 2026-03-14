# codex-stack

`codex-stack` turns Codex from a generic coding assistant into a team of workflow specialists you can call on demand.

Seven opinionated workflow modes for Codex: product framing, technical planning, paranoid diff review, browser QA, release shipping, browser automation, and engineering retrospectives.

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
| `qa` | QA lead | Runs browser flows and snapshot checks, then scores release readiness. |
| `ship` | Release engineer | Validates the branch, prepares PR metadata, and can run QA before opening the PR. |
| `browse` | QA engineer | Drives a real browser with persistent sessions, named flows, snapshots, and artifacts. |
| `retro` | Engineering manager | Summarizes delivery patterns from git history and optional GitHub PR analytics. |

## Default workflow

Use the repo in this order:

1. Open an issue
2. Create a branch from that issue
3. Open a PR from the issue branch
4. Let `pr-review` comment and gate the PR automatically
5. Add the `automerge` label when the PR is ready to merge after checks

## What ships today

- Installable Codex skills under `skills/`
- Checked-in root CLI under `dist/cli.js`
- Playwright-backed browser runtime under `browse/dist/cli.js`
- Persistent named browser sessions
- Checked-in and local browser flows with import/export for JSON, YAML, and Markdown
- Page snapshots and snapshot comparison artifacts
- QA reports with findings, severity, health score, saved evidence, and annotated screenshots for snapshot failures
- Shipping automation with PR body generation, labels, reviewers, assignees, projects, and optional QA verification
- PR comments with QA verification summaries and artifact references after `ship --pr`
- Tracked QA evidence published under `docs/qa/<branch>/` during shipping so PR comments can link to real files
- GitHub Pages publishing for `docs/qa/` so merged QA reports keep a stable URL after branch cleanup
- Issue-first workflow automation with PR review comments and opt-in auto-merge
- Retrospective analytics plus weekly digest publishing outputs for markdown, Slack, and email

## Quick start

```bash
bun --version
./setup
bunx playwright install chromium
bash scripts/install-skills.sh user
bun dist/cli.js list
```

`./setup` runs environment checks, installs Bun dependencies when needed, and creates local wrappers under `.codex-stack/bin/` for:

- `codex-stack`
- `codex-stack-browse`
- `product`
- `tech`
- `review`
- `qa`
- `ship`
- `browse`
- `retro`

If you want shell-level commands, link those wrappers into your `PATH`:

```bash
bash scripts/link-commands.sh
```

## Swarm multiple agents

You can run multiple Codex sessions in parallel across separate worktrees or terminals.

Typical split:

- one agent in `review`
- one agent in `qa`
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
bun dist/cli.js browse run-flow http://127.0.0.1:4173/login portal-full-demo --session friend-demo
bun dist/cli.js browse snapshot http://127.0.0.1:4173/dashboard portal-dashboard --session friend-demo
bun dist/cli.js qa http://127.0.0.1:4173/dashboard --flow portal-dashboard --snapshot portal-dashboard --session friend-demo
bun dist/cli.js ship --dry-run --pr --verify-url http://127.0.0.1:4173/dashboard --verify-flow portal-dashboard --verify-snapshot portal-dashboard
bun dist/cli.js retro --since "30 days ago" --no-github
bun run weekly
bun run qa:site
```

The checked-in `portal-login` flow clears the demo app's stored login state before navigation so you can re-run it safely on the same named browser session.

## Issue to merge flow

Create the work item and branch:

```bash
bun dist/cli.js issue start --title "Add issue-first PR workflow" --label automation --prefix feat
```

This creates a GitHub issue and a local branch like `feat/123-add-issue-first-pr-workflow`.

Ship the branch as a PR:

```bash
bun dist/cli.js ship --message "feat: add issue-first workflow" --push --pr
```

What happens next:

- `pr-review.yml` runs `codex-stack` review on the PR diff
- the workflow posts or updates a PR comment with findings
- the job fails if critical findings are detected
- if the PR has the `automerge` label, `pr-automerge.yml` enables GitHub auto-merge

Branch naming matters: when the branch follows `<prefix>/<issue-number>-slug`, `ship` includes `Closes #<issue-number>` in the generated PR body so the issue closes on merge.

## Root CLI

```bash
bun dist/cli.js list
bun dist/cli.js show qa
bun dist/cli.js review --json --base origin/main
bun dist/cli.js qa http://127.0.0.1:4173/dashboard --flow portal-dashboard --snapshot portal-dashboard --session demo --json
bun dist/cli.js ship --message "feat: ready for review" --push --pr --reviewer octocat --assignee @me --project "Engineering Roadmap"
bun dist/cli.js ship --dry-run --pr --verify-url http://127.0.0.1:4173/dashboard --verify-flow portal-dashboard --verify-snapshot portal-dashboard
bun dist/cli.js retro --since "7 days ago" --repo anup4khandelwal/codex-stack
bun dist/cli.js browse doctor
bun dist/cli.js browse flows
bun dist/cli.js browse snapshot https://example.com marketing-home --session staging
bun dist/cli.js browse compare-snapshot https://example.com marketing-home --session staging
```

Useful Bun scripts:

```bash
bun run doctor
bun run smoke
bun run demo:start
bun run demo:smoke
bun run review
bun run qa -- http://127.0.0.1:4173/dashboard --flow portal-dashboard --snapshot portal-dashboard --session demo
bun run ship:dry
bun run retro
bun run weekly
```

## Browser QA model

`browse` is the runtime. `qa` is the report layer.

Use `browse` when you want raw control:

- sessions
- named flows
- snapshots
- ad hoc assertions
- screenshots and artifacts

Use `qa` when you want a decision-ready report:

- pass / warning / critical status
- health score
- findings with evidence
- annotated SVG evidence for snapshot-based failures
- saved markdown/json report under `.codex-stack/qa/`

## Ship verification

`ship` can call `qa` before push/PR creation.

Example:

```bash
bun dist/cli.js ship \
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

## QA Pages

Build the static QA site locally:

```bash
bun run qa:site
open .site/index.html
```

On GitHub, `.github/workflows/qa-pages.yml` deploys the merged `docs/qa/` reports to Pages. `ship --pr` now emits two classes of QA links:

- branch artifact links that work immediately on the PR branch
- stable Pages links that activate after the branch is merged to `main`

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

Example prompts after installation:

```text
Use codex-stack-product to tighten this feature request into acceptance criteria.
Use codex-stack-review to audit the current branch against main and focus on production risk.
Use codex-stack-qa to verify the staging dashboard flow and tell me if it is safe to ship.
Use codex-stack-browse to capture a baseline snapshot for the new onboarding page.
```

## Repository layout

```text
codex-stack/
  browse/              Browser runtime, flows, and artifacts helpers
  dist/                Checked-in root CLI output
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
