---
status: draft
issue: 7998
---
# Handoff: [#1001941] TP-2.3-PROBE-10M-1: the dashboard probes every worker every 5 minutes, the fleet works to a 10-minute resolution

Opened as a draft PR (DRAFT-PR-PER-ISSUE-1) so every open issue has a PR. GitHub issue #7998 mirrors the canonical D1 qnfo-audit.agent_issues row.

## State
No fix yet. Read the issue body for the problem, its code-task and code-anchor lines and its closing probe.

## Next
1. Make the code change on this branch (set status to done here when finished).
2. Run the narrowest test plus scripts/pre_push_check.py for the worker.
3. Mark ready; the lane merges on green; verify the probe live; close the D1 issue with close_evidence.
