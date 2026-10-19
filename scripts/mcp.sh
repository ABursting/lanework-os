#!/usr/bin/env bash
# Start the MCP server on the project's pinned Node.
#
# This exists for the same reason scripts/dev.sh does, but the failure it
# prevents is worse. The Claude app launches this from the macOS GUI, which
# does not read ~/.bashrc or ~/.zshrc and so has a bare PATH — no nvm, and
# therefore no `node` and no `npm` at all. Pointing the app's config straight
# at `npm` gives "command not found" and a server stuck on Failed, with
# nothing in the logs that names PATH as the cause.
#
# Loading nvm here keeps the version pinned in .nvmrc rather than hardcoding a
# path like .nvm/versions/node/v22.23.2/bin/npm into the app's config, which
# would break silently the next time Node is upgraded.
#
# stdout is the protocol — every diagnostic here goes to stderr.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use >/dev/null 2>&1 || true   # reads .nvmrc
fi

if ! command -v node >/dev/null 2>&1; then
  echo "[mcp] No node on PATH, and nvm was not found at $NVM_DIR." >&2
  echo "[mcp] The Claude app starts this without your shell's PATH, so nvm has" >&2
  echo "[mcp] to be loaded here. Check that $NVM_DIR/nvm.sh exists." >&2
  exit 1
fi

exec npm run --silent mcp
