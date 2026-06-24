#!/usr/bin/env bash
# Reproducible end-to-end Sotto demo: ensure the DAR is built and the sandbox is
# up, then run the JSON-Ledger-API flow that re-asserts INV-1 / INV-2 / INV-4.
set -e
source "$HOME/.sotto-env.sh" 2>/dev/null || true
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
bash "$ROOT/scripts/sandbox.sh"
node "$ROOT/backend/demo.mjs"
