#!/usr/bin/env bash
# Bootstrap TelcoCXOS: check Coxswain, doctor, ensure telco-core + seed operate.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export COXSWAIN_ROOT="${COXSWAIN_ROOT:-$HOME/coxswain}"

if [[ ! -f "$COXSWAIN_ROOT/package.json" ]]; then
  echo "ERROR: Coxswain not found at $COXSWAIN_ROOT" >&2
  echo "  git clone git@github.com:chendren/coxswain.git ~/coxswain && cd ~/coxswain && pnpm install" >&2
  exit 1
fi

cd "$ROOT"
echo "COXSWAIN_ROOT=$COXSWAIN_ROOT"
echo "WORKSPACE=$ROOT"

node ./scripts/cox.mjs cx doctor
if ! node ./scripts/cox.mjs cx list 2>/dev/null | grep -q telco-core; then
  echo "creating telco-core…"
  node ./scripts/cox.mjs cx run telco-core \
    "Typical telco mobile and broadband CX: billing disputes, network outages, plan upgrades, new line activation, and churn save" \
    --target all
else
  echo "telco-core present"
  node ./scripts/cox.mjs cx build telco-core --target all || true
fi
node ./scripts/cox.mjs cx seed-operate telco-core || true
node ./scripts/cox.mjs cx queue
node ./scripts/cox.mjs cx status telco-core
echo "OK bootstrap complete"
echo "next: pnpm cox cx claim telco-core <propId> --actor you@org"
