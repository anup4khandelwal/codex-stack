# Install

## Local setup

```bash
bun --version
./setup
```

This repo targets Bun `1.2+`.

`./setup` also creates project-local wrappers under `.codex-stack/bin/` for:

- `product`
- `tech`
- `review`
- `ship`
- `browse`
- `retro`

Then install a browser for Playwright:

```bash
bunx playwright install chromium
```

Named browser sessions are stored under `.codex-stack/browse/` and are already ignored by git.

## Install Codex skills

User-level:

```bash
bash scripts/install-skills.sh user
```

Project-level:

```bash
bash scripts/install-skills.sh project /path/to/repo
```

## Optional PATH wrappers

```bash
bash scripts/link-commands.sh
```
