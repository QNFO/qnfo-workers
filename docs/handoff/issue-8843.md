---
status: draft
issue: 8843
---
# Handoff: [#1002537] COMPANION-PR-1: Sessions without a working GitHub token push straight to main past the pull-request rule; give sessions a PR path (REST create-PR through the git proxy or a workflow that opens the PR from a pushed branch)

Opened as a draft PR (DRAFT-PR-PER-ISSUE-1) so every open issue has a PR. GitHub issue #8843 mirrors the canonical D1 qnfo-audit.agent_issues row.

## State
No fix yet. Read the issue body for the problem, its code-task and code-anchor lines and its closing probe.

## Next
1. Make the code change on this branch (set status to done here when finished).
2. Run the narrowest test plus scripts/pre_push_check.py for the worker.
3. Mark ready; the lane merges on green; verify the probe live; close the D1 issue with close_evidence.
