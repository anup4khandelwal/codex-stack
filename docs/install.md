# Install

## Local setup

```bash
nvm use 24
./setup
```

This repo targets Node `24`.

`./setup` also creates project-local wrappers under `.codex-stack/bin/` for:

- `product`
- `tech`
- `review`
- `ship`
- `browse`
- `retro`

Then install a browser for Playwright:

```bash
npx playwright install chromium
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
