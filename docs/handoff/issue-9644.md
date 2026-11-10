---
status: draft
issue: 9644
---
# Handoff: [#1002656] CF-OBS-ISSUE-1: qnfo-deploy-guard: {"attempts":"<number>","error":"The operation was aborted","evt":"<string>","worker":"<string>"} [cf-obs:1b5e1822-2612-4754-84d7-431990850415]

Opened as a draft PR (DRAFT-PR-PER-ISSUE-1) so every open issue has a PR. GitHub issue #9644 mirrors the canonical D1 qnfo-audit.agent_issues row.

## State
No fix yet. Read the issue body for the problem, its code-task and code-anchor lines and its closing probe.

## Next
1. Make the code change on this branch (set status to done here when finished).
2. Run the narrowest test plus scripts/pre_push_check.py for the worker.
3. Mark ready; the lane merges on green; verify the probe live; close the D1 issue with close_evidence.
