---
status: draft
issue: 8009
---
# Handoff: [#1001962] LOCAL-GUARD-HEARTBEAT-1: the owner-machine guards write a heartbeat to qnfo-audit so the cloud notices when they stop (residual risk of GUARDS-LOCAL-ONLY-1)

Opened as a draft PR (DRAFT-PR-PER-ISSUE-1) so every open issue has a PR. GitHub issue #8009 mirrors the canonical D1 qnfo-audit.agent_issues row.

## State
No fix yet. Read the issue body for the problem, its code-task and code-anchor lines and its closing probe.

## Next
1. Make the code change on this branch (set status to done here when finished).
2. Run the narrowest test plus scripts/pre_push_check.py for the worker.
3. Mark ready; the lane merges on green; verify the probe live; close the D1 issue with close_evidence.
