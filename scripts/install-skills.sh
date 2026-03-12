#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SKILL_SOURCE_DIR="$ROOT_DIR/skills"
MODE="${1:-user}"
PROJECT_TARGET="${2:-}"

case "$MODE" in
  user)
    TARGET_ROOT="${HOME}/.codex/skills"
    ;;
  project)
    if [ -z "$PROJECT_TARGET" ]; then
      echo "Usage: bash scripts/install-skills.sh project /path/to/repo" >&2
      exit 1
    fi
    TARGET_ROOT="${PROJECT_TARGET}/.codex/skills"
    ;;
  *)
    echo "Usage: bash scripts/install-skills.sh [user|project] [project-path]" >&2
    exit 1
    ;;
esac

mkdir -p "$TARGET_ROOT"

for skill_dir in "$SKILL_SOURCE_DIR"/*; do
  [ -d "$skill_dir" ] || continue
  skill_name="$(basename "$skill_dir")"
  target="$TARGET_ROOT/codex-stack-$skill_name"
  ln -snf "$skill_dir" "$target"
  echo "linked $target -> $skill_dir"
done

echo "codex-stack skills installed to $TARGET_ROOT"
