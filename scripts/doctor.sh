#!/usr/bin/env bash
set -euo pipefail

echo "[doctor] node: $(node -v)"
echo "[doctor] npm: $(npm -v)"

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 24 ]; then
  echo "[doctor] node support: expected Node 24+, current runtime is below target"
else
  echo "[doctor] node support: ok (Node 24+)"
fi

if command -v git >/dev/null 2>&1; then
  echo "[doctor] git: $(git --version)"
else
  echo "[doctor] git: missing"
fi

if command -v gh >/dev/null 2>&1; then
  echo "[doctor] gh: installed"
else
  echo "[doctor] gh: missing"
fi

if command -v tsc >/dev/null 2>&1; then
  echo "[doctor] tsc: $(tsc -v)"
else
  echo "[doctor] tsc: missing (checked-in dist is still usable)"
fi

if [ -d "node_modules/playwright" ] || [ -d "$(cd "$(dirname "$0")/.." && pwd)/node_modules/playwright" ]; then
  echo "[doctor] playwright package: installed"
else
  echo "[doctor] playwright package: missing"
fi
