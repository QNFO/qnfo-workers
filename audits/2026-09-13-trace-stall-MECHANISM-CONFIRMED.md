# TRACE-STALL: MECHANISM CONFIRMED AT SOURCE
Discharges the "required next step" in `2026-09-13-trace-stall-root-cause-CORRECTION.md`.
Confirmed 2026-09-13 by qnfo-ops. Source: `QNFO/qnfo-workers/qnfo-observability/worker.js`
(37,386 B, sha `c72736a82865c4ea4c1027ef67e62ea0f05b9850`), VERSION `1.1.6-single-module`.

## THE BUG (verbatim from `ingestTrace`)
```js
listed = await env.LOGS.list({ prefix: 'workers_trace/', limit: 1000 });
const files = (listed.objects || [])
  .map(o => o.key)
  .filter(k => k.endsWith('.log.gz') && !k.includes('/test'))
  .filter(k => k > cursor)              // <-- cursor is PAST THE END of this page
  .sort().slice(0, INGEST_CAP_FILES);   // INGEST_CAP_FILES = 300
```

R2 list is lexicographic ascending, so `limit: 1000` returns the **first 1000 keys in the
bucket** — not the first 1000 *after the cursor*. There is **no `startAfter`**, and the code
**ignores `listed.truncated`**. Once the cursor advances past the end of that first page,
`.filter(k => k > cursor)` yields nothing, `lastKey === cursor`, so
`if (lastKey !== cursor) await setCursor(...)` never fires and **the cursor is frozen
permanently**. The stall is monotonic: every new day pushes the cursor further past the page,
so it cannot self-recover.

## CORRECT FIX
```js
list({ prefix: 'workers_trace/', startAfter: cursor, limit: 300 })
```
plus pagination on `truncated`. **A cursor reset is neither necessary nor sufficient** — the page
is anchored at the bucket head, not at the cursor. This corrects the "candidate fix" in my earlier
note: bumping `last_key` was the wrong lever, and that is now known from source rather than inferred.

## A FIX PATCHER ALREADY EXISTS IN THIS REPO
`qnfo-observability/apply-observability-ingest-fix.mjs` (9,262 B, sha `fefcf264b364337177015889a621920ceaf782fb`),
written by an earlier ops session. It is idempotent, **fails closed** (writes nothing unless the anchor
matches exactly once), checks brace/paren balance, backs up to `worker.js.bak`, and prints post-deploy
verification + rollback. It carries the identical `A_LIST_OLD`/`A_LIST_NEW` anchor pair.
**It has not been run against the live bundle.**

## EMPIRICAL CONFIRMATION
From the worker's own diagnostic — `cloud_ops_events`, `kind='fleet-observability-digest'`, `meta.ingest`:

| ts | files | inserted | dupes | errors | lastKey |
|---|---|---|---|---|---|
| 2026-09-11T11:17:45Z | 0 | 0 | 0 | 0 | `…20260910T101640Z_…` |
| 2026-09-11T12:17:45Z | 0 | 0 | 0 | 0 | (same) |
| 2026-09-11T13:17:45Z | 0 | 0 | 0 | 0 | (same) |
| 2026-09-11T14:17:30Z | 0 | 0 | 0 | 0 | (same) |
| 2026-09-12T06:58:50Z | 0 | 0 | 0 | 0 | (same) |
| 2026-09-13T14:18:13Z | **264** | 0 | **1045** | 0 | (same) |

`list()` succeeded (`errors: 0`) and **nothing advanced the cursor across 6 runs spanning 51h**.

## UNEXPLAINED ANOMALY — FLAGGED, NOT FORCED INTO THE THEORY
The latest run reports `files: 264` with `dupes: 1045` and `errors: 0`, yet `lastKey` is **still the
old cursor**. The code path sets `lastKey = key` inside the per-file loop after the line inserts, and
flushes `setCursor` every 25 files. A run that parsed ~1045 lines (all dupes) should therefore have
advanced `lastKey`. That combination — files>0, dupes>0, errors:0, lastKey unchanged — is **not
explained by the code as written**. Undistinguished possibilities:

- (a) the run was cut short by the platform before the per-file `lastKey = key` / the final `setCursor`;
- (b) the deployed bundle is not the 1.1.6 shape read here — `fleet_drift_report` id 1702 records
  deployed `1.1.3` vs canonical `1.1.4`, and the patcher's quoted proof carries version `1.1.3`;
- (c) the page composition changed because old `workers_trace` objects were lifecycle-expired,
  shifting the first-1000 window forward to now include post-cursor 20260910 keys.

**Treat the mechanism as confirmed and this specific run as unresolved.**

## SEPARATE DEFECT: THE DIGEST CADENCE DOES NOT MATCH ITS DECLARED CRON
Declared cron is `17 * * * *`. Observed digest rows: 09-11 at 11:17, 12:17, 13:17, 14:17 (hourly),
then a single 09-12T06:58:50Z, then a single 09-13T14:18:13Z. The hourly handler ran hourly on 09-11
and then almost stopped for ~47h. `scheduled()` calls `ingestTrace -> digest -> assessIntegration`,
so a missing digest means the **whole observability cron did not run**. Cause undiagnosed (the live
bundle is not readable from the ops endpoint). **This is the watchdog that should have caught the
ingest stall, and it is itself intermittent.**

## CONSEQUENCE
`worker_logs` holds 1,578 rows covering one ~5h window (2026-09-10T06:18:30Z .. 2026-09-10T11:17:40Z).
No per-request wall/cpu/status telemetry for ~76h. The `DELETE ... WHERE ts_ms < ?` retention sweep
also runs against that stale column, so it sees only the old window.
