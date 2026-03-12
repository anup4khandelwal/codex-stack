#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN_DIR="${1:-$HOME/.local/bin}"

mkdir -p "$BIN_DIR"
ln -snf "$ROOT_DIR/dist/cli.js" "$BIN_DIR/codex-stack"
ln -snf "$ROOT_DIR/browse/dist/cli.js" "$BIN_DIR/codex-stack-browse"

echo "linked CLI wrappers into $BIN_DIR"
echo "ensure $BIN_DIR is on your PATH"
