---
status: draft
issue: 8086
---
# Handoff: [#1002077] ROADMAP-1: QNFO.INFRA ARCHIVE-MARKER-READ-3: scripts/cf_ops_actions.py reads the RETIRED and FOLDED marker under archive/<name>/ as well (delete-worker, delete-vectorize-index, unbind-service)

Opened as a draft PR (DRAFT-PR-PER-ISSUE-1) so every open issue has a PR. GitHub issue #8086 mirrors the canonical D1 qnfo-audit.agent_issues row.

## State
No fix yet. Read the issue body for the problem, its code-task and code-anchor lines and its closing probe.

## Next
1. Make the code change on this branch (set status to done here when finished).
2. Run the narrowest test plus scripts/pre_push_check.py for the worker.
3. Mark ready; the lane merges on green; verify the probe live; close the D1 issue with close_evidence.
