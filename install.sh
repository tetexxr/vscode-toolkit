#!/usr/bin/env bash
set -euo pipefail

# Packages this extension with vsce and reinstalls it into VS Code:
# uninstalls the currently installed build, produces a fresh .vsix and
# installs the most recent .vsix found in the repository root.
#
# Usage:
#   ./install.sh

EXTENSION_ID="tete.vscode-toolkit"

on='\033[37;1m'
off='\033[0m'
step() { echo -e "${on}==> $*${off}"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

NAME=$(sed -n 's|.*"name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*|\1|p' package.json | head -1)
VERSION=$(sed -n 's|.*"version"[[:space:]]*:[[:space:]]*"\([^"]*\)".*|\1|p' package.json | head -1)

step "Uninstalling $EXTENSION_ID"
code --uninstall-extension "$EXTENSION_ID" || true

step "Packaging $NAME@$VERSION"
npx --yes vsce package --allow-missing-repository --skip-license

# Pick the most recently modified .vsix in the repo root (the one we just built).
# Portable across GNU/BSD: stat the mtime epoch of each .vsix and keep the newest.
VSIX=""
NEWEST=0
for f in "$REPO_ROOT"/*.vsix; do
    [ -e "$f" ] || continue
    mtime=$(stat -f '%m' "$f" 2>/dev/null || stat -c '%Y' "$f" 2>/dev/null)
    if [ "$mtime" -gt "$NEWEST" ]; then
        NEWEST=$mtime
        VSIX=$f
    fi
done

if [ -z "$VSIX" ]; then
    echo "No .vsix found in $REPO_ROOT" >&2
    exit 1
fi

# .vsix modification time, shown in the box below (portable: GNU `date -r FILE`,
# falling back to BSD/macOS `stat -f`).
VSIX_DATE=$(date -r "$VSIX" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || stat -f '%Sm' -t '%Y-%m-%d %H:%M:%S' "$VSIX" 2>/dev/null)

echo
echo -e "${on}┌─────────────────────────────────────────────────────┐${off}"
echo -e "${on}│  INSTALL${off}"
echo -e "${on}├─────────────────────────────────────────────────────┤${off}"
echo -e "${on}│${off}  Extension : $EXTENSION_ID"
echo -e "${on}│${off}  Version   : $VERSION"
echo -e "${on}│${off}  Artifact  : $(basename "$VSIX")"
echo -e "${on}│${off}  Created   : $VSIX_DATE"
echo -e "${on}└─────────────────────────────────────────────────────┘${off}"
echo

step "Installing $(basename "$VSIX")"
code --install-extension "$VSIX"

echo
echo -e "${on}Done.${off} $(basename "$VSIX") installed. Reload VS Code to pick it up."
