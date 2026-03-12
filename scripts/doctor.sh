#!/usr/bin/env bash
set -euo pipefail

echo "[doctor] node: $(node -v)"
echo "[doctor] npm: $(npm -v)"

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

if command -v playwright >/dev/null 2>&1; then
  echo "[doctor] playwright: installed"
else
  echo "[doctor] playwright: not on PATH (browse runtime is scaffold-only right now)"
fi
