---
status: draft
issue: 5802
d1_issue_id: 1000941
---
# Handoff: OWNER-TASK-op-mvwlxe6a6e81: Update all Fleet AI consumer code to use env.AI.run("dynamic/<route>", { messages }, { gateway: { id: "default" } }) instead of hard‑coded model IDs, th

Opened automatically (DRAFT-PR-PER-ISSUE-1) so every open issue has a draft PR. The canonical record is D1 qnfo-audit.agent_issues 1000941; GitHub issue #5802 mirrors it.

## State
No fix yet. Read the issue body for the problem, its code-task and code-anchor lines and its closing probe.

## Next
1. Make the code change on this branch (set status to done in this file when finished).
2. Run the narrowest test plus scripts/pre_push_check.py for the worker.
3. Mark ready; the lane merges on green; verify the probe live; close the D1 issue with close_evidence.

Deadline: 24 h from the issue's opening (owner directive 2026-11-09).
