#!/usr/bin/env bash
set -euo pipefail

if command -v bun >/dev/null 2>&1; then
  BUN_VERSION="$(bun --version)"
  echo "[doctor] bun: $BUN_VERSION"
  BUN_MAJOR="$(printf '%s' "$BUN_VERSION" | cut -d. -f1)"
  BUN_MINOR="$(printf '%s' "$BUN_VERSION" | cut -d. -f2)"
  if [ "$BUN_MAJOR" -lt 1 ] || { [ "$BUN_MAJOR" -eq 1 ] && [ "${BUN_MINOR:-0}" -lt 2 ]; }; then
    echo "[doctor] bun support: expected Bun 1.2+, current runtime is below target"
  else
    echo "[doctor] bun support: ok (Bun 1.2+ target)"
  fi
else
  echo "[doctor] bun: missing"
fi

if command -v node >/dev/null 2>&1; then
  echo "[doctor] node fallback: $(node -v)"
else
  echo "[doctor] node fallback: missing"
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
