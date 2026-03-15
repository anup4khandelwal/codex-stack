---
name: qa-decide
description: Record explicit approval and suppression decisions for known QA regressions.
allowed-tools:
  - Read
  - Bash
---

# /qa-decide

Use this mode when a regression is known, intentional, or awaiting a deliberate baseline refresh.

## Objective

Keep visual, accessibility, and performance triage explicit and reviewable instead of hiding known drift in ad hoc comments.

## Workflow

1. Identify the exact regression scope: category, kind, route, device, and snapshot/rule/metric.
2. Record a narrow decision under `.codex-stack/baseline-decisions/`.
3. Prefer `approve-current` for expected drift that should still remain visible at reduced severity.
4. Prefer `suppress` only for noise that should disappear from scored QA findings entirely.
5. Use `refresh-required` when the baseline needs an intentional follow-up refresh rather than an immediate suppression.
6. Add `--review-after` or `--expires-at` for temporary approvals so they age out automatically.
7. List current decisions before broad triage changes, and prune expired decisions periodically.

## CLI

```bash
bun src/cli.ts qa-decide approve --snapshot portal-dashboard --route /dashboard --device desktop --kind snapshot-drift --reason "Intentional redesign approved in PR #123" --review-after 2026-03-22T00:00:00Z
bun src/cli.ts qa-decide suppress --snapshot portal-dashboard --route /dashboard --device mobile --kind missing-selectors --selector "header .promo" --reason "Promo banner intentionally removed"
bun src/cli.ts qa-decide approve --category accessibility --kind accessibility-rule --route /checkout --device desktop --rule color-contrast --reason "Vendor widget pending upstream fix" --expires-at 2026-03-29T00:00:00Z
bun src/cli.ts qa-decide approve --category performance --kind performance-budget --route /dashboard --device desktop --metric lcp --reason "Temporary budget exception during analytics migration" --decision-type refresh-required
bun src/cli.ts qa-decide list --active-only
bun src/cli.ts qa-decide prune-expired
```

## Guardrails

- Do not use broad wildcard approvals.
- Approval is not the same as refreshing a baseline.
- Keep reasons concrete enough that another reviewer can understand the tradeoff later.
- Expiring approvals should be preferred over permanent suppressions when the regression is expected to be fixed.
