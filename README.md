# codex-stack

`codex-stack` turns Codex from a generic coding assistant into a team of workflow specialists you can call on demand.

Seven opinionated workflow modes for Codex: product framing, technical planning, paranoid diff review, browser QA, release shipping, browser automation, and engineering retrospectives.

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

## What ships today

- Installable Codex skills under `skills/`
- Checked-in root CLI under `dist/cli.js`
- Playwright-backed browser runtime under `browse/dist/cli.js`
- Persistent named browser sessions
- Checked-in and local browser flows with import/export for JSON, YAML, and Markdown
- Page snapshots and snapshot comparison artifacts
- QA reports with findings, severity, health score, and saved evidence
- Shipping automation with PR body generation, labels, reviewers, assignees, projects, and optional QA verification
- Retrospective analytics plus weekly digest publishing outputs for markdown, Slack, and email

## Quick start

```bash
nvm use 24
./setup
npx playwright install chromium
bash scripts/install-skills.sh user
node dist/cli.js list
```

`./setup` runs environment checks, installs npm dependencies when needed, and creates local wrappers under `.codex-stack/bin/` for:

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

## Demo the sample app

The repo includes a small demo app at `examples/customer-portal-demo/` so you can show a full workflow without a backend.

Start it:

```bash
npm run demo:start
```

Then run a realistic sequence:

```bash
node dist/cli.js browse run-flow http://127.0.0.1:4173/login portal-full-demo --session friend-demo
node dist/cli.js browse snapshot http://127.0.0.1:4173/dashboard portal-dashboard --session friend-demo
node dist/cli.js qa http://127.0.0.1:4173/dashboard --flow portal-dashboard --snapshot portal-dashboard --session friend-demo
node dist/cli.js ship --dry-run --pr --verify-url http://127.0.0.1:4173/dashboard --verify-flow portal-dashboard --verify-snapshot portal-dashboard
node dist/cli.js retro --since "30 days ago" --no-github
npm run weekly
```

The checked-in `portal-login` flow clears the demo app's stored login state before navigation so you can re-run it safely on the same named browser session.

## Root CLI

```bash
node dist/cli.js list
node dist/cli.js show qa
node dist/cli.js review --json --base origin/main
node dist/cli.js qa http://127.0.0.1:4173/dashboard --flow portal-dashboard --snapshot portal-dashboard --session demo --json
node dist/cli.js ship --message "feat: ready for review" --push --pr --reviewer octocat --assignee @me --project "Engineering Roadmap"
node dist/cli.js ship --dry-run --pr --verify-url http://127.0.0.1:4173/dashboard --verify-flow portal-dashboard --verify-snapshot portal-dashboard
node dist/cli.js retro --since "7 days ago" --repo anup4khandelwal/codex-stack
node dist/cli.js browse doctor
node dist/cli.js browse flows
node dist/cli.js browse snapshot https://example.com marketing-home --session staging
node dist/cli.js browse compare-snapshot https://example.com marketing-home --session staging
```

Useful npm scripts:

```bash
npm run doctor
npm run smoke
npm run demo:start
npm run demo:smoke
npm run review
npm run qa -- http://127.0.0.1:4173/dashboard --flow portal-dashboard --snapshot portal-dashboard --session demo
npm run ship:dry
npm run retro
npm run weekly
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
- saved markdown/json report under `.codex-stack/qa/`

## Ship verification

`ship` can call `qa` before push/PR creation.

Example:

```bash
node dist/cli.js ship \
  --message "feat: ready for review" \
  --push \
  --pr \
  --verify-url https://staging.example.com/dashboard \
  --verify-flow landing-smoke \
  --verify-snapshot landing-home
```

This keeps QA in the shipping path instead of as a manual follow-up.

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
