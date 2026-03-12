# codex-stack

`codex-stack` turns Codex from one generic coding agent into a set of specialist workflow modes you can invoke on demand.

## Modes

| Mode | Role | Outcome |
|---|---|---|
| `product` | Product thinker | Reframe the request, tighten scope, define acceptance criteria |
| `tech` | Tech lead | Produce architecture, data flow, failure modes, and test plan |
| `review` | Paranoid staff engineer | Find structural issues that pass CI but break in production |
| `ship` | Release engineer | Validate branch state, run release checklist, prepare PR workflow |
| `browse` | QA engineer | Browser automation and deployment verification workflow |
| `retro` | Engineering manager | Weekly delivery retrospective from git and PR history |

## What this repo contains

- Codex-oriented skill files under `skills/`
- A small local CLI under `dist/cli.js`
- Install and linking scripts for `~/.codex/skills`
- A functional Playwright-backed browser runtime under `browse/`

## Quick start

```bash
cd codex-stack
./setup
node dist/cli.js list
node dist/cli.js show review
node dist/cli.js review
```

## Install skills for Codex

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
- `~/.codex/skills/codex-stack-tech`
- `~/.codex/skills/codex-stack-review`

## CLI usage

```bash
node dist/cli.js list
node dist/cli.js show product
node dist/cli.js path review
node dist/cli.js review --json
node dist/cli.js browse doctor
node dist/cli.js browse text https://example.com
node dist/cli.js doctor
```

## Repository layout

```text
codex-stack/
  browse/
  dist/
  docs/
  skills/
  scripts/
  src/
```

## Current scope

This scaffold prioritizes:

1. installable skill definitions
2. a command router for local discovery
3. a review-first workflow
4. a practical browser runtime for text, links, HTML, screenshots, and scripted flows

## Roadmap

### v0.1.0

- CLI router
- skill registry
- `product`, `tech`, `review`, `ship` workflows
- install/setup flow

### v0.2.0

- richer `ship` automation
- project-local mode aliases
- persistent browser sessions and multi-page QA flows

### v0.3.0

- retrospective report generator
- PR templates and review memory
- multi-agent orchestration

See [commands](./docs/commands.md), [install](./docs/install.md), and [examples](./docs/examples.md).
