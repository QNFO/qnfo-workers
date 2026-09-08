# FIX — listIssues await bug (invisible ops backlog)

Date: 2026-09-08
Status: **staged** (source fix + guarded patch script committed; NOT yet deployed)
Deploy gate: no Cloudflare deploy token in this session — the live qnfo-ops worker still runs the buggy code until a deploy-capable run executes `wrangler deploy` from `qnfo-ops/` after running the patch script.

## Root cause (byte-verified in qnfo-ops/worker.js, blob sha 75d38cc370b07b45a5665c277b511566274bd6b1)

`listIssues()` executes the query without awaiting it:

```js
const stmt = env.QNFO_AUDIT.prepare(sql);
const res = params.length ? stmt.bind.apply(stmt, params).all() : stmt.all();
return { ok: true, status: status, count: (res.results || []).length, issues: (res.results || []).slice(0, 50) };
```

D1 `Statement.all()` is async. `res` is a Promise, so `res.results` is always `undefined` → every call returns `{ count: 0, issues: [] }`, for `open`, `closed`, and `all` alike. The backlog rows exist in `qnfo-audit.agent_issues`; the tool just cannot see them.

## Fix

```js
const res = await (params.length ? stmt.bind.apply(stmt, params).all() : stmt.all());
```

+8 chars. Verified in the server-side sandbox (run_code): occurrence found exactly once, replacement applied, result line correct.

## How to land it (server-side, repo-exec or deploy-capable session)

1. `node qnfo-ops/scripts/apply-listIssues-await-fix.mjs` from the repo root
   (guarded: aborts if the buggy line is not exactly one occurrence; idempotent).
2. Deploy from `qnfo-ops/`: `wrangler deploy` (or the repo deploy runbook).
3. Verify acceptance criteria below.

## Acceptance criteria (post-deploy, via the ops endpoint)

- `ops_issues_list` (status=open) → count 15 (as of 2026-09-08: open 15, resolved 38, closed 211, wontfix 252; total 515) — NOT 0.
- `ops_issues_list` (status=all) → count 515 and actual rows.
- priority filter returns only matching rows.
- `backlog_status` (qnfo-backlog-exec /health) openBacklog still matches the D1 open count.

## Evidence captured before staging (2026-09-08)

- D1: `SELECT status, COUNT(*) n FROM agent_issues GROUP BY status` → open 15 / resolved 38 / closed 211 / wontfix 252.
- Live `ops_issues_list` status=open → `{ ok: true, count: 0, issues: [] }` (bug reproduced on the deployed worker).
- qnfo-backlog-exec drain (2026-09-08) reported openBacklog consistent with D1; drain is safe-by-design (only auto-closes re-probed-healthy rows) so the 15 open rows are genuine defects, not phantom counts.

## Related

- Workspace: `qnfo/ops/2026-09-08-backlog-drain.md`, `qnfo/cloudflare-skills-mcp/2026-09-08-EXEC-LOG.md`
- Root-cause doc (earlier, superseded attribution): `docs/FIX-2026-09-07-ops_issues_list-await.md`
