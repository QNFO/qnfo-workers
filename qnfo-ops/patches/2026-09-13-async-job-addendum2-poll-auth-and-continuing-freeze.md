# Addendum 2 — `/v1/jobs/:id` auth from an external vantage, and D17: the `continuing` freeze

Author: qnfo-ops / ops-exec (session 2026-09-13T13:19–13:26Z).
Parents: `2026-09-13-async-job-audit-trail-and-envelope.md` (sha `f2c30675…`, **STAGED — not applied**)
and `2026-09-13-async-job-addendum-corrections.md` (sha `4a39a753…`).
Status: **STAGED — not applied.** No deploy tool exists on the qnfo-ops endpoint; see §4.

Every figure below is a live D1 or HTTP return from this session.

---

## 1 — A2's open question is now answered: the route is LIVE and bearer-gated

Addendum 1 (A2) recorded: *"Polling from a browser/client is a separate path and is untested here."*
It is now tested, from two vantage points in the same session:

| vantage | request | result |
|---|---|---|
| this endpoint (Cloudflare Worker) | `web_fetch GET /v1/jobs/job-2e161c70ec28d9` | **HTTP 404** |
| external client (non-Worker) | `GET /v1/jobs/job-2e161c70ec28d9`, no bearer | **`{"error":"Unauthorized - set Bearer OPS_ROUTER_AUTH_KEY"}`** |

The differential is the finding. A same-account Worker→`workers.dev` fetch returns 404 (the
edge artifact documented in A2 and in `docs/INTEGRATION-DEFECTS-2026-09-13.md` §3.1), while the
same path from a non-Worker vantage reaches the router and is rejected **401 by the auth guard**.

Consequences:

1. **The route is not dead.** It is registered (`service_registry.qnfo-ops.routes` includes
   `/v1/jobs` and `/v1/jobs/:id`, version `2.15.1`) and it answers on the public hostname.
2. **A 404 from this endpoint is not evidence about the target.** Unchanged from A2 — the
   observer's vantage decides. This addendum is the second independent confirmation.
3. **Polling is possible, but only with the bearer.** Any instruction that tells a client to
   `GET /v1/jobs/:id` **without** the `Authorization` header cannot succeed. An earlier
   continuation message in this session did exactly that and produced the 401 above; that
   instruction was wrong and is retracted here.

**Evidence grade.** The 404 is reproduced by me (single tool call, Worker vantage). The 401 is a
**single client-reported observation** — I cannot reproduce it from inside the Worker, so it is
recorded as reported, not independently re-measured. Confidence that the guard requires the bearer:
high (the message names `OPS_ROUTER_AUTH_KEY`, a qnfo-ops-only secret, and the route is in the
registry). Confidence that the exact status code is 401 rather than 403: medium.

**The operational point that survives everything above:** the deliverable never depended on this
route. `ops_jobs.response` is a plain column in `qnfo-audit`, readable through `ops_d1_query`.
That is how every job result in this session was retrieved — including the job that triggered the
401.

---

## 2 — D17 (NEW): 26 jobs are frozen in `continuing` with their answers already written

`ops_jobs` as of 2026-09-13T13:25Z, restricted to rows carrying `_chain`:

| status | depth 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| `succeeded` | 14 | 7 | 3 | 1 | 0 | 2 |
| `continuing` | **13** | **6** | **3** | **2** | **2** | 0 |
| `failed` | 5 | 0 | 0 | 0 | 0 | 0 |
| `queued` | 1 | 0 | 0 | 0 | 0 | 0 |

Aggregate over the 26 `continuing` rows:

```sql
SELECT COUNT(*) continuing_total, SUM(length(response)>0) with_response,
       SUM(json_valid(tool_log)) valid_log, SUM(length(tool_log)=3000) at_3000_cap,
       ROUND((julianday('2026-09-13T13:25:00Z')-julianday(MAX(updated_at)))*24,2) hours_since_last_update
FROM ops_jobs WHERE status='continuing';
-- 26 | 26 | 8 | 18 | 5.97
```

**All 26 have a non-empty `response`.** The answer was written; the status was never advanced to a
terminal value. Oldest created 06:29:04Z, newest `updated_at` 07:26:40Z — **~6.0 h with no
transition**. A chain-midpoint row whose successor was spawned but which was never marked
`succeeded` is indistinguishable, to any client, from a job that is still working.

**Impact.** `GET /v1/jobs/:id` (and any poll loop built on it) reports `continuing` forever for 26
jobs whose output is already final. A poller with a timeout treats them as failures; a poller
without one hangs. This is the same failure class as D2 in the parent doc — the durable path's
state does not converge — but on the *terminal* side rather than the *envelope* side.

**Fix (staged).** When the runner writes `response`, write the terminal status in the same
statement (`UPDATE ops_jobs SET response=?, status='succeeded', updated_at=? WHERE id=?`), or add a
reaper that promotes any row with a non-empty `response` and no update for > N minutes. Add a
`terminal_at` column so "stalled" and "done" are distinguishable without a timeout guess.

---

## 3 — D1 (tool_log) is worse than either prior measurement

Addendum 1 (A3) re-measured the parent's 4 truncated rows as **14 rows at the 3,000-byte cap, 0
valid**. Restricted to the `continuing` cohort the same defect is **18 of 26** rows at the cap and
only **8 of 26** with valid JSON.

The parent doc's fix is unchanged and still correct: truncate the **array**, then stringify —
never slice a stringified JSON string at a byte offset. The growth 4 → 14 → 18 across one day
means the defect is proportional to tool-heavy job volume, so it will keep widening until the call
site is changed.

---

## 4 — Why this is still STAGED, and what would unblock it

`qnfo-ops/worker.js` is **161,339 B**. The read tool caps at 32,768 chars and `github_file_write`
requires full file content, so a contents-API full-file write of this worker **cannot be performed
from this endpoint**. No `exec`/`wrangler` tool exists here either. Both parents reached the same
conclusion; this addendum confirms it independently rather than inheriting it.

Unblocking requires a session with `wrangler deploy` from `qnfo-ops/`. The three staged fixes are:
D1 (array-then-stringify), D2 (202 + terminal status on write), D17 (promote on response write),
plus A2/D4 (`_chain` as queryable columns).

---

## 5 — Honest limits of this addendum

- One D1 snapshot under concurrent writers; a chain may have advanced between read and write.
- The 401 is client-reported and not re-measured from a non-Worker vantage.
- "Frozen" is inferred from `MAX(updated_at)`; a job could in principle be updated without
  changing that column. A `terminal_at` column would remove the inference — which is part of the
  proposed fix.
- `_chain.depth` is read from `payload` JSON and is **self-reported by the runner**, so the depth
  table describes what the runner claimed, not an independently enforced bound.
