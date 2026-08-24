#!/usr/bin/env bash
# Blindagem anti-regressão — Dashboard Correção
# Uso: bash scripts/check-regressao.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "== vitest (DROP / PII display) =="
npx vitest run src/lib/evaDash.drop.test.ts --reporter=dot

echo "== build =="
npm run build

echo "OK: guards + build"
