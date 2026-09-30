#!/usr/bin/env bash
# push_artifact.sh - ARTIFACT-PUSH-CONFLICT-1 (2026-09-30): commit + push CI status/audit artifacts to main
# without ever entering a merge/rebase conflict.
#
# The common pattern `git pull --rebase --autostash origin main && git push` CONFLICTS whenever a concurrent
# run already pushed a newer copy of the same artifact file (measured: fleet-autodeploy run 36752410754,
# canonical-deploy run 36760796833). A status artifact is a SNAPSHOT -- latest wins, it is never merged -- so
# on rejection this re-bases BY CONSTRUCTION: save this run's copies, hard-reset to origin/main, restore the
# copies, recommit. A content conflict is impossible in that sequence.
#
# usage: scripts/push_artifact.sh "<commit message>" <path> [<path> ...]
# exit:  0 pushed / nothing to push; 1 push still rejected after all attempts.
set -uo pipefail
msg="$1"; shift
[ "$#" -ge 1 ] || { echo "usage: push_artifact.sh <message> <path>..."; exit 2; }
snap="$(mktemp -d)"
for p in "$@"; do
  [ -e "$p" ] || continue
  mkdir -p "$snap/$(dirname "$p")"
  cp -a "$p" "$snap/$p"
done
restore_and_commit() {
  for p in "$@"; do
    [ -e "$snap/$p" ] || continue
    mkdir -p "$(dirname "$p")"
    cp -a "$snap/$p" "$p"
    git add -- "$p"
  done
  if git diff --cached --quiet; then return 1; fi
  git commit -q -m "$msg"
}
git add -- "$@" 2>/dev/null || true
if git diff --cached --quiet; then echo "artifact unchanged - nothing to push"; exit 0; fi
git commit -q -m "$msg"
for i in 1 2 3 4 5 6; do
  if git push -q origin HEAD:main; then echo "artifact pushed on attempt $i"; exit 0; fi
  echo "push rejected on attempt $i; re-applying the snapshot onto origin/main"
  sleep $((i * 3))
  git rebase --abort >/dev/null 2>&1 || true
  git fetch -q origin main && git reset -q --hard origin/main
  if ! restore_and_commit "$@"; then echo "origin/main already carries an identical artifact - nothing to push"; exit 0; fi
done
echo "::warning::artifact push still rejected after 6 attempts (concurrent writers)"
exit 1
