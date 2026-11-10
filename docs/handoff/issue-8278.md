---
status: draft
issue: 8278
---
# Handoff: [#1002258] YT-D1-OVERLOAD-1: qnfo-youtube-shorts hourly ticks at 11:00Z and 12:00Z on 2026-11-06 failed with D1_ERROR "D1 DB is overloaded"; qnfo-audit is 995 MB

Opened as a draft PR (DRAFT-PR-PER-ISSUE-1) so every open issue has a PR. GitHub issue #8278 mirrors the canonical D1 qnfo-audit.agent_issues row.

## State
No fix yet. Read the issue body for the problem, its code-task and code-anchor lines and its closing probe.

## Next
1. Make the code change on this branch (set status to done here when finished).
2. Run the narrowest test plus scripts/pre_push_check.py for the worker.
3. Mark ready; the lane merges on green; verify the probe live; close the D1 issue with close_evidence.
