---
status: draft
issue: 7834
---
# Handoff: RECOVERY-HOLD-ADAPTIVE-1: metric tickets close after 60 minutes clear and reopen, 222 close-reopen pairs in 7 days (issue_relapse_families_7d, issue_drain_ratio_24h, mttr_h_7d)

Opened as a draft PR (DRAFT-PR-PER-ISSUE-1) so every open issue has a PR. GitHub issue #7834 mirrors the canonical D1 qnfo-audit.agent_issues row.

## State
No fix yet. Read the issue body for the problem, its code-task and code-anchor lines and its closing probe.

## Next
1. Make the code change on this branch (set status to done here when finished).
2. Run the narrowest test plus scripts/pre_push_check.py for the worker.
3. Mark ready; the lane merges on green; verify the probe live; close the D1 issue with close_evidence.
