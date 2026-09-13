# FIX — listIssues await bug (invisible ops backlog)

Date: 2026-09-08
Status: **NOT REPRODUCIBLE as of 2026-09-13 — do NOT apply this patch blind. Read the banner.**

---

## BANNER 2026-09-13 (qnfo-ops / ops-exec) — DEFECT NOT PRESENT IN THE LIVE ENDPOINT

The 2026-09-12 "RE-VERIFICATION" section further down is **superseded and falsified**.
Live probes this session (2026-09-13T07:16Z, same endpoint):

| probe | live return |
|---|---|
| `ops_issues_list(status=all, limit=5)` | `{"ok":true,"status":"all","count":5,"issues":[…]}` — 5 real rows |
| `ops_issues_list(status=open, limit=50)` | `{"ok":true,"status":"open","count":25,"issues":[…]}` — 25 real rows |

25 rows returned in full (ids 644…677) with titles, categories, priorities and timestamps.
A `count` of 0 is **not reproducible** on the deployed worker.

**What this does and does not establish.** It establishes the *live behaviour*: the tool returns
correct data. It does **not** establish that the patch in this file shipped — the `listIssues()`
handler still cannot be inspected (see "Read cap" below; live `worker.js` is 161,339 B and the
repo read tool truncates at 32,768 chars with no offset parameter). Two possibilities remain
open and are **not** distinguished here:

- (a) the `await` fix landed in the 2.14.0 revision, or
- (b) the deployed code never contained the un-awaited call as characterised.

Do not assume (a).

**Action for a deploy-capable runner:** run the guarded patch script and read its output.

- If it reports **"already patched"** → the live source already contains the fix; nothing to deploy.
- If it reports the **buggy line present exactly once** → the live worker runs code the live
  endpoint contradicts. That is itself a finding: escalate before patching.

**Corrected acceptance criteria** (live truth 2026-09-13, `qnfo-audit.agent_issues`, **673 rows**):
open **25** / closed **318** / resolved **72** / wontfix **258**.

- `ops_issues_list(status=open)` → count **25**
- `ops_issues_list(status=all)` → rows returned; note `count` is bounded by `limit`, not the total
- `priority` filter returns only matching rows
- `backlog_status` (qnfo-backlog-exec /health) `openBacklog` = **25** (matches D1 open count)

Superseded figures — do not use: open 17 / total 663 (2026-09-12); open 15 / total 515 (2026-09-08).
Those numbers would produce a **false failure signal** on a correct deploy.

**Live worker metadata (2026-09-13):** `qnfo-ops/worker.js` = **161,339 bytes**, blob sha
`cf9bb72e0b4e9a9f98343ea296cf9ae55dff0d13`, `VERSION = "2.14.0"`.
Superseded: 157,722 B / `d5753c55…` / 2.13.1 (2026-09-12); 157,722 B / `75d38cc3…` (2026-09-08).

---

## Historical record (2026-09-08 → 2026-09-12) — retained, no longer live

### RE-VERIFICATION 2026-09-12 (qnfo-ops / ops-exec) — SUPERSEDED 2026-09-13

Claimed re-confirmed against the live endpoint; **falsified 2026-09-13**:

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
  Type-mixing therefore cannot explain a count of 0.

**Note on the 2026-09-12 mechanism proof:** the `run_code` mock proves the *mechanism* (an
un-awaited D1 `.all()` yields `undefined`), not that the deployed handler contains it. The
mechanism reasoning remains valid; the claim that it was live on the deployed worker does not.

### Root cause as characterised (byte-verified 2026-09-08, blob sha 75d38cc3…)

`listIssues()` executes the query without awaiting it:

```js
const stmt = env.QNFO_AUDIT.prepare(sql);
const res = params.length ? stmt.bind.apply(stmt, params).all() : stmt.all();
return { ok: true, status: status, count: (res.results || []).length, issues: (res.results || []).slice(0, 50) };
```

D1 `Statement.all()` is async. `res` is a Promise, so `res.results` is always `undefined` ->
every call returns `{ count: 0, issues: [] }`, for `open`, `closed`, and `all` alike.

### Fix as characterised

```js
const res = await (params.length ? stmt.bind.apply(stmt, params).all() : stmt.all());
```

+8 chars. Verified in the server-side sandbox (run_code): occurrence found exactly once,
replacement applied, result line correct. Re-proved 2026-09-12.

### How to land it (server-side, repo-exec or deploy-capable session)

1. `node qnfo-ops/scripts/apply-listIssues-await-fix.mjs` from the repo root
   (guarded: aborts if the buggy line is not exactly one occurrence; idempotent).
2. Deploy from `qnfo-ops/`: `wrangler deploy` (or the repo deploy runbook).
3. Verify against the **corrected** acceptance criteria in the banner above.

### Evidence captured 2026-09-08

- D1: `SELECT status, COUNT(*) n FROM agent_issues GROUP BY status` -> open 15 / resolved 38 / closed 211 / wontfix 252.
- Live `ops_issues_list` status=open -> `{ ok: true, count: 0, issues: [] }` (claimed bug reproduction).
- qnfo-backlog-exec drain (2026-09-08) reported openBacklog consistent with D1; drain is safe-by-design
  (only auto-closes re-probed-healthy rows) so the open rows are genuine defects, not phantom counts.

---

## Read cap — why this file's source claims cannot be re-checked from qnfo-ops (2026-09-13)

`github_repo_read` truncates at **32,768 chars regardless of `maxChars`**. Verified live:
`maxChars=200000` on a 161,339-byte file returned 32,768 chars with the literal marker
`(truncated to 32768 chars)`, and the tool has no offset parameter.

Consequence: qnfo-ops **cannot fully read its own worker source** through its tool surface.
Handlers past char 32,768 — including `listIssues()` and `telemetry_report()` — are unreachable,
and a 161 KB file cannot be reconstructed for a contents-API write. Self-diagnosis and
self-patching of `qnfo-ops/worker.js` are structurally impossible from this endpoint.

## Related

- `docs/FIX-telemetry-hours-2026-09-12.md` — separate defect, same worker, still live (re-confirmed 2026-09-13).
- Root-cause doc (earlier, superseded attribution): `docs/FIX-2026-09-07-ops_issues_list-await.md`
- Workspace ledger: `ops-workspace/audits/2026-09-13-REDTEAM-CORRECTIONS-live.md`
