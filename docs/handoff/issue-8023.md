---
status: done
issue: 8023
---
# Handoff: [#1001986] WORK-CLAIM-MERGED-RELEASE-1: a claim whose pull request merged is released at the merge, not at its TTL

Opened as a draft PR (DRAFT-PR-PER-ISSUE-1) so every open issue has a PR. GitHub issue #8023 mirrors the canonical D1 qnfo-audit.agent_issues row.

## State
Implemented on this branch.

## Changes
- `qnfo-deploy-guard/worker.js`: added `POST /work-lock/release-merged {repo, pr}` and `releaseMergedClaims()`; bumped VERSION to 1.7.1-codeagent.
- `.github/workflows/pr-lane.yml`: on a merged pull_request `closed` event, POSTs release-merged for the PR number.
- `qnfo-deploy-guard/work-lock.test.mjs`: added work_claims table to the test schema and test section F for release-merged.
- `qnfo-deploy-guard/deployed-current.worker.js`: mirrored the worker change.

## Verification
- `node qnfo-deploy-guard/work-lock.test.mjs` → 70 passed, 0 failed.
- `python3 scripts/pre_push_check.py qnfo-deploy-guard` → ok.

## Next
1. Mark PR ready for review; the lane merges on green.
2. After deploy, verify a merged pull request frees its claim within a minute (GET /work-locks no longer lists the key).
3. Close the D1 issue with close_evidence.
