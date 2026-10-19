#!/usr/bin/env bash
# Start the dev server in DEMO MODE, on the project's pinned Node.
#
# Same as scripts/dev.sh with the demo switch on, for checking the public
# demo's banner, sample notes and safety catch on the laptop before any of it
# is deployed.
#
# Pointed at the REAL database (the usual .env.local), this should refuse to
# render anything and show "This demo is not connected to the demo database."
# That refusal is the feature — it is what stops the public, password-free,
# self-wiping deployment ever serving real data. Seeing the dashboard here
# instead would mean the safety catch is broken.
set -euo pipefail
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use >/dev/null   # reads .nvmrc
fi
export NEXT_PUBLIC_DEMO_MODE=1
exec npm run dev
