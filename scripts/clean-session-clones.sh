#!/usr/bin/env bash
# CLONE-CLEANUP-1 (issue 9669): remove session clones under a root only when clean and HEAD is on the remote.
# usage: clean-session-clones.sh <root> [--dry-run]; one line per clone: removed|kept-dirty|kept-unpushed|skip.
root="${1:?root}"; dry="$2"
for d in "$root"/*/; do
  d="${d%/}"
  [ -d "$d/.git" ] || { echo "skip $d"; continue; }
  if [ -n "$(git -C "$d" status --porcelain 2>/dev/null)" ]; then echo "kept-dirty $d"; continue; fi
  sha=$(git -C "$d" rev-parse HEAD 2>/dev/null)
  if git -C "$d" ls-remote origin 2>/dev/null | cut -f1 | grep -qx "$sha"; then
    [ "$dry" = "--dry-run" ] || rm -rf "$d"
    echo "removed $d"
  else echo "kept-unpushed $d"; fi
done
