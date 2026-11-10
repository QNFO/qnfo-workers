---
status: draft
issue: 7955
---
# Handoff: [#1001854] BLINDSPOT-1: 23 merged code tasks have no deploy evidence after 2 hours

Opened as a draft PR (DRAFT-PR-PER-ISSUE-1) so every open issue has a PR. GitHub issue #7955 mirrors the canonical D1 qnfo-audit.agent_issues row.

## State
No fix yet. Read the issue body for the problem, its code-task and code-anchor lines and its closing probe.

## Next
1. Make the code change on this branch (set status to done here when finished).
2. Run the narrowest test plus scripts/pre_push_check.py for the worker.
3. Mark ready; the lane merges on green; verify the probe live; close the D1 issue with close_evidence.
