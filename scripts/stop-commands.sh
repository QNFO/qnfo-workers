#!/usr/bin/env bash
# stop-commands.sh - ANNOTATION-FIXTURE-QUIET-1 (2026-10-20, RUNNER-PIN-ANNOTATIONS-1; agent_issues 100295).
#
# usage: bash scripts/stop-commands.sh <command> [args...]
#
# Runs the command with the Actions runner's workflow commands switched off (the documented ::stop-commands::<token> ... ::<token>::
# pair, https://docs.github.com/actions/reference/workflow-commands-for-github-actions), then switches them back on and exits with the
# command's own exit code. Use it ONLY around an offline self-test or a replay of recorded output, whose fixtures deliberately print
# `::warning::` / `::error::` / `::notice::` lines: the runner turns every such line into a real annotation on the check run, so a test
# that feeds fake lock outages or fake rate limits to the code under test leaves "SECRET-LOCK-UNAVAILABLE ... proceeding WITHOUT a lease"
# and "GitHub API rate-limited (HTTP 403)" warnings on every green run (measured 2026-10-20 on workflow-lint run 39379743326: 5, on
# fleet-autodeploy: 8, on code-task-publish: 1 notice, on windows-suite-parity: 1 error per leg), which reads as a live outage to anyone
# scanning annotations. The step still fails when the command fails (the exit code is kept), and the output stays in the log; only the
# runner's reading of it as annotations is off. Never wrap a step whose own ::error:: / ::warning:: line is the signal.
#
# The token is random per call, so output printed inside the window cannot switch commands back on early. The resume line starts on a
# line of its own (a command counts only at the start of a line), even when the command's last output had no trailing newline.
set -u
if [ "$#" -lt 1 ]; then
  echo "usage: stop-commands.sh <command> [args...]" >&2
  exit 2
fi
tok="$(od -An -N8 -tx1 /dev/urandom 2>/dev/null | tr -d ' \n')"
[ -n "$tok" ] || tok="qnfo$$${RANDOM}${RANDOM}${RANDOM}"
echo "::stop-commands::$tok"
"$@" && rc=0 || rc=$?
printf '\n::%s::\n' "$tok"
exit "$rc"
