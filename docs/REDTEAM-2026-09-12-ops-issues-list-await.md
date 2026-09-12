# REDTEAM 2026-09-12 — ops_issues_list returns 0 (missing await) — live re-confirmation

**Red-team execution:** qnfo-ops endpoint, 2026-09-12T07:41Z
**Verdict:** DEFECT STILL LIVE. Fix documented since 2026-09-07, still not deployed.

## Live evidence (this session)
| Source | Result |
|---|---|
| `ops_issues_list(status=open)` | `{"ok":true,"status":"open","count":0,"issues":[]}` |
| `ops_issues_list` tool (limit 20) | count 0 |
| Direct D1 `SELECT status, COUNT(*) FROM agent_issues GROUP BY status` | closed 316 · wontfix 258 · resolved 72 · **open 17** |
| `backlog_status` (qnfo-backlog-exec v1.2.6) | `openBacklog: 17` |

Divergence is total and unconditional: the tool returns 0 for the default `open`
filter while two independent authoritative channels report 17 open rows. As the
2026-09-07 analysis notes, a status-filter bug would still return rows for
`status=all`; returning 0 there proves the query result is never read.

## Root cause (unchanged, byte-documented)
`qnfo-ops/worker.js` → `listIssues()`: D1PreparedStatement `.all()` is async and
is not awaited, so `res` is a Promise and `res.results` is `undefined`.

## Remediation status
- Fix text staged twice: `docs/FIX-2026-09-07-ops_issues_list-await.md` (sha 3e55d484)
  and `docs/EXEC-2026-09-08-listIssues-fix-pending.md` (sha 4519200b).
- Blocked on apply path: full-file rewrite of the 157,722-byte monolith via the
  GitHub contents API is a corruption risk; the documented safe paths are a
  branch-level repoEdit or `wrangler deploy` with a real CF token.
- Acceptance criteria (post-deploy): open=17, closed=316, resolved=72, wontfix=258,
  all=663; `priority` composes with `status`; `limit` 1–50 respected.

## Durable guard proposed
Add a regression check that fails if any non-awaited `.all()` / `.first()` / `.run()`
appears in `qnfo-ops/worker.js`, plus a self-test asserting
`ops_issues_list(open).count === D1(open).count`.
