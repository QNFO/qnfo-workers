# qnfo-ops-jobs-reaper

Closes **D17** and **D19** in the qnfo-ops durable job path, as a standalone cron worker.

## Why a separate worker

The canonical fix belongs in `qnfo-ops/worker.js`. That file is **161,339 B**, and the
GitHub contents API round-trip available to the qnfo-ops endpoint caps reads at
32,768 chars while requiring full file content on write — so the file cannot be patched
from there, and no `exec`/`wrangler` tool exists on that endpoint.

This worker is small enough to deploy immediately and does not require touching it.

| defect | what this does |
|---|---|
| **D17** | Promotes rows whose `response` was written but whose terminal status never was. Live evidence: 35 rows promoted in a 16 s reaper sweep at 13:51:19–13:51:35Z, and 8 rows still `continuing` with 1,314–8,006 B responses already written. |
| **D19** | Writes an explicit reason on rows that died with no response and no recorded error. The text is labelled **reaper-inferred**, because the true cause was never captured — that is the defect. 6 such rows exist, all with uniform 16–23 s lifetimes. |

## Deploy

```bash
cd qnfo-workers/qnfo-ops-jobs-reaper
CLOUDFLARE_API_TOKEN=... \
CLOUDFLARE_ACCOUNT_ID=edb167b78c9fb901ea5bca3ce58ccc4b \
wrangler deploy
```

The D1 binding is already filled in (`qnfo-audit` = `35e2e573-92f3-46ac-83c6-22f6429fc5e5`).

## Verify before you trust it

Dry run — counts what it *would* change, changes nothing:

```bash
curl -s https://qnfo-ops-jobs-reaper.<subdomain>.workers.dev/reap?dry=1
# {"ok":true,"dryRun":true,"wouldPromote":N,"wouldFail":M,...}
```

Then run it once and confirm the transition:

```bash
curl -s https://qnfo-ops-jobs-reaper.<subdomain>.workers.dev/reap
```

```sql
-- expect 0 rows with a response and a non-terminal status older than 45m
SELECT id, status, updated_at, length(response) resp_len
FROM ops_jobs
WHERE status IN ('running','continuing')
  AND response IS NOT NULL AND length(response) > 0
  AND julianday(updated_at) < julianday('now') - (45/1440.0);
```

The cron also appends a `cloud_ops_events` row per cycle (`kind='jobs-reaper'`), so
`SELECT ts, text, meta FROM cloud_ops_events WHERE kind='jobs-reaper' ORDER BY ts DESC LIMIT 5;`
shows whether it is actually running.

## ############################################################################
## WARNING — `updated_at` is NOT a heartbeat. Read before lowering thresholds.
## ############################################################################

`ops_jobs.updated_at` is written **only at a state transition**. A job that is
genuinely still working therefore has `updated_at` equal to its **creation** time.
That means:

- a job legitimately running 50 minutes is **indistinguishable** from one abandoned
  50 minutes ago;
- a low threshold **reaps live jobs** — it does not merely tidy up dead ones.

The defaults are therefore deliberately high:

| constant | default | meaning |
|---|---|---|
| `PROMOTE_AFTER_MIN` | **45** | response present, no update for 45m → `succeeded` |
| `DEAD_AFTER_MIN` | **90** | no response for 90m → `failed` + inferred reason |

**The real fix is a `heartbeat_at` column** written once per tool round by the runner.
Once that exists these can safely drop to ~5 minutes. Until then **any threshold is a
guess, and this worker is a mitigation, not a correction.** Do not describe D17 as
"fixed" on the strength of this worker alone.

## Two implementation details that are load-bearing

1. **`julianday()`, never string comparison.** `updated_at` is ISO-8601 with `T` and `Z`.
   Because `'T'` (0x54) sorts above `' '` (0x20), the obvious
   `WHERE updated_at < datetime('now','-45 minutes')` compares an ISO string against
   SQLite's space-separated format and silently gives the wrong answer. `julianday()`
   parses both, and returns `NULL` on the integer-epoch values used elsewhere in this
   D1 — so those rows **fail closed** (are skipped) rather than being mis-reaped.
2. **Idempotent by predicate.** Both statements are guarded on
   `status IN ('running','continuing')`, so a row already promoted is never touched
   again and repeated cycles are no-ops.

## Honest limits

- **Never executed against `ops_jobs`.** Every statement here is untested code.
- The `ALTER TABLE ops_jobs ADD COLUMN terminal_at` path is **unexercised**. If
  `terminal_at` already exists (v2.15.6's `deployed-current.worker.js` may have added
  it), the pragma check skips it — but that branch has never run either.
- The `cloud_ops_events` insert is `.catch(() => {})`'d, so if that table's constraints
  differ from the 7 columns read during the audit, the audit-trail write **fails
  silently** and the reaper looks healthy while logging nothing.
- `cloud_ops_events` has **no deploy event class**, so this worker cannot record its own
  deployment — a future auditor cannot tell from D1 when it went live.
- This worker does **not** fix the upstream cause of D19 (an uninstrumented throw in the
  runner's catch block). It only labels the corpse.
