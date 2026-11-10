---
status: draft
issue: 8120
---
# Handoff: [#1002130] COLD-TIER-CADENCE-1: the cold tier drains a 50,000 row backlog at about 20 chunks an hour; weight the tier shares by backlog or run the stage on its own cadence

Opened as a draft PR (DRAFT-PR-PER-ISSUE-1) so every open issue has a PR. GitHub issue #8120 mirrors the canonical D1 qnfo-audit.agent_issues row.

## State
No fix yet. Read the issue body for the problem, its code-task and code-anchor lines and its closing probe.

## Next
1. Make the code change on this branch (set status to done here when finished).
2. Run the narrowest test plus scripts/pre_push_check.py for the worker.
3. Mark ready; the lane merges on green; verify the probe live; close the D1 issue with close_evidence.
