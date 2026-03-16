#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(pwd)"
TMP_REPO="$(mktemp -d)"
trap 'rm -rf "$TMP_REPO"' EXIT

if ! command -v bun >/dev/null 2>&1; then
  echo "bun is required to run codex-stack smoke checks" >&2
  exit 1
fi

run_ts() {
  bun "$@"
}

run_eval() {
  bun -e "$1"
}

echo "[1/8] root CLI list"
run_ts src/cli.ts list >/tmp/codex-stack-list.log
grep -q '^qa' /tmp/codex-stack-list.log
grep -q '^qa-decide' /tmp/codex-stack-list.log
grep -q '^preview' /tmp/codex-stack-list.log
grep -q '^deploy' /tmp/codex-stack-list.log
grep -q '^upgrade' /tmp/codex-stack-list.log
grep -q '^agents' /tmp/codex-stack-list.log
grep -q '^goals' /tmp/codex-stack-list.log

echo "[2/8] root CLI show/path"
run_ts src/cli.ts show review >/tmp/codex-stack-show.log
run_ts src/cli.ts path review >/tmp/codex-stack-path.log
run_ts src/cli.ts show qa >/tmp/codex-stack-show-qa.log
run_ts src/cli.ts show qa-decide >/tmp/codex-stack-show-qa-decide.log
run_ts src/cli.ts show preview >/tmp/codex-stack-show-preview.log
run_ts src/cli.ts show deploy >/tmp/codex-stack-show-deploy.log
run_ts src/cli.ts show upgrade >/tmp/codex-stack-show-upgrade.log
run_ts src/cli.ts show agents >/tmp/codex-stack-show-agents.log
run_ts src/cli.ts show goals >/tmp/codex-stack-show-goals.log
run_ts src/cli.ts issue --help >/tmp/codex-stack-issue-help.log

echo "[3/8] doctor checks"
run_ts src/cli.ts doctor >/tmp/codex-stack-doctor.log
run_ts browse/src/cli.ts doctor >/tmp/codex-stack-browse-doctor.log
grep -q 'snapshot' /tmp/codex-stack-browse-doctor.log
grep -q 'export-session' /tmp/codex-stack-browse-doctor.log
grep -q 'import-browser-cookies' /tmp/codex-stack-browse-doctor.log
grep -q 'probe' /tmp/codex-stack-browse-doctor.log
grep -q 'assert-focused' /tmp/codex-stack-browse-doctor.log
grep -q 'upload' /tmp/codex-stack-browse-doctor.log

echo "[4/8] browse flow registry"
run_ts browse/src/cli.ts save-flow smoke '[{"action":"wait","ms":1},{"action":"assert-url","value":"example.com"}]' >/tmp/codex-stack-flow-save.log
run_ts browse/src/cli.ts show-flow smoke >/tmp/codex-stack-flow-show.log
run_ts browse/src/cli.ts flows >/tmp/codex-stack-flow-list.log
grep -q '"source": "repo"' /tmp/codex-stack-flow-list.log
cat > /tmp/codex-stack-flow-import.yaml <<'YAML'
- action: "wait"
  ms: 1
- action: "assert-url"
  value: "example.com"
YAML
run_ts browse/src/cli.ts import-flow imported-smoke /tmp/codex-stack-flow-import.yaml >/tmp/codex-stack-flow-import.log
run_ts browse/src/cli.ts export-flow imported-smoke /tmp/codex-stack-flow-export.md >/tmp/codex-stack-flow-export.log
grep -q '```yaml' /tmp/codex-stack-flow-export.md
run_ts browse/src/cli.ts import-flow imported-smoke-md /tmp/codex-stack-flow-export.md >/tmp/codex-stack-flow-import-md.log
run_ts browse/src/cli.ts delete-flow smoke >/tmp/codex-stack-flow-delete.log
run_ts browse/src/cli.ts delete-flow imported-smoke >/tmp/codex-stack-flow-delete-imported.log
run_ts browse/src/cli.ts delete-flow imported-smoke-md >/tmp/codex-stack-flow-delete-imported-md.log
bash ./setup >/tmp/codex-stack-setup.log
test -x .codex-stack/bin/review
test -x .codex-stack/bin/qa
test -x .codex-stack/bin/qa-decide
test -x .codex-stack/bin/preview
test -x .codex-stack/bin/deploy
test -x .codex-stack/bin/ship
test -x .codex-stack/bin/browse
test -x .codex-stack/bin/setup-browser-cookies
test -x .codex-stack/bin/upgrade
test -x .codex-stack/bin/agents
test -x .codex-stack/bin/goals

echo "[5/8] review, ship, retro, and demo interfaces"
run_ts scripts/review-diff.ts --help >/tmp/codex-stack-review-help.log
run_ts scripts/issue-flow.ts --help >/tmp/codex-stack-issue-flow-help.log
run_ts scripts/issue-flow.spec.ts >/tmp/codex-stack-issue-flow-spec.log
run_ts scripts/render-pr-review.spec.ts >/tmp/codex-stack-render-pr-review-spec.log
run_ts scripts/browse-advanced.spec.ts >/tmp/codex-stack-browse-advanced-spec.log
run_ts scripts/browse-semantic-device.spec.ts >/tmp/codex-stack-browse-semantic-device-spec.log
run_ts scripts/browse-iframe.spec.ts >/tmp/codex-stack-browse-iframe-spec.log
run_ts scripts/browse-network.spec.ts >/tmp/codex-stack-browse-network-spec.log
run_ts scripts/browse-download.spec.ts >/tmp/codex-stack-browse-download-spec.log
run_ts scripts/browse-a11y-perf.spec.ts >/tmp/codex-stack-browse-a11y-perf-spec.log
run_ts scripts/qa-diff.spec.ts >/tmp/codex-stack-qa-diff-spec.log
run_ts scripts/qa-run.ts --help >/tmp/codex-stack-qa-help.log
run_ts scripts/qa-decide.ts --help >/tmp/codex-stack-qa-decide-help.log
run_ts scripts/qa-decisions.spec.ts >/tmp/codex-stack-qa-decisions-spec.log
run_ts scripts/qa-run.spec.ts >/tmp/codex-stack-qa-spec.log
run_ts scripts/qa-trends.spec.ts >/tmp/codex-stack-qa-trends-spec.log
run_ts scripts/qa-diff-mode.spec.ts >/tmp/codex-stack-qa-diff-mode-spec.log
run_ts scripts/browse-session.spec.ts >/tmp/codex-stack-browse-session-spec.log
run_ts scripts/browse-browser-profile.spec.ts >/tmp/codex-stack-browse-browser-profile-spec.log
run_ts scripts/browse-snapshot-visual-pack.spec.ts >/tmp/codex-stack-browse-snapshot-pack-spec.log
run_ts scripts/preview-verify.ts --help >/tmp/codex-stack-preview-help.log
run_ts scripts/deploy-verify.ts --help >/tmp/codex-stack-deploy-help.log
run_ts scripts/build-preview-site.ts --help >/tmp/codex-stack-build-preview-help.log
run_ts scripts/deploy-verify.spec.ts >/tmp/codex-stack-deploy-spec.log
run_ts scripts/build-preview-site.spec.ts >/tmp/codex-stack-build-preview-spec.log
run_ts scripts/publish-demo-qa.spec.ts >/tmp/codex-stack-publish-demo-qa-spec.log
run_ts scripts/mcp-server.spec.ts >/tmp/codex-stack-mcp-server-spec.log
run_ts scripts/cleanup-preview-site.spec.ts >/tmp/codex-stack-preview-cleanup-spec.log
run_ts scripts/preview-workflow-auth.spec.ts >/tmp/codex-stack-preview-workflow-auth-spec.log
run_ts scripts/ship-branch.ts --help >/tmp/codex-stack-ship-help.log
run_ts scripts/retro-report.ts --help >/tmp/codex-stack-retro-help.log
run_ts scripts/retro-report.spec.ts >/tmp/codex-stack-retro-spec.log
run_ts scripts/upgrade-check.ts --offline --json >/tmp/codex-stack-upgrade.json
run_ts scripts/upgrade-check.spec.ts >/tmp/codex-stack-upgrade-spec.log
run_ts scripts/control-plane.spec.ts >/tmp/codex-stack-control-plane-spec.log
run_ts scripts/fleet.ts validate --manifest .codex-stack/fleet.example.json --json >/tmp/codex-stack-fleet-validate.json
run_ts scripts/fleet.ts sync --manifest .codex-stack/fleet.example.json --dry-run --json >/tmp/codex-stack-fleet-sync.json
run_ts scripts/fleet.ts remediate --manifest .codex-stack/fleet.example.json --dry-run --json >/tmp/codex-stack-fleet-remediate.json
run_ts scripts/fleet.spec.ts >/tmp/codex-stack-fleet-spec.log
run_ts scripts/preview-verify.spec.ts >/tmp/codex-stack-preview-spec.log
run_ts scripts/weekly-digest.spec.ts >/tmp/codex-stack-weekly-spec.log
run_ts scripts/render-qa-pages.spec.ts >/tmp/codex-stack-render-qa-pages-spec.log
grep -q '"overallStatus"' /tmp/codex-stack-upgrade.json
grep -q '"offline": true' /tmp/codex-stack-upgrade.json
grep -q '"controlRepo"' /tmp/codex-stack-fleet-validate.json
grep -q '"results"' /tmp/codex-stack-fleet-sync.json
grep -q '"bucket"' /tmp/codex-stack-fleet-remediate.json
run_ts scripts/retro-report.ts --since "1 day ago" --artifact-dir /tmp/codex-stack-retros --no-github >/tmp/codex-stack-retro.log
run_ts scripts/weekly-digest.ts --since "1 day ago" --out /tmp/codex-stack-weekly.md --json-out /tmp/codex-stack-weekly.json --publish-dir /tmp/codex-stack-weekly-publish --no-github >/tmp/codex-stack-weekly.log
mkdir -p .codex-stack/browse/snapshots .codex-stack/browse/artifacts
mkdir -p .codex-stack/browse/artifacts/example-visual
run_eval "process.stdout.write(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l9i8AAAAASUVORK5CYII=','base64'))" > .codex-stack/browse/artifacts/example-1.png
run_eval "process.stdout.write(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l9i8AAAAASUVORK5CYII=','base64'))" > .codex-stack/browse/artifacts/example-visual/baseline.png
run_eval "process.stdout.write(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9l9i8AAAAASUVORK5CYII=','base64'))" > .codex-stack/browse/artifacts/example-visual/current.png
cat > .codex-stack/browse/snapshots/example.json <<'JSON'
{
  "name": "example",
  "capturedAt": "2025-01-01T00:00:00.000Z",
  "routePath": "/",
  "device": "desktop",
  "elements": [
    {
      "selector": "h1",
      "bounds": { "x": 0, "y": 0, "width": 1, "height": 1 }
    }
  ]
}
JSON
cat > .codex-stack/browse/artifacts/example-1.json <<'JSON'
{
  "name": "example",
  "elements": []
}
JSON
cat > .codex-stack/browse/artifacts/example-visual/index.html <<'HTML'
<html><body>visual pack</body></html>
HTML
cat > .codex-stack/browse/artifacts/example-visual/manifest.json <<'JSON'
{
  "status": "changed"
}
JSON
cat > .codex-stack/browse/artifacts/example-visual/annotation.svg <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg"></svg>
SVG
cat > /tmp/codex-stack-qa-fixture.json <<'JSON'
{
  "url": "https://example.com/demo",
  "snapshot": {
    "name": "example",
    "result": {
      "status": "changed",
      "baseline": ".codex-stack/browse/snapshots/example.json",
      "current": ".codex-stack/browse/artifacts/example-1.json",
      "screenshot": ".codex-stack/browse/artifacts/example-1.png",
      "visualPack": {
        "dir": ".codex-stack/browse/artifacts/example-visual",
        "index": ".codex-stack/browse/artifacts/example-visual/index.html",
        "manifest": ".codex-stack/browse/artifacts/example-visual/manifest.json",
        "annotation": ".codex-stack/browse/artifacts/example-visual/annotation.svg",
        "baselineScreenshot": ".codex-stack/browse/artifacts/example-visual/baseline.png",
        "currentScreenshot": ".codex-stack/browse/artifacts/example-visual/current.png"
      },
      "comparison": {
        "missingSelectors": ["h1"],
        "changedSelectors": [],
        "newSelectors": [],
        "bodyTextChanged": true,
        "titleChanged": false,
        "screenshotChanged": true
      }
    }
  },
  "flows": [
    {
      "name": "landing-smoke",
      "ok": true,
      "steps": 4
    }
  ]
}
JSON
run_ts scripts/qa-run.ts --fixture /tmp/codex-stack-qa-fixture.json --json >/tmp/codex-stack-qa.json
grep -q '"status": "critical"' /tmp/codex-stack-qa.json
grep -q '"healthScore": 36' /tmp/codex-stack-qa.json
grep -q '"annotation": ".codex-stack/qa/annotations/' /tmp/codex-stack-qa.json
rm -rf docs/qa/smoke-fixture
run_ts scripts/qa-run.ts --fixture /tmp/codex-stack-qa-fixture.json --publish-dir docs/qa/smoke-fixture --json >/tmp/codex-stack-qa-published.json
grep -q '"published"' /tmp/codex-stack-qa-published.json
test -f docs/qa/smoke-fixture/report.md
test -f docs/qa/smoke-fixture/report.json
test -f docs/qa/smoke-fixture/annotation.svg
test -f docs/qa/smoke-fixture/screenshot.png
test -f docs/qa/smoke-fixture/visual/index.html
test -f docs/qa/smoke-fixture/visual/manifest.json
run_ts scripts/render-qa-pages.ts --out .site >/tmp/codex-stack-qa-pages.log
test -f .site/index.html
test -f .site/qa/index.html
test -f .site/qa/smoke-fixture/index.html
test -f .site/qa/history.json
test -f .site/manifest.json
test -f .site/.nojekyll
grep -q 'codex-stack QA Reports' .site/index.html
grep -q 'Visual pack' .site/index.html
grep -q 'Visual history' .site/index.html
grep -q 'smoke-fixture' .site/manifest.json
grep -q 'github.io' .site/manifest.json
bun run build >/tmp/codex-stack-preview-build.log
run_ts scripts/build-preview-site.ts --out .preview-site >/tmp/codex-stack-preview-site.log
test -f .preview-site/index.html
test -f .preview-site/login/index.html
test -f .preview-site/dashboard/index.html
test -f .preview-site/changes/index.html
test -f .preview-site/.nojekyll
grep -q '\./login/' .preview-site/index.html
grep -q '\./changes/' .preview-site/index.html
grep -q '\.\./app.css' .preview-site/login/index.html
grep -q '\.\./dashboard/' .preview-site/changes/index.html
rm -rf docs/qa/smoke-fixture
rm -rf .site
rm -rf .preview-site
run_ts scripts/demo-smoke.ts >/tmp/codex-stack-demo.log
test -f /tmp/codex-stack-retros/latest.md
test -f /tmp/codex-stack-retros/latest.json
test -f /tmp/codex-stack-weekly.md
test -f /tmp/codex-stack-weekly.json
test -f /tmp/codex-stack-weekly-publish/summary.txt
test -f /tmp/codex-stack-weekly-publish/slack.md
test -f /tmp/codex-stack-weekly-publish/slack.json
test -f /tmp/codex-stack-weekly-publish/email.md
test -f /tmp/codex-stack-weekly-publish/manifest.json
test -f .codex-stack/qa/latest.md
test -f .codex-stack/qa/latest.json
test -f .codex-stack/qa/trends.md
test -f .codex-stack/qa/trends.json
test -n "$(find .codex-stack/qa/annotations -name '*.svg' -print -quit)"

git -C "$TMP_REPO" init -b main >/tmp/codex-stack-temp-git-init.log
git -C "$TMP_REPO" config user.email "smoke@example.com"
git -C "$TMP_REPO" config user.name "Smoke Test"
git -C "$TMP_REPO" remote add origin https://github.com/anup4khandelwal/codex-stack.git
cat > "$TMP_REPO/package.json" <<'JSON'
{
  "name": "ship-smoke",
  "private": true,
  "scripts": {
    "smoke": "echo ok"
  }
}
JSON
mkdir -p "$TMP_REPO/.github"
cat > "$TMP_REPO/.github/CODEOWNERS" <<'CODEOWNERS'
README.md @docs-owner @acme/docs-team
CODEOWNERS
echo "base" > "$TMP_REPO/README.md"
git -C "$TMP_REPO" add package.json README.md .github/CODEOWNERS
git -C "$TMP_REPO" commit -m "chore: baseline" >/tmp/codex-stack-temp-git-commit.log
(
  cd "$TMP_REPO" &&
  bun "$ROOT_DIR/scripts/issue-flow.ts" branch 42 --title "Sample issue workflow" --prefix feat --base main --json >/tmp/codex-stack-issue.json
)
grep -q '"branch": "feat/42-sample-issue-workflow"' /tmp/codex-stack-issue.json
grep -q '"baseRef": "main"' /tmp/codex-stack-issue.json
git -C "$TMP_REPO" switch main >/tmp/codex-stack-temp-git-back-main.log
git -C "$TMP_REPO" checkout -b feat/generated-pr >/tmp/codex-stack-temp-git-branch.log
echo "feature" >> "$TMP_REPO/README.md"
(cd "$TMP_REPO" && bun "$ROOT_DIR/scripts/ship-branch.ts" --dry-run --base main --pr --assign-self --assignee release-bot --project "Engineering Roadmap" --verify-url https://example.com --verify-path /dashboard --verify-device mobile --verify-console-errors --verify-flow landing-smoke --verify-snapshot landing-home --json >/tmp/codex-stack-ship.json)
grep -q '"title"' /tmp/codex-stack-ship.json
grep -q '"bodySource"' /tmp/codex-stack-ship.json
grep -q '"autoReviewerSource": ".github/CODEOWNERS"' /tmp/codex-stack-ship.json
grep -q '"docs-owner"' /tmp/codex-stack-ship.json
grep -q '"feature"' /tmp/codex-stack-ship.json
grep -q '"assignees"' /tmp/codex-stack-ship.json
grep -q '"release-bot"' /tmp/codex-stack-ship.json
grep -q '"Engineering Roadmap"' /tmp/codex-stack-ship.json
grep -q '"verifyUrl": "https://example.com"' /tmp/codex-stack-ship.json || grep -q '"url": "https://example.com"' /tmp/codex-stack-ship.json
grep -Fq '"paths": [' /tmp/codex-stack-ship.json
grep -q '"/dashboard"' /tmp/codex-stack-ship.json
grep -Fq '"devices": [' /tmp/codex-stack-ship.json
grep -q '"mobile"' /tmp/codex-stack-ship.json
grep -q '"landing-smoke"' /tmp/codex-stack-ship.json
grep -q '"landing-home"' /tmp/codex-stack-ship.json
grep -q 'plan deploy verification comment' /tmp/codex-stack-ship.json
grep -q 'docs/qa/feat-generated-pr/deploy' /tmp/codex-stack-ship.json
grep -q 'github.io/codex-stack/qa/feat-generated-pr/deploy/' /tmp/codex-stack-ship.json
grep -q 'Closes #42' /tmp/codex-stack-ship.json || true

cat > /tmp/codex-stack-review-fixture.json <<'JSON'
{
  "status": "ok",
  "branch": "feat/42-sample-issue-workflow",
  "baseRef": "origin/main",
  "fileNames": ["README.md", "src/app.ts"],
  "findings": [
    {
      "severity": "critical",
      "title": "Sensitive paths changed without tests",
      "detail": "Security-sensitive files changed without tests.",
      "files": ["src/app.ts"]
    },
    {
      "severity": "warning",
      "title": "Large review surface",
      "detail": "The diff is too large.",
      "files": ["README.md"]
    }
  ]
}
JSON
run_ts scripts/render-pr-review.ts --input /tmp/codex-stack-review-fixture.json --markdown-out /tmp/codex-stack-review.md --summary-out /tmp/codex-stack-review-summary.json
grep -q 'codex-stack PR review' /tmp/codex-stack-review.md
grep -q '"criticalCount": 1' /tmp/codex-stack-review-summary.json

echo "[6/8] demo files present"
test -f examples/customer-portal-demo/README.md
test -f examples/customer-portal-demo/server.ts
test -f examples/customer-portal-demo/src/app.ts
test -f examples/customer-portal-demo/public/app.js
test -f examples/customer-portal-demo/public/changes.html
test -f browse/flows/release-login.json
test -f browse/flows/release-dashboard.json
test -f browse/flows/release-changes.json
test -f browse/flows/release-full-demo.json
test -f browse/flows/portal-login.json
test -f browse/flows/portal-dashboard.json
test -f browse/flows/portal-full-demo.json

echo "[7/8] docs present"
test -f README.md
test -f docs/install.md
test -f docs/commands.md
test -f docs/examples.md
test -f skills/review/checklist.md
test -f .github/PULL_REQUEST_TEMPLATE.md
test -f .github/workflows/pr-review.yml
test -f .github/workflows/pr-automerge.yml
test -f .github/workflows/daily-update-check.yml
test -f .github/workflows/preview-verify.yml
test -f .github/workflows/preview-cleanup.yml
test -f .github/ISSUE_TEMPLATE/work-item.yml
test -f scripts/issue-flow.ts
test -f scripts/issue-flow.spec.ts
test -f scripts/preview-verify.ts
test -f scripts/preview-verify.spec.ts
test -f scripts/cleanup-preview-site.ts
test -f scripts/cleanup-preview-site.spec.ts
test -f scripts/preview-workflow-auth.spec.ts
test -f scripts/build-preview-site.ts
test -f scripts/build-preview-site.spec.ts
test -f scripts/upgrade-check.ts
test -f scripts/upgrade-check.spec.ts
test -f scripts/render-pr-review.ts
test -f .github/workflows/qa-pages.yml
test -f scripts/render-qa-pages.ts
test -f skills/preview/SKILL.md
test -f skills/setup-browser-cookies/SKILL.md
test -f skills/upgrade/SKILL.md
grep -q 'clean-exclude: pr-preview' .github/workflows/qa-pages.yml
grep -q 'force: true' .github/workflows/qa-pages.yml
grep -q 'CODEX_STACK_PREVIEW_SESSION_BUNDLE_B64' .github/workflows/pr-review.yml
grep -q 'CODEX_STACK_PREVIEW_SESSION_BUNDLE_B64' .github/workflows/preview-verify.yml

echo "[8/8] cleanup"
rm -rf .site

echo "CI checks passed."
