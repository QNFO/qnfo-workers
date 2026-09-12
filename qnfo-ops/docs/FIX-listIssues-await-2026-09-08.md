# FIX — listIssues await bug (invisible ops backlog)

Date: 2026-09-08
Status: **staged** (source fix + guarded patch script committed; NOT yet deployed)
Deploy gate: no Cloudflare deploy token in this session — the live qnfo-ops worker still runs the buggy code until a deploy-capable run executes `wrangler deploy` from `qnfo-ops/` after running the patch script.

## RE-VERIFICATION 2026-09-12 (qnfo-ops / ops-exec) — STILL LIVE, STILL STAGED

Re-confirmed against the live endpoint this session; the fix is still undeployed:

- `ops_issues_list` (status=all) -> `{"ok":true,"status":"all","count":0,"issues":[]}` while
  `SELECT COUNT(*) FROM agent_issues` = 663 (open 17 / closed 316 / resolved 72 / wontfix 258).
- `ops_issues_list` (status=open) -> count 0 while `SELECT COUNT(*) ... WHERE status='open'` = 17.
- Mechanism re-proved server-side (run_code, mock of D1 `Statement.all()`):
  un-awaited -> `res` is a Promise -> `res.results` undefined -> reported 0;
  awaited -> reported 3 of 3 rows. `mechanism_confirmed: true`.
- **Falsified alternative hypothesis**: `agent_issues.updated_at` is type-mixed
  (integer 158 / text 505) and `created_at` likewise (integer 454 / text 209), but
  `SELECT id, updated_at FROM agent_issues ORDER BY updated_at DESC LIMIT 5` returns
  5 rows normally. SQLite orders mixed storage classes; it does not drop rows.
  Type-mixing therefore cannot explain a count of 0 — the missing `await` remains the
  only supported cause.

NOTE — source drift: the 2026-09-08 byte-verification pinned blob sha
`75d38cc370b07b45a5665c277b511566274bd6b1`. The current `qnfo-ops/worker.js` is a
different blob (sha `d5753c553cc2655aab2caefdc83b18c50a6b075a`, VERSION 2.13.1,
157,722 bytes). The `listIssues()` handler could NOT be re-inspected this session:
the repo read tool returns only the first ~30 KB of a 157 KB file and has no offset
parameter. Before deploying, re-confirm the buggy line is still present — or that the
patch script reports "already patched".

## Root cause (byte-verified in qnfo-ops/worker.js, blob sha 75d38cc370b07b45a5665c277b511566274bd6b1)

`listIssues()` executes the query without awaiting it:

```js
const stmt = env.QNFO_AUDIT.prepare(sql);
const res = params.length ? stmt.bind.apply(stmt, params).all() : stmt.all();
return { ok: true, status: status, count: (res.results || []).length, issues: (res.results || []).slice(0, 50) };
```

D1 `Statement.all()` is async. `res` is a Promise, so `res.results` is always `undefined` -> every call returns `{ count: 0, issues: [] }`, for `open`, `closed`, and `all` alike. The backlog rows exist in `qnfo-audit.agent_issues`; the tool just cannot see them.

## Fix

```js
const res = await (params.length ? stmt.bind.apply(stmt, params).all() : stmt.all());
```

+8 chars. Verified in the server-side sandbox (run_code): occurrence found exactly once, replacement applied, result line correct. Re-proved 2026-09-12.

## How to land it (server-side, repo-exec or deploy-capable session)

1. `node qnfo-ops/scripts/apply-listIssues-await-fix.mjs` from the repo root
   (guarded: aborts if the buggy line is not exactly one occurrence; idempotent).
2. Deploy from `qnfo-ops/`: `wrangler deploy` (or the repo deploy runbook).
3. Verify acceptance criteria below.

## Acceptance criteria (post-deploy, via the ops endpoint)

Current D1 truth (2026-09-12, qnfo-audit.agent_issues, 663 rows):
open 17 / closed 316 / resolved 72 / wontfix 258.

- `ops_issues_list` (status=open) -> count 17 — NOT 0.
- `ops_issues_list` (status=all) -> count 663 and actual rows.
- priority filter returns only matching rows.
- `backlog_status` (qnfo-backlog-exec /health) openBacklog still matches the D1 open count (17).

Superseded 2026-09-08 figures (open 15, total 515) — do not use; the backlog has grown
and the numbers would produce a false failure signal.

## Evidence captured before staging (2026-09-08)

- D1: `SELECT status, COUNT(*) n FROM agent_issues GROUP BY status` -> open 15 / resolved 38 / closed 211 / wontfix 252.
- Live `ops_issues_list` status=open -> `{ ok: true, count: 0, issues: [] }` (bug reproduced on the deployed worker).
- qnfo-backlog-exec drain (2026-09-08) reported openBacklog consistent with D1; drain is safe-by-design (only auto-closes re-probed-healthy rows) so the 15 open rows are genuine defects, not phantom counts.

## Related

- Workspace: `qnfo/ops/2026-09-08-backlog-drain.md`, `qnfo/cloudflare-skills-mcp/2026-09-08-EXEC-LOG.md`
- Root-cause doc (earlier, superseded attribution): `docs/FIX-2026-09-07-ops_issues_list-await.md`
