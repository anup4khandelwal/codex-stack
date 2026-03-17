<!-- codex-stack:preview-verify -->
# codex-stack preview verification
- Repo: anup4khandelwal/codex-stack
- PR: 46
- Branch: feat/45-add-visual-pr-qa-packs
- SHA: 8147799
- Preview URL: https://anup4khandelwal.github.io/codex-stack/pr-preview/pr-46/
- URL source: direct
- Readiness: ready after 3 attempt(s)
- Last HTTP status: 200
- Overall status: pass
- Health score: 100
- Recommendation: QA checks passed. Keep the snapshot baseline fresh when intentional UI changes land.
- Workflow run: https://github.com/anup4khandelwal/codex-stack/actions/runs/23102180405
## Preview findings
- No findings.
## Flow results
- portal-full-demo: pass (12 steps)
## Deploy checks
- /login @ desktop, status=pass, http=200, screenshot=preview-artifacts/screenshots/login-desktop.png
- /login @ mobile, status=pass, http=200, screenshot=preview-artifacts/screenshots/login-mobile.png
- /dashboard @ desktop, status=pass, http=200, screenshot=preview-artifacts/screenshots/dashboard-desktop.png
- /dashboard @ mobile, status=pass, http=200, screenshot=preview-artifacts/screenshots/dashboard-mobile.png
## Snapshot results
- No snapshot checks configured.
## Artifacts
- Artifact root: `preview-artifacts`
- Screenshot manifest: `preview-artifacts/screenshots.json`
- Visual pack: `preview-artifacts/visual/index.html`
- Visual manifest: `preview-artifacts/visual/manifest.json`
- QA report: `preview-artifacts/qa/report.md`
- QA json: `preview-artifacts/qa/report.json`
