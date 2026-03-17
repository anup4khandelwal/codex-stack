<!-- codex-stack:deploy-verify -->
# codex-stack deploy verification
- Repo: anup4khandelwal/codex-stack
- PR: 82
- Branch: feat/81-add-mcp-server
- SHA: 71274ee
- Deploy URL: https://anup4khandelwal.github.io/codex-stack/pr-preview/pr-82/
- URL source: direct
- Readiness: ready after 4 attempt(s)
- Last HTTP status: 200
- Overall status: pass
- Visual risk: NONE (0/100)
- Devices: desktop, mobile
- Paths: /login, /dashboard
- Strict console errors: no
- Strict HTTP errors: no
- Accessibility enabled: no
- Performance enabled: no
- QA health score: 100
- Recommendation: QA checks passed. Keep the snapshot baseline fresh when intentional UI changes land.
- Workflow run: https://github.com/anup4khandelwal/codex-stack/actions/runs/23143522000
## Page checks
- /login @ desktop, status=pass, http=200, screenshot=preview-artifacts/screenshots/login-desktop.png
- /login @ mobile, status=pass, http=200, screenshot=preview-artifacts/screenshots/login-mobile.png
- /dashboard @ desktop, status=pass, http=200, screenshot=preview-artifacts/screenshots/dashboard-desktop.png
- /dashboard @ mobile, status=pass, http=200, screenshot=preview-artifacts/screenshots/dashboard-mobile.png
## Flow results
- portal-full-demo: pass (20 steps)
## Snapshot results
- No snapshot checks configured.
## Accessibility
- Accessibility checks were not enabled.
## Performance
- Performance checks were not enabled.
## Regression triage
- Decisions loaded: 0
- Applied decisions: 0
- Approved regressions: 0
- Suppressed findings: 0
- Refresh required decisions: 0
- Expired decisions: 0
- Unresolved regressions: 0
- Decisions expiring soon: 0
## QA findings
- No QA findings.
## Artifacts
- Artifact root: `preview-artifacts`
- Screenshot manifest: `preview-artifacts/screenshots.json`
- Visual pack: `preview-artifacts/visual/index.html`
- Visual manifest: `preview-artifacts/visual/manifest.json`
- QA report: `preview-artifacts/qa/report.md`
- QA json: `preview-artifacts/qa/report.json`
