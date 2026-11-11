---
status: draft
issue: 7405
d1_issue_id: 1001706
---
# Handoff: COST-D1-DRILL-1c: a queued code task holds its file claim for hours (ct_9qc46synuv7idd holds qnfo-fleet-dashboard/worker.js since 14:06Z, renewed to 17:22Z, status queued, step read, 4 h in the queue)

Opened automatically (DRAFT-PR-PER-ISSUE-1) so every open issue has a draft PR. The canonical record is D1 qnfo-audit.agent_issues 1001706; GitHub issue #7405 mirrors it.

## State
No fix yet. Read the issue body for the problem, its code-task and code-anchor lines and its closing probe.

## Next
1. Make the code change on this branch (set status to done in this file when finished).
2. Run the narrowest test plus scripts/pre_push_check.py for the worker.
3. Mark ready; the lane merges on green; verify the probe live; close the D1 issue with close_evidence.

Deadline: 24 h from the issue's opening (owner directive 2026-11-09).
