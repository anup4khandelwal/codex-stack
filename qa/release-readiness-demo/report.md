# QA Report

- URL: https://anup4khandelwal.github.io/codex-stack/
- Mode: full
- Session: qa
- Generated: 2026-03-16T11:42:26.831Z
- Status: warning
- Health score: 14
- Recommendation: Hold the release until the regression evidence is explained or the baseline is refreshed intentionally.
- Visual risk: LOW (13.5/100)

## Findings

### MEDIUM • visual: Snapshot drift detected

The page differs from the saved baseline for release-dashboard.

Evidence: snapshot=release-dashboard, route=/dashboard, device=desktop, selectors=[data-qa='release-status-card'], [data-qa='changes-approval-banner'], [data-qa='changes-escalation-chip'], decisionKind=snapshot-drift, decisionTitle=Snapshot drift detected, screenshot=docs/qa/release-readiness-demo/screenshot.png, current=docs/qa/release-readiness-demo/visual/current.json, annotation=docs/qa/release-readiness-demo/annotation.svg, visualPack=docs/qa/release-readiness-demo/visual/index.html, diffImage=docs/qa/release-readiness-demo/visual/diff.png

### HIGH • accessibility: Accessibility violation: color-contrast

Elements must meet minimum color contrast ratio thresholds (1 affected node)

Evidence: rule=color-contrast, impact=serious, route=/codex-stack/, device=desktop, decisionKind=accessibility-rule, decisionTitle=color-contrast, selectors=[data-qa='changes-approval-banner'], helpUrl=https://dequeuniversity.com/rules/axe/4.10/color-contrast

### MEDIUM • accessibility: Accessibility violation: aria-input-field-name

Form elements must have labels (1 affected node)

Evidence: rule=aria-input-field-name, impact=moderate, route=/codex-stack/, device=desktop, decisionKind=accessibility-rule, decisionTitle=aria-input-field-name, selectors=[data-qa='qa-exception-input'], helpUrl=https://dequeuniversity.com/rules/axe/4.10/aria-input-field-name

### HIGH • performance: Performance budget exceeded: Largest Contentful Paint

LCP exceeded the demo budget by 260ms on the release dashboard.

Evidence: metric=lcp, route=/codex-stack/, device=desktop, decisionKind=performance-budget, decisionTitle=Largest Contentful Paint, threshold=2200, value=2460

### MEDIUM • performance: Performance budget exceeded: Cumulative Layout Shift

CLS exceeded the demo budget by 0.04 because the approval banner pushed the checklist.

Evidence: metric=cls, route=/codex-stack/, device=desktop, decisionKind=performance-budget, decisionTitle=Cumulative Layout Shift, threshold=0.1, value=0.14

## Flow results

- release-login: pass
- release-dashboard: pass
- release-changes: pass

## Route results

- none

## Diff-aware inference

- Diff-aware inference: not used

## Snapshot

- Snapshot: changed (release-dashboard)
- Baseline freshness: fresh (1.2d old at /dashboard on desktop)
- Screenshot: docs/qa/release-readiness-demo/screenshot.png
- Annotation: docs/qa/release-readiness-demo/annotation.svg
- Visual pack: docs/qa/release-readiness-demo/visual/index.html
- Visual manifest: docs/qa/release-readiness-demo/visual/manifest.json
- Image diff score: 84.3

## Accessibility

- Minimum impact: serious
- Scope selectors: main, [data-qa='changes-approval-banner']
- Violations: 2
- Passes: 14
- Incomplete: 1
- Top rules: color-contrast, aria-input-field-name
- Accessibility JSON: docs/qa/release-readiness-demo/a11y.json
- Accessibility Markdown: docs/qa/release-readiness-demo/a11y.md

## Performance

- Wait after load: 1200 ms
- Budget violations: 2
- Top violations: Largest Contentful Paint exceeded budget; Cumulative Layout Shift exceeded budget
- TTFB: 182 ms
- DOMContentLoaded: 640 ms
- Load event: 1120 ms
- FCP: 710 ms
- LCP: 2460 ms
- CLS: 0.14
- JS heap used: 17.58 MB
- Resource count: 27
- Failed resource count: 0
- Performance JSON: docs/qa/release-readiness-demo/performance.json
- Performance Markdown: docs/qa/release-readiness-demo/performance.md

## Regression triage

- Decisions loaded: 0
- Applied decisions: 0
- Approved regressions: 0
- Suppressed findings: 0
- Refresh required decisions: 0
- Expired decisions: 0
- Unresolved regressions: 5
- Decisions expiring soon: 0

### Applied decisions

- none

### Expired decisions

- none

### Unresolved regressions

- MEDIUM visual/snapshot-drift: Snapshot drift detected @ /dashboard (desktop)
- HIGH accessibility/accessibility-rule: Accessibility violation: color-contrast @ /codex-stack/ (desktop)
- MEDIUM accessibility/accessibility-rule: Accessibility violation: aria-input-field-name @ /codex-stack/ (desktop)
- HIGH performance/performance-budget: Performance budget exceeded: Largest Contentful Paint @ /codex-stack/ (desktop)
- MEDIUM performance/performance-budget: Performance budget exceeded: Cumulative Layout Shift @ /codex-stack/ (desktop)
