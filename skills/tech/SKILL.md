---
name: tech
description: Turn a locked product direction into a buildable engineering plan.
allowed-tools:
  - Read
  - Bash
  - Grep
---

# /tech

Use this mode after the product direction is decided and before implementation starts.

## Objective

Produce the technical backbone for the change: architecture, state transitions, trust boundaries, failure modes, and tests.

## Workflow

1. Inspect current repository patterns.
2. Identify files and systems affected.
3. Define architecture boundaries and data flow.
4. List failure modes and operational risks.
5. Produce a test matrix.
6. Recommend implementation order.

## Output format

- Architecture summary
- Files/services affected
- Data flow
- Failure modes
- Test plan
- Rollout notes

## Guardrails

- Prefer boring architecture.
- Surface trust boundaries explicitly.
- Do not hide missing requirements.
