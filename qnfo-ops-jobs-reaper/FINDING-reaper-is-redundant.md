# FINDING — the reaper in this directory is REDUNDANT and SLOWER than what already runs

Date: 2026-09-13T14:10Z · Author: qnfo-ops / ops-exec
Status: **self-criticism of the artifact in this directory.** Read before deploying.

## The measurement

Run against live `ops_jobs` at the thresholds `worker.js` actually ships (45m / 90m):

```sql
SELECT COUNT(*) total,
       SUM(CASE WHEN status IN ('running','continuing') AND response IS NOT NULL
                 AND length(response) > 0
                 AND julianday(updated_at) < julianday('now') - (45/1440.0)
                THEN 1 ELSE 0 END) AS reaper_would_promote,
       SUM(CASE WHEN status IN ('running','continuing')
                 AND (response IS NULL OR length(response) = 0)
                 AND julianday(updated_at) < julianday('now') - (90/1440.0)
                THEN 1 ELSE 0 END) AS reaper_would_fail,
       SUM(CASE WHEN status IN ('running','continuing') THEN 1 ELSE 0 END) AS non_terminal
FROM ops_jobs;
```

Result: **`total 118 · would_promote 0 · would_fail 0 · non_terminal 21`**

**The reaper would do nothing.** All 21 non-terminal rows are younger than 45 minutes.

## Why that is fatal to the D17 claim

The live evidence already showed an **existing, undocumented reaper promoting at ~20 minutes**
(35 rows in a 16.0 s sweep at 13:51:19–13:51:35Z; `job-2fdebc20f4ac75` promoted at 13:51:23.292Z,
22 min after its last write).

45 minutes is **slower than 20 minutes**. This worker can therefore never fire before the
existing reaper already has. For D17 it is **not a mitigation — it is dead code.**

The only way to make it fire first is to drop `PROMOTE_AFTER_MIN` below ~20 — and that
reintroduces the exact hazard the WARNING block in `worker.js` describes: because `updated_at`
is not a heartbeat, a job legitimately running 25 minutes is indistinguishable from one
abandoned 25 minutes ago. Trading a documented 20-minute lag for silent reaping of live work is
a worse outcome, not a better one.

## What actually fixes D17

The in-worker terminal write — the six patches in
`qnfo-ops/patches/2026-09-13-AUDIT-AND-FIX-consolidated.md` §1:

```sql
UPDATE ops_jobs
   SET response=?, tool_log=?, status='succeeded', terminal_at=?, updated_at=?
 WHERE id=? AND status NOT IN ('succeeded','failed')
```

That removes the lag entirely instead of racing it. It remains unshippable from the qnfo-ops
endpoint (161,339 B file vs a 32,768-char read cap).

## Where this worker still has value

Narrower than the README implies:

1. **D19** — the existing reaper's behaviour on no-response rows is unknown. The 6 uninstrumented
   `failed` rows from 2026-09-12 were never given a reason, which suggests nothing currently
   labels them. If that is true, this worker is the only thing that would.
2. **Insurance** — if the undocumented ~20 min reaper is removed, breaks, or is found to be
   accidental (it may be a side effect of the duplicate-execution path in D18 rather than a
   designed sweep), this is a labelled replacement.
3. It makes the reaper **explicit and inspectable** where it is currently inferred from
   timestamps by an outside observer.

## Recommendation

**Do not deploy this as a D17 fix.** Deploy it, if at all, as a D19 instrument plus D17
insurance, and do not let its existence close D17 in the backlog. The honest backlog entry for
D17 stays open until the terminal write ships.

This is the third time in one session that a claim of mine did not survive a counter-query
(the 3,000-byte cap, the missing issue ledger, and the "routing-table entries" diagnosis).
The common cause is the same each time: asserting from a single read without running the query
that would falsify it. The counter-query above should have been run *before* `worker.js` was
written, not after.
