---
status: draft
issue: 8088
---
# Handoff: [#1002080] ROADMAP-1: QNFO.INFRA UNBIND-VERIFY-RETRY-1: cf-ops-actions unbind-service and unbind-d1 verify the result with one read that lags the write

Opened as a draft PR (DRAFT-PR-PER-ISSUE-1) so every open issue has a PR. GitHub issue #8088 mirrors the canonical D1 qnfo-audit.agent_issues row.

## State
No fix yet. Read the issue body for the problem, its code-task and code-anchor lines and its closing probe.

## Next
1. Make the code change on this branch (set status to done here when finished).
2. Run the narrowest test plus scripts/pre_push_check.py for the worker.
3. Mark ready; the lane merges on green; verify the probe live; close the D1 issue with close_evidence.
