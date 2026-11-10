---
status: draft
issue: 3273
---
# Handoff: [#100318] TP-1.17-STAGED-ROLLOUT-AI-GATEWAY-1: Staged rollout for qnfo-ai and qnfo-gateway, then both leave the never-auto-merge lists together

Opened as a draft PR (DRAFT-PR-PER-ISSUE-1) so every open issue has a PR. GitHub issue #3273 mirrors the canonical D1 qnfo-audit.agent_issues row.

## State
No fix yet. Read the issue body for the problem, its code-task and code-anchor lines and its closing probe.

## Next
1. Make the code change on this branch (set status to done here when finished).
2. Run the narrowest test plus scripts/pre_push_check.py for the worker.
3. Mark ready; the lane merges on green; verify the probe live; close the D1 issue with close_evidence.
