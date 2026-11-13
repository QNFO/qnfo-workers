#!/usr/bin/env bash
# jobs_agent_sync.sh - JOBS-AGENT-SYNC-1 (2026-11-13, rwnq8/jobs-agent issue 1).
#
# rwnq8/jobs-agent is the source of the qnfo-jobsearch worker (jobs.q08.org). The canonical deploy still runs from this
# repository's qnfo-jobsearch/ directory, so this script keeps the two identical in both directions without a person:
#
#   reverse  (push to main that changed qnfo-jobsearch/ and is not itself a sync): the commit's diff of qnfo-jobsearch/ is
#            replayed onto rwnq8/jobs-agent worker/ with a three-way apply, as a pull request there that this script merges.
#            The code loop and sessions that still edit qnfo-jobsearch/ here therefore never lose work and never drift.
#   forward  (every run): rwnq8/jobs-agent worker/ is mirrored into qnfo-jobsearch/ and its new migrations into migrations/
#            (an existing migration is never overwritten, MIGRATION-NO-CLOBBER-1), and the change lands as a pull request here
#            that the lane merges; canonical-deploy.yml then deploys it. Skipped while a reverse pull request is still open on
#            jobs-agent, so a mirror never erases a change that has not reached the source yet.
#
# usage: scripts/jobs_agent_sync.sh <jobs-agent checkout> [before-sha after-sha]
# env:   JA_TOKEN  token that may push to rwnq8/jobs-agent (reverse only); GH_TOKEN  token for the pull request here.
set -euo pipefail
JA="${1:?jobs-agent checkout}"; BEFORE="${2:-}"; AFTER="${3:-}"
JA_REPO="rwnq8/jobs-agent"
DIR="qnfo-jobsearch"
api() { curl -sS -H "Authorization: Bearer ${JA_TOKEN:-}" -H "Accept: application/vnd.github+json" "$@"; }

# ---- reverse
if [ -n "$BEFORE" ] && [ -n "$AFTER" ] && [ "$BEFORE" != "0000000000000000000000000000000000000000" ]; then
  subject="$(git log -1 --format=%s "$AFTER")"
  case "$subject" in
    "jobs-agent sync "*) echo "reverse: $AFTER is a forward sync; nothing to replay" ;;
    *)
      git diff --binary "$BEFORE" "$AFTER" -- "$DIR/" | sed -e "s#^\(diff --git a/\)$DIR/#\1worker/#" -e "s#\( b/\)$DIR/#\1worker/#" \
        -e "s#^--- a/$DIR/#--- a/worker/#" -e "s#^+++ b/$DIR/#+++ b/worker/#" \
        -e "s#^rename from $DIR/#rename from worker/#" -e "s#^rename to $DIR/#rename to worker/#" > /tmp/ja-reverse.patch
      if [ ! -s /tmp/ja-reverse.patch ]; then
        echo "reverse: $AFTER does not change $DIR/"
      elif (cd "$JA" && git apply --reverse --check /tmp/ja-reverse.patch 2>/dev/null); then
        echo "reverse: jobs-agent already holds $AFTER's change"
      else
        [ -n "${JA_TOKEN:-}" ] || { echo "::error::reverse sync needs JA_TOKEN to push to $JA_REPO"; exit 1; }
        br="qnfo-workers-sync/${AFTER:0:12}"
        (
          cd "$JA"
          git config user.name "qnfo-jobs-sync"; git config user.email "ops@qnfo.org"
          git checkout -q -B "$br" origin/main
          git apply --3way /tmp/ja-reverse.patch
          git add -A worker
          git commit -q -m "qnfo-workers sync ${AFTER:0:12}: $subject" -m "Replayed from QNFO/qnfo-workers $AFTER by scripts/jobs_agent_sync.sh (JOBS-AGENT-SYNC-1)."
          git push -q -f origin "HEAD:refs/heads/$br"
        )
        body=$(jq -n --arg t "qnfo-workers sync ${AFTER:0:12}: $subject" --arg h "$br" \
          --arg b "QNFO/qnfo-workers $AFTER changed qnfo-jobsearch/; JOBS-AGENT-SYNC-1 replays it here so the source keeps every change." \
          '{title:$t, head:$h, base:"main", body:$b}')
        num=$(api -X POST "https://api.github.com/repos/$JA_REPO/pulls" -d "$body" | jq -r '.number // empty')
        [ -n "$num" ] || num=$(api "https://api.github.com/repos/$JA_REPO/pulls?head=rwnq8:$br&state=open" | jq -r '.[0].number // empty')
        [ -n "$num" ] || { echo "::error::could not open the reverse pull request on $JA_REPO"; exit 1; }
        res=$(api -X PUT "https://api.github.com/repos/$JA_REPO/pulls/$num/merge" -d '{"merge_method":"squash"}')
        echo "reverse: $JA_REPO#$num merge -> $(echo "$res" | jq -c '{merged, message}')"
        [ "$(echo "$res" | jq -r '.merged')" = "true" ] || { echo "::error::reverse pull request $JA_REPO#$num did not merge"; exit 1; }
        api -X DELETE "https://api.github.com/repos/$JA_REPO/git/refs/heads/$br" >/dev/null || true
        (cd "$JA" && git fetch -q origin main && git checkout -q origin/main)
      fi
      ;;
  esac
fi

# ---- forward
open_rev=$(curl -sS "https://api.github.com/repos/$JA_REPO/pulls?state=open&per_page=100" | jq '[.[] | select(.head.ref | startswith("qnfo-workers-sync/"))] | length')
if [ "${open_rev:-0}" != "0" ]; then
  echo "::warning::forward: $open_rev reverse pull request(s) still open on $JA_REPO; the next run mirrors after they merge"
  exit 0
fi
src_sha=$(cd "$JA" && git rev-parse HEAD)
rsync -a --delete --exclude SOURCE "$JA/worker/" "$DIR/"
printf 'rwnq8/jobs-agent worker/ %s\n' "$src_sha" > "$DIR/SOURCE.next"
new_migs=()
for f in "$JA"/migrations/*; do
  b=$(basename "$f"); [ -e "migrations/$b" ] || { cp "$f" "migrations/$b"; new_migs+=("$b"); }
done
if git diff --quiet -- "$DIR" && [ -z "$(git ls-files --others --exclude-standard -- "$DIR" migrations | grep -v SOURCE.next)" ]; then
  rm -f "$DIR/SOURCE.next"; echo "forward: qnfo-jobsearch/ already equals $JA_REPO@${src_sha:0:12}"; exit 0
fi
mv "$DIR/SOURCE.next" "$DIR/SOURCE"
git config user.name "qnfo-jobs-sync"; git config user.email "ops@qnfo.org"
git add -A -- "$DIR" migrations
git commit -q -m "jobs-agent sync ${src_sha:0:12}" -m "JOBS-AGENT-SYNC-1: qnfo-jobsearch/ mirrored from $JA_REPO worker/ at $src_sha; new migrations: ${new_migs[*]:-none}."
git show --stat HEAD | tail -20
bash scripts/push_head.sh code jobs-agent-sync/main "jobs-agent sync ${src_sha:0:12}"
