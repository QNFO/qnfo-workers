---
status: draft
issue: 6696
---
# Handoff: [#1001443] TP-3.5-ONE-EMAIL-TRANSPORT-1: The 8 private send_email bindings route through qnfo-email's /send (one audit trail, one kill switch, one suppression list)

Opened as a draft PR (DRAFT-PR-PER-ISSUE-1) so every open issue has a PR. GitHub issue #6696 mirrors the canonical D1 qnfo-audit.agent_issues row.

## State
No fix yet. Read the issue body for the problem, its code-task and code-anchor lines and its closing probe.

## Next
1. Make the code change on this branch (set status to done here when finished).
2. Run the narrowest test plus scripts/pre_push_check.py for the worker.
3. Mark ready; the lane merges on green; verify the probe live; close the D1 issue with close_evidence.
