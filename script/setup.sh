#!/usr/bin/env sh
set -eu

ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"
cd "$ROOT_DIR"

echo "[setup] Instalando dependencias..."
npm install

if [ "${1-}" = "--migrate" ]; then
  npm run setup -- --migrate
else
  npm run setup
fi
