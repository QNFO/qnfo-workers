---
status: draft
issue: 8016
---
# Handoff: [#1001973] PAPER-EDGE-CACHE-1: papers.qnfo.org paper pages are served from the colo edge cache (fresh 5 min, stale-while-revalidate, stale-if-error); finished code on branch rm-c6-s2-edge

Opened as a draft PR (DRAFT-PR-PER-ISSUE-1) so every open issue has a PR. GitHub issue #8016 mirrors the canonical D1 qnfo-audit.agent_issues row.

## State
No fix yet. Read the issue body for the problem, its code-task and code-anchor lines and its closing probe.

## Next
1. Make the code change on this branch (set status to done here when finished).
2. Run the narrowest test plus scripts/pre_push_check.py for the worker.
3. Mark ready; the lane merges on green; verify the probe live; close the D1 issue with close_evidence.
