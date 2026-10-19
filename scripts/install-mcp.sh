#!/usr/bin/env bash
#
# Add the `lanework` MCP server to the Claude desktop app's config.
#
# ── Why this is a script you run yourself ───────────────────────────────────
# The Claude app owns claude_desktop_config.json and writes its own in-memory
# copy back to disk from time to time — it keeps sidebar state and preferences
# in the same file. That copy is whatever it read at startup, so an edit made
# while the app is running is silently erased the next time it saves. That is
# exactly what happened on 2026-10-06: the entry was written at 15:38, verified
# on disk, and gone by 22:40 with only the app's own `epitaxyPrefs` changed.
#
# So this has to run while the app is completely quit. Claude Code runs inside
# the app, which is why it cannot do this for you.
#
#   1. Quit Claude completely (Cmd-Q, not just closing the window)
#   2. In the macOS Terminal app:  ~/recruiting-dashboard/scripts/install-mcp.sh
#   3. Open Claude again
#
# Safe to run twice: it replaces the entry rather than adding a second one, and
# it backs the file up and refuses to write anything that is not valid JSON.
set -euo pipefail

CFG="$HOME/Library/Application Support/Claude/claude_desktop_config.json"
PROJECT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Matches the whole bundle, not a process name. `pgrep -x Claude` looks right
# and silently matches nothing: the main process reports a name pgrep -x does
# not match, so the guard passed while the app was wide open. Matching the
# bundle path catches the main process and all ten-odd helpers.
if pgrep -f "Claude.app" >/dev/null 2>&1; then
  echo "Claude is still running."
  echo
  echo "Quit it completely first — Cmd-Q, or Claude → Quit Claude. Closing the"
  echo "window is not enough. The app rewrites this file from its own memory"
  echo "when it saves, which would erase what this script writes."
  exit 1
fi

if [ ! -f "$CFG" ]; then
  echo "No config file at:"
  echo "  $CFG"
  echo
  echo "Open Claude once, go to Settings → Developer, and press 'Edit config'"
  echo "to create it. Then quit Claude and run this again."
  exit 1
fi

BACKUP="$CFG.backup-$(date +%Y%m%d-%H%M%S)"
cp "$CFG" "$BACKUP"
echo "Backed up to: $(basename "$BACKUP")"

CFG="$CFG" PROJECT="$PROJECT" python3 <<'PY'
import collections, json, os, sys

path = os.environ["CFG"]
project = os.environ["PROJECT"]

with open(path) as f:
    cfg = json.load(f, object_pairs_hook=collections.OrderedDict)

before = list(cfg.get("mcpServers", {}))

cfg.setdefault("mcpServers", collections.OrderedDict())
# bash, not npm. The app launches this from the GUI, which has a bare PATH —
# no nvm, so no node and no npm. scripts/mcp.sh loads nvm first; /bin/bash is
# always there.
cfg["mcpServers"]["lanework"] = collections.OrderedDict([
    ("command", "/bin/bash"),
    ("args", [os.path.join(project, "scripts", "mcp.sh")]),
])

text = json.dumps(cfg, indent=2) + "\n"

# Parse what is about to be written, not what was meant to be written. A
# malformed file costs every preference in it, not just the MCP servers.
json.loads(text)

with open(path, "w") as f:
    f.write(text)

print(f"  servers before: {before or '(none)'}")
print(f"  servers now:    {list(cfg['mcpServers'])}")
print(f"  runs:           {project}/scripts/mcp.sh")
PY

echo
echo "Done. Open Claude and look under Settings → Developer — 'lanework'"
echo "should be listed as Running, with 10 tools available in a new chat."
echo
echo "If it says Failed, press 'View logs' there; the most likely causes are"
echo "the wrong folder above, or .env.local missing from it."
