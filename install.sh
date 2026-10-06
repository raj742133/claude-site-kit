#!/usr/bin/env bash
# Installs the Sitewright skill for Claude Code.
#
#   ./install.sh              personal install  -> ~/.claude/skills/sitewright   (every project)
#   ./install.sh --project    project install   -> ./.claude/skills/sitewright   (this folder only; commit it to share with a team)
#   ./install.sh --dir <path> install into <path>/sitewright
#
# It copies files; it does not run npm, touch your settings, or send anything anywhere.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$HERE/skill/sitewright"
[ -f "$SRC/SKILL.md" ] || { echo "sitewright: cannot find $SRC/SKILL.md - run this from a full clone of the repository." >&2; exit 1; }

case "${1:-}" in
  --project) BASE="$PWD/.claude/skills" ;;
  --dir)     [ -n "${2:-}" ] || { echo "sitewright: --dir needs a path" >&2; exit 1; }; BASE="$2" ;;
  "")        BASE="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/skills" ;;
  *)         echo "usage: ./install.sh [--project | --dir <path>]" >&2; exit 1 ;;
esac

DEST="$BASE/sitewright"
if [ -e "$DEST" ]; then
  echo "sitewright: $DEST already exists - replacing it with this version."
  rm -rf "$DEST"
fi
mkdir -p "$BASE"
cp -R "$SRC" "$DEST"

echo "sitewright: installed to $DEST"
echo
echo "Next:"
echo "  1. Start a new Claude Code session (skills are read when a session starts)."
echo "  2. Ask:  \"Use Sitewright to make a landing page and a dashboard for my business\""
echo "     or type  /sitewright"
echo "  3. For the browser tests it runs, you need Node 20+ and:  npm i playwright && npx playwright install chromium"
