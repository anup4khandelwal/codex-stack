#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="${1:-$HOME/.local/bin}"
LOCAL_BIN_DIR="$ROOT_DIR/.codex-stack/bin"

mkdir -p "$BIN_DIR"

if [ ! -d "$LOCAL_BIN_DIR" ]; then
  echo "local wrappers are missing; run ./setup first" >&2
  exit 1
fi

for wrapper in "$LOCAL_BIN_DIR"/*; do
  [ -f "$wrapper" ] || continue
  ln -snf "$wrapper" "$BIN_DIR/$(basename "$wrapper")"
done

echo "linked CLI wrappers into $BIN_DIR from $LOCAL_BIN_DIR"
echo "ensure $BIN_DIR is on your PATH"
