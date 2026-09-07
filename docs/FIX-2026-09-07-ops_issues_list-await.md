# FIX-2026-09-07 — ops_issues_list returns 0 rows (missing await on D1 .all())

**Component:** `qnfo-ops/worker.js` v2.5.1 · `listIssues()` (server tool `ops_issues_list`)
**Severity:** high (ops backlog invisible to every agent/client that uses the tool)
**Root cause confirmed 2026-09-07 by live repro against deployed qnfo-ops + direct D1.**

## Symptom (live, reproducible at audit time)
| Source | Result |
|---|---|
| `ops_issues_list(status=open)` | `{ok:true, count:0, issues:[]}` |
| `ops_issues_list(status=all)` | `{ok:true, count:0, issues:[]}` |
| `ops_issues_list(status=closed/resolved/wontfix)` | all `count:0` |
| Direct D1 `agent_issues GROUP BY status` | open 11 · resolved 30 · closed 211 · wontfix 252 (504) |
| `qnfo-backlog-exec /health` | `openBacklog: 11` |

Same worker, same `QNFO_AUDIT` binding, same table → wrapper reports 0 rows for every
status, including `all` (which has no WHERE clause). Any bug in the status filter would
still show rows for `all`; returning 0 there proves the query result is never read.

## Root cause
`D1PreparedStatement.all()` is async. In `listIssues()` the promise is not awaited:

```js
const res = params.length ? stmt.bind.apply(stmt, params).all() : stmt.all();
return { ok: true, status: status, count: (res.results || []).length, issues: (res.results || []).slice(0, 50) };
```

`res` is a Promise → `res.results` is `undefined` → `count: 0, issues: []` always.
Every sibling handler (`d1Query`, `serviceDiscover`, `registryList`, `telemetryAnalyze`,
`recentOpsLog`, `jobGetRow`, …) correctly awaits `.all()`/`.first()`; `listIssues` is the
single missing-await in the file.

## Fix (one line)
```js
const res = params.length ? await stmt.bind.apply(stmt, params).all() : await stmt.all();
```

## Acceptance criteria
1. `ops_issues_list()` (open) → count 11, ids of the 11 open issues, newest `updated_at` first.
2. `status=closed` → 211 · `resolved` → 30 · `wontfix` → 252 · `all` → 504 (matches D1 GROUP BY).
3. `priority` composes with status (open+high → high-priority open only).
4. `limit` respected (1–50).
5. Regression guard: no non-awaited `.all()/.first()/.run()` anywhere in qnfo-ops worker.js.

## Apply
Edit `qnfo-ops/worker.js` `listIssues()` (single line), bump patch version, deploy qnfo-ops.
Recorded as machine-readable patch metadata for the deploy pipeline (issue 506 family).
