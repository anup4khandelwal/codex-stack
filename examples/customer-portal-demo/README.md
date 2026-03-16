# Release Readiness Demo

This sample app exists to help a technical evaluator understand why `codex-stack` is useful.

It is not a toy landing page. It is a small release-readiness workspace that lets you demonstrate:
- authenticated browser automation
- release-readiness QA with stable assertions
- preview and deploy verification against believable routes
- ship decisions backed by evidence instead of vague prompts

## Start the app

```bash
bun run demo:start
```

Default URL:

```text
http://127.0.0.1:4173
```

## 5-minute guided demo

### 1. Show the release candidate context
Open the landing page and explain the setup:
- one release candidate
- one authenticated operator flow
- one dashboard that says whether merge is safe
- one change-impact page that explains where preview verification should focus

### 2. Run the authenticated browser flow

```bash
bun src/cli.ts browse run-flow http://127.0.0.1:4173/login release-full-demo --session evaluator-demo
```

What this proves:
- the package can drive a real browser flow
- session state persists across steps
- the demo is stable enough for repeated live runs

### 3. Show QA and snapshot evidence

```bash
bun src/cli.ts browse snapshot http://127.0.0.1:4173/dashboard release-dashboard --session evaluator-demo
bun src/cli.ts qa http://127.0.0.1:4173/dashboard --flow release-dashboard --snapshot release-dashboard --session evaluator-demo --json
```

What this proves:
- QA is not just “page looks okay”
- the tool produces a health score, findings, and evidence
- visual and route-level checks are part of the same decision

### 4. Show deploy-style verification

```bash
bun src/cli.ts deploy --url http://127.0.0.1:4173 --path /dashboard --path /changes --device desktop --device mobile --flow release-dashboard --flow release-changes --snapshot release-dashboard --publish-dir docs/qa/demo/deploy
```

What this proves:
- the package can verify multiple pages and devices
- the app is designed to show a realistic merge blocker on mobile
- the generated evidence can be published and reviewed

### 5. Show the ship decision

```bash
bun src/cli.ts ship --dry-run --pr --verify-url http://127.0.0.1:4173 --verify-path /dashboard --verify-path /changes --verify-device desktop --verify-device mobile --verify-flow release-dashboard --verify-flow release-changes --verify-snapshot release-dashboard
```

What this proves:
- shipping is connected to evidence, not just git automation
- the same demo story flows from browse -> qa -> deploy -> ship

## Best pages to talk through

- `/`
  - use this to frame the value proposition in 30 seconds
- `/dashboard`
  - use this to explain merge recommendation, blocking findings, and release confidence
- `/changes`
  - use this to explain route/device risk and why preview verification matters

## Recommended login

```text
email: release-owner@acme.dev
password: demo-password
```

Any non-empty values work. The recommended account simply gives the session a release-manager role label.

## Compatibility note

The repo still keeps the older `portal-*` flow names as wrappers so existing docs, fixtures, and workflows do not break immediately.

For new demos, use:
- `release-login`
- `release-dashboard`
- `release-changes`
- `release-full-demo`
