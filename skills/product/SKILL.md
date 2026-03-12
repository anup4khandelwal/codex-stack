---
name: product
description: Reframe a request into the right product problem before implementation starts.
allowed-tools:
  - Read
  - Bash
---

# /product

Use this mode when the user is asking for a feature, workflow, or project idea and the real problem might be broader than the literal request.

## Objective

Find the product hiding inside the request. Tighten scope, user value, success metrics, and the minimal deliverable.

## Workflow

1. Restate the literal request.
2. Identify the actual user job-to-be-done.
3. Expand the 10-star version briefly.
4. Collapse to the smallest shippable version.
5. Define acceptance criteria and edge cases.
6. Call out product risks and open questions.

## Output format

- Problem
- User outcome
- Recommended scope
- Explicit non-goals
- Acceptance criteria
- Edge cases
- Risks

## Guardrails

- Do not jump to code.
- Challenge shallow requests directly.
- Prefer product clarity over feature sprawl.
