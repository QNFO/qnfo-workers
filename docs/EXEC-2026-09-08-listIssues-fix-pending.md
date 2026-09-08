# EXEC-2026-09-08 — Backlog drain executed; listIssues one-line fix (pending deploy)

Status: DRAIN EXECUTED · CODE FIX CAPTURED · DEPLOY PENDING (wrangler/code-agent path)

## 1. Drain (executed 2026-09-08 via ops_issue_run → qnfo-backlog-exec v1.1.1)
- openBacklogBefore: 14 → processed 14 · rechecked 13 · escalated 1 · closed 0
- D1 agent_issues GROUP BY status after: open 14 / resolved 38 / closed 211 / wontfix 252
- backlog-exec /health openBacklog = 14 (matches D1). closed=0 is CORRECT: all 14 are genuine
  defect rows (worker exceptions, alert-storm dups, 5xx, edge 504s); re-probes failed → escalated.

## 2. ops_issues_list root cause (byte-verified in qnfo-ops/worker.js on main)
Missing await on D1 .all() in listIssues() → res.results always undefined → {ok:true,count:0,issues:[]}
for every status (incl 'all'). Full analysis: docs/FIX-2026-09-07-ops_issues_list-await.md.

## 3. The fix (one line)
Before:
```js
const res = params.length ? stmt.bind.apply(stmt, params).all() : stmt.all();
```
After:
```js
const res = await (params.length ? stmt.bind.apply(stmt, params).all() : stmt.all());
```
File: qnfo-ops/worker.js (sha 75d38cc370b07b45a5665c277b511566274bd6b1; deployed-current.worker.js same sha).
Apply then `wrangler deploy` in qnfo-ops/ (single-file worker, no build).

## 4. Acceptance criteria (post-deploy)
- ops_issues_list(status=open) → count 14, newest updated_at first, ids match D1
- status=closed → 211 · resolved → 38 · wontfix → 252 · all → 515
- priority composes with status; limit 1-50 respected
- Regression guard: no non-awaited .all()/.first()/.run() in qnfo-ops/worker.js

Why not applied in-session: full-file rewrite of the 162,597-byte monolith via the contents API is a
corruption risk; a branch-level repoEdit (code-agent) or wrangler deploy with a real token is the
safe apply path.
