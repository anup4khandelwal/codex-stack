<!-- codex-stack:deploy-verify -->
# codex-stack deploy verification
- Repo: anup4khandelwal/codex-stack
- PR: 48
- Branch: feat/47-visual-diff-and-digests
- SHA: b7e5d8a
- Deploy URL: https://anup4khandelwal.github.io/codex-stack/pr-preview/pr-48/
- URL source: direct
- Readiness: ready after 3 attempt(s)
- Last HTTP status: 200
- Overall status: pass
- Devices: desktop, mobile
- Paths: /login, /dashboard
- Strict console errors: no
- Strict HTTP errors: no
- QA health score: 100
- Recommendation: QA checks passed. Keep the snapshot baseline fresh when intentional UI changes land.
- Workflow run: https://github.com/anup4khandelwal/codex-stack/actions/runs/23102463206
## Page checks
- /login @ desktop, status=pass, http=200, screenshot=preview-artifacts/screenshots/login-desktop.png
- /login @ mobile, status=pass, http=200, screenshot=preview-artifacts/screenshots/login-mobile.png
- /dashboard @ desktop, status=pass, http=200, screenshot=preview-artifacts/screenshots/dashboard-desktop.png
- /dashboard @ mobile, status=pass, http=200, screenshot=preview-artifacts/screenshots/dashboard-mobile.png
## Flow results
- portal-full-demo: pass (12 steps)
## Snapshot results
- No snapshot checks configured.
## QA findings
- No QA findings.
## Artifacts
- Artifact root: `preview-artifacts`
- Screenshot manifest: `preview-artifacts/screenshots.json`
- Visual pack: `preview-artifacts/visual/index.html`
- Visual manifest: `preview-artifacts/visual/manifest.json`
- QA report: `preview-artifacts/qa/report.md`
- QA json: `preview-artifacts/qa/report.json`
