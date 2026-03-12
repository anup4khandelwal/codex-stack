#!/usr/bin/env bash
set -euo pipefail

echo "[1/5] root CLI list"
node dist/cli.js list >/tmp/codex-stack-list.log

echo "[2/5] root CLI show/path"
node dist/cli.js show review >/tmp/codex-stack-show.log
node dist/cli.js path review >/tmp/codex-stack-path.log

echo "[3/5] doctor checks"
node dist/cli.js doctor >/tmp/codex-stack-doctor.log
node browse/dist/cli.js doctor >/tmp/codex-stack-browse-doctor.log

echo "[4/5] review script interface"
node scripts/review-diff.mjs --help >/tmp/codex-stack-review-help.log

echo "[5/5] docs present"
test -f README.md
test -f docs/install.md
test -f docs/commands.md
test -f docs/examples.md
test -f skills/review/checklist.md

echo "CI checks passed."
