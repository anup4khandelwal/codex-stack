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
- `qa`
- `preview`
- `ship`
- `browse`
- `retro`
- `upgrade`

Then install a browser for Playwright:

```bash
bunx playwright install chromium
```

Named browser sessions are stored under `.codex-stack/browse/` and are already ignored by git.

For authenticated preview or deploy checks, the local operator path is:

```bash
bun src/cli.ts browse import-browser-cookies chrome --session preview-auth --profile Default
bun src/cli.ts browse export-session .codex-stack/private/preview-auth.json --session preview-auth
```

If CI also needs that session, base64-encode the exported bundle and save it as the repo secret `CODEX_STACK_PREVIEW_SESSION_BUNDLE_B64`.

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
