#!/usr/bin/env bash
# Start the dev server on the project's pinned Node.
#
# Tools that spawn a non-interactive shell never source ~/.bashrc, so they see
# the system Node 18 rather than the nvm-managed 22 this project needs. This
# loads nvm explicitly first.
set -euo pipefail
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck disable=SC1091
  . "$NVM_DIR/nvm.sh"
  nvm use >/dev/null   # reads .nvmrc
fi
exec npm run dev
