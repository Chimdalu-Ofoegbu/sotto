#!/usr/bin/env bash
# Start the Sotto LocalNet — `dpm sandbox` = Canton (single participant + sync
# domain) + JSON Ledger API — fully detached, and wait until it is ready.
set -e
source "$HOME/.sotto-env.sh" 2>/dev/null || true
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DAR="$ROOT/daml/.daml/dist/sotto-0.1.0.dar"

[ -f "$DAR" ] || (echo "building DAR..."; cd "$ROOT/daml" && dpm build)

if curl -sf http://localhost:7575/readyz >/dev/null 2>&1; then
  echo "sandbox already running on :7575"; exit 0
fi

rm -f "$HOME/sotto-sandbox.log" "$HOME/sotto-ports.json"
setsid nohup dpm sandbox \
  --dar "$DAR" \
  --json-api-port 7575 --ledger-api-port 6865 --admin-api-port 6866 \
  --canton-port-file "$HOME/sotto-ports.json" \
  > "$HOME/sotto-sandbox.log" 2>&1 < /dev/null &
echo "sandbox starting (pid $!); waiting for JSON API on :7575 ..."
for i in $(seq 1 90); do
  curl -sf http://localhost:7575/readyz >/dev/null 2>&1 && { echo "sandbox ready"; exit 0; }
  sleep 2
done
echo "ERROR: timed out waiting for sandbox"; tail -20 "$HOME/sotto-sandbox.log"; exit 1
