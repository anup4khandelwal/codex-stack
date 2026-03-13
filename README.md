# codex-stack

`codex-stack` packages six specialist Codex workflows into one repo: product framing, technical planning, diff review, shipping, browser QA, and delivery retrospectives.

It ships with installable skill directories under `skills/`, a checked-in Node CLI under `dist/cli.js`, and a Playwright-backed browser runtime under `browse/dist/cli.js`.

## Requirements

- Node `24+`
- npm `10+`
- Playwright browser binaries for browser automation: `npx playwright install chromium`

`dist/` is checked in, so the repo works even if `tsc` is not installed locally.

## Modes

| Mode | Role | What it is for |
| --- | --- | --- |
| `product` | Product thinker | Reframe a request into the real user problem, scope, and acceptance criteria |
| `tech` | Tech lead | Turn approved scope into architecture, trust boundaries, failure modes, and a test plan |
| `review` | Paranoid staff engineer | Audit a branch for structural production risks instead of style noise |
| `ship` | Release engineer | Run validation, prepare commit and PR metadata, and ship with less manual glue |
| `browse` | QA engineer | Drive a real browser with persistent sessions and reusable flow files |
| `retro` | Engineering manager | Summarize recent delivery patterns from git history and optional GitHub PR analytics |

## Quick Start

```bash
nvm use 24
./setup
npx playwright install chromium
bash scripts/install-skills.sh user
node dist/cli.js list
node dist/cli.js review
```

`./setup` runs environment checks, installs npm dependencies when needed, and creates local wrappers at:

- `.codex-stack/bin/codex-stack`
- `.codex-stack/bin/codex-stack-browse`

If you want global shell wrappers, link them into your `PATH`:

```bash
bash scripts/link-commands.sh
```

## Install Skills For Codex

User-level install:

```bash
bash scripts/install-skills.sh user
```

Project-level install:

```bash
bash scripts/install-skills.sh project /path/to/repo
```

This creates symlinks such as:

- `~/.codex/skills/codex-stack-product`
- `~/.codex/skills/codex-stack-review`
- `~/.codex/skills/codex-stack-browse`

Example prompts after installation:

```text
Use codex-stack-product to tighten this feature request into acceptance criteria.
Use codex-stack-review to audit the current branch against main and focus on production risk.
Use codex-stack-browse to verify the staging login flow in a persistent browser session.
```

## CLI Overview

The root CLI is a router for discovery plus the `review`, `ship`, `retro`, and `browse` workflows.

```bash
node dist/cli.js list
node dist/cli.js show review
node dist/cli.js path browse
node dist/cli.js doctor
node dist/cli.js review --json --base origin/main
node dist/cli.js ship --dry-run
node dist/cli.js ship --message "feat: ready for review" --push --pr --reviewer octocat --team-reviewer acme/platform --label release-candidate
node dist/cli.js retro --since "7 days ago" --repo anup4khandelwal/codex-stack
node dist/cli.js browse doctor
node dist/cli.js browse flows
node dist/cli.js browse run-flow https://example.com/login landing-smoke --session staging
```

Useful npm scripts:

```bash
npm run doctor
npm run smoke
npm run review
npm run ship:dry
npm run retro
npm run browse:doctor
```

## Workflow Notes

### Review

- `review` compares the current branch against a base ref and emits ordered findings.
- It uses heuristics for large diffs, sensitive paths, destructive SQL, unsafe HTML/code execution, background-job risk, workflow changes, and missing tests.
- The review checklist lives at `skills/review/checklist.md`.

### Ship

- `ship` can run repository validation before shipping. In this repo it will prefer `npm run smoke`.
- It can generate a PR title/body from the branch diff, merge that content into a detected PR template, infer labels from branch and changed files, and infer reviewers from `CODEOWNERS`.
- Supported flags include `--dry-run`, `--push`, `--pr`, `--title`, `--body`, `--body-file`, `--template`, `--reviewer`, `--team-reviewer`, `--label`, `--milestone`, `--draft`, `--no-auto-labels`, `--no-auto-reviewers`, and `--json`.

### Browse

- `browse` uses persistent Playwright profiles per named session.
- Local session state and user-created flows live under `.codex-stack/browse/`.
- Checked-in shared flows live under `browse/flows/`.
- Local flows override repo flows with the same name, which makes ad hoc QA safe without mutating shared fixtures.

Examples:

```bash
node dist/cli.js browse text https://example.com --session staging
node dist/cli.js browse save-flow login-local '[{"action":"fill","selector":"input[name=email]","value":"demo@example.com"},{"action":"fill","selector":"input[name=password]","value":"demo-pass"},{"action":"click","selector":"button[type=submit]"}]'
node dist/cli.js browse login https://example.com/login login-local --session staging
node dist/cli.js browse assert-text https://example.com "h1" "Example Domain" --session staging
```

### Retro

- `retro` summarizes throughput, merge churn, top work areas, and authors from git history.
- By default it writes `latest.md`, `latest.json`, and timestamped snapshots under `.codex-stack/retros/`.
- When `gh` is installed and repo access is available, it also adds PR analytics such as merge time, first-review latency, backlog, and reviewer load.

## Repository Layout

```text
codex-stack/
  browse/              Playwright runtime and checked-in QA flows
  dist/                Checked-in root CLI output
  docs/                Install, command, and example docs
  scripts/             Setup, install, review, ship, and retro helpers
  skills/              Installable Codex skills
  src/                 TypeScript source for the root CLI
```

## Documentation

- [Install guide](./docs/install.md)
- [Command reference](./docs/commands.md)
- [Examples](./docs/examples.md)

## License

[MIT](./LICENSE)
