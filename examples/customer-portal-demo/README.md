# Customer Portal Demo

This sample app exists to demo `codex-stack` to another engineer without needing a real backend.

## Start the app

```bash
node examples/customer-portal-demo/server.mjs
```

Default URL:

```text
http://127.0.0.1:4173
```

## Best live demo flow

1. Start the app.
2. Open the landing page in a browser.
3. Run the checked-in QA flow.
4. Show a `ship --dry-run --pr` preview.
5. Show `retro` on recent repo history.

## Browser demo commands

```bash
node dist/cli.js browse flows
node dist/cli.js browse run-flow http://127.0.0.1:4173/login portal-login --session friend-demo
node dist/cli.js browse run-flow http://127.0.0.1:4173/dashboard portal-dashboard --session friend-demo
```

## Recommended login

```text
email: ops-demo@acme.dev
password: demo-password
```

Any non-empty values will work.
