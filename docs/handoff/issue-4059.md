---
status: draft
issue: 4059
d1_issue_id: 1000192
---
# Handoff: fleet_budget caps breached: workers 35>30, d1 11>10, ai_spend:workers-ai 787.72>95; cost sources disagree (787.72 vs metric_registry workers_ai_cost_30d_usd 287.74)

Opened automatically (DRAFT-PR-PER-ISSUE-1) so every open issue has a draft PR. The canonical record is D1 qnfo-audit.agent_issues 1000192; GitHub issue #4059 mirrors it.

## State
No fix yet. Read the issue body for the problem, its code-task and code-anchor lines and its closing probe.

## Next
1. Make the code change on this branch (set status to done in this file when finished).
2. Run the narrowest test plus scripts/pre_push_check.py for the worker.
3. Mark ready; the lane merges on green; verify the probe live; close the D1 issue with close_evidence.

Deadline: 24 h from the issue's opening (owner directive 2026-11-09).
