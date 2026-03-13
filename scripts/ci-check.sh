#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(pwd)"
TMP_REPO="$(mktemp -d)"
trap 'rm -rf "$TMP_REPO"' EXIT

echo "[1/7] root CLI list"
node dist/cli.js list >/tmp/codex-stack-list.log

echo "[2/7] root CLI show/path"
node dist/cli.js show review >/tmp/codex-stack-show.log
node dist/cli.js path review >/tmp/codex-stack-path.log

echo "[3/7] doctor checks"
node dist/cli.js doctor >/tmp/codex-stack-doctor.log
node browse/dist/cli.js doctor >/tmp/codex-stack-browse-doctor.log

echo "[4/7] browse flow registry"
node browse/dist/cli.js save-flow smoke '[{"action":"wait","ms":1},{"action":"assert-url","value":"example.com"}]' >/tmp/codex-stack-flow-save.log
node browse/dist/cli.js show-flow smoke >/tmp/codex-stack-flow-show.log
node browse/dist/cli.js flows >/tmp/codex-stack-flow-list.log
grep -q '"source": "repo"' /tmp/codex-stack-flow-list.log
cat > /tmp/codex-stack-flow-import.yaml <<'YAML'
- action: "wait"
  ms: 1
- action: "assert-url"
  value: "example.com"
YAML
node browse/dist/cli.js import-flow imported-smoke /tmp/codex-stack-flow-import.yaml >/tmp/codex-stack-flow-import.log
node browse/dist/cli.js export-flow imported-smoke /tmp/codex-stack-flow-export.md >/tmp/codex-stack-flow-export.log
grep -q '```yaml' /tmp/codex-stack-flow-export.md
node browse/dist/cli.js import-flow imported-smoke-md /tmp/codex-stack-flow-export.md >/tmp/codex-stack-flow-import-md.log
node browse/dist/cli.js delete-flow smoke >/tmp/codex-stack-flow-delete.log
node browse/dist/cli.js delete-flow imported-smoke >/tmp/codex-stack-flow-delete-imported.log
node browse/dist/cli.js delete-flow imported-smoke-md >/tmp/codex-stack-flow-delete-imported-md.log
bash ./setup >/tmp/codex-stack-setup.log
test -x .codex-stack/bin/review
test -x .codex-stack/bin/ship
test -x .codex-stack/bin/browse

echo "[5/7] review, ship, retro, and demo interfaces"
node scripts/review-diff.mjs --help >/tmp/codex-stack-review-help.log
node scripts/ship-branch.mjs --help >/tmp/codex-stack-ship-help.log
node scripts/retro-report.mjs --help >/tmp/codex-stack-retro-help.log
node scripts/retro-report.mjs --since "1 day ago" --artifact-dir /tmp/codex-stack-retros --no-github >/tmp/codex-stack-retro.log
node scripts/weekly-digest.mjs --since "1 day ago" --out /tmp/codex-stack-weekly.md --json-out /tmp/codex-stack-weekly.json --publish-dir /tmp/codex-stack-weekly-publish --no-github >/tmp/codex-stack-weekly.log
node scripts/demo-smoke.mjs >/tmp/codex-stack-demo.log
test -f /tmp/codex-stack-retros/latest.md
test -f /tmp/codex-stack-retros/latest.json
test -f /tmp/codex-stack-weekly.md
test -f /tmp/codex-stack-weekly.json
test -f /tmp/codex-stack-weekly-publish/summary.txt
test -f /tmp/codex-stack-weekly-publish/slack.md
test -f /tmp/codex-stack-weekly-publish/slack.json
test -f /tmp/codex-stack-weekly-publish/email.md
test -f /tmp/codex-stack-weekly-publish/manifest.json

git -C "$TMP_REPO" init -b main >/tmp/codex-stack-temp-git-init.log
git -C "$TMP_REPO" config user.email "smoke@example.com"
git -C "$TMP_REPO" config user.name "Smoke Test"
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
git -C "$TMP_REPO" checkout -b feat/generated-pr >/tmp/codex-stack-temp-git-branch.log
echo "feature" >> "$TMP_REPO/README.md"
(cd "$TMP_REPO" && node "$ROOT_DIR/scripts/ship-branch.mjs" --dry-run --base main --pr --assign-self --assignee release-bot --project "Engineering Roadmap" --json >/tmp/codex-stack-ship.json)
grep -q '"title"' /tmp/codex-stack-ship.json
grep -q '"bodySource"' /tmp/codex-stack-ship.json
grep -q '"autoReviewerSource": ".github/CODEOWNERS"' /tmp/codex-stack-ship.json
grep -q '"docs-owner"' /tmp/codex-stack-ship.json
grep -q '"feature"' /tmp/codex-stack-ship.json
grep -q '"assignees"' /tmp/codex-stack-ship.json
grep -q '"release-bot"' /tmp/codex-stack-ship.json
grep -q '"Engineering Roadmap"' /tmp/codex-stack-ship.json

echo "[6/7] demo files present"
test -f examples/customer-portal-demo/README.md
test -f examples/customer-portal-demo/server.mjs
test -f browse/flows/portal-login.json
test -f browse/flows/portal-dashboard.json
test -f browse/flows/portal-full-demo.json

echo "[7/7] docs present"
test -f README.md
test -f docs/install.md
test -f docs/commands.md
test -f docs/examples.md
test -f skills/review/checklist.md

echo "CI checks passed."
