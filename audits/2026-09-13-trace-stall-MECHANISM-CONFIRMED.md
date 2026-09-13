# TRACE-STALL: MECHANISM CONFIRMED AT SOURCE
Discharges the "required next step" in `2026-09-13-trace-stall-root-cause-CORRECTION.md`.
Confirmed 2026-09-13 by qnfo-ops. Source: `QNFO/qnfo-workers/qnfo-observability/worker.js`
(37,386 B, sha `c72736a82865c4ea4c1027ef67e62ea0f05b9850`), VERSION `1.1.6-single-module`.

> ## ⚠ CORRECTION ADDED 2026-09-13 — READ THIS FIRST
> **The source I diagnosed is NOT the code that is running.**
> Every digest row the worker writes reports `version: '1.1.3'` (sampled 2026-09-11T09:17Z through
> 2026-09-13T14:18Z). The repo file I read is `1.1.6-single-module`. So the exact `list(...)` line
> quoted below is from a revision that is **not deployed**.
>
> The mechanism is **corroborated** by (i) behaviour — `files: 0` for 51h straight, cursor frozen,
> `errors: 0` — and (ii) `apply-observability-ingest-fix.mjs`, written by an earlier session, which
> independently quotes the live-1.1.3 diagnostic and carries the same anchor. It is **not proven
> against the deployed bundle**, and 1.1.3 may differ in exactly the place that matters: the cursor
> write.
>
> **Do not patch against the 1.1.6 anchor without first reading the deployed 1.1.3 bundle.**
> `apply-observability-ingest-fix.mjs` fails closed on an anchor mismatch, which is the correct
> safety property — run it with `--check` against the real deploy target first.
>
> Also: the deployed 1.1.3 carries the **old ~80-name** pre-consolidation `FLEET` list. Every run
> reports `workers_silent_24h` with **80** entries. The 1.1.6 fix (regenerated 55-name list) is
> undeployed, so the observability layer's own coverage metric measures against a roster that has
> not existed since the 2026-09-12 ghost-retirement reconciliation.

## THE BUG (verbatim from `ingestTrace`, in the 1.1.6 revision)
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
From the worker's own diagnostic — `cloud_ops_events`, `kind='fleet-observability-digest'`, `meta.ingest`.
`version` is `1.1.3` in every row:

| ts | files | inserted | dupes | errors | lastKey |
|---|---|---|---|---|---|
| 2026-09-11T09:17:45Z | 0 | 0 | 0 | 0 | `…20260910T101640Z_…` |
| 2026-09-11T10:17:45Z | 0 | 0 | 0 | 0 | (same) |
| 2026-09-11T11:17:45Z | 0 | 0 | 0 | 0 | (same) |
| 2026-09-11T12:17:45Z | 0 | 0 | 0 | 0 | (same) |
| 2026-09-11T13:17:45Z | 0 | 0 | 0 | 0 | (same) |
| 2026-09-11T14:17:30Z | 0 | 0 | 0 | 0 | (same) |
| 2026-09-12T06:58:50Z | 0 | 0 | 0 | 0 | (same) |
| 2026-09-13T14:18:13Z | **264** | 0 | **1045** | 0 | (same) |

`list()` succeeded (`errors: 0`) and **nothing advanced the cursor across 8 runs spanning ~53h**.

The 2026-09-11T09:17:45Z row is the last healthy one: `seen: 26`, `silent: 54`,
`total_events_24h: 304`. One hour later it was `seen: 0`, `silent: 80`, `total_events_24h: 0` —
the 24h window had rolled past the last populated window (`worker_logs` covers only
2026-09-10T06:18:30Z..11:17:40Z). Same stall, seen from the digest side.

## UNEXPLAINED ANOMALY — NARROWED, NOT RESOLVED
The latest run reports `files: 264` with `dupes: 1045` and `errors: 0`, yet `lastKey` is **still the
old cursor**. The 1.1.6 code path sets `lastKey = key` inside the per-file loop after the line
inserts, and flushes `setCursor` every 25 files. A run that parsed ~1045 lines (all dupes) should
therefore have advanced `lastKey`. Three candidates, now adjudicated:

- **(c) RULED OUT.** The head of R2 prefix `workers_trace/` was listed at 14:29Z and is **unchanged**:
  `workers_trace/00010101/test.txt.gz` (uploaded 2026-09-06T17:34:04.773Z), then
  `workers_trace/20260906/20260906T180140Z_…` (2026-09-06T18:02:55.502Z). The oldest objects still
  exist, so the first-1000-key page has not shifted forward by lifecycle expiry. The page is stable,
  so `files` should still be 0 — yet it was 264.
- **(b) CONFIRMED — leading explanation.** Deployed `1.1.3` ≠ repo `1.1.6`. The running ingest loop
  is a revision I have not read. If 1.1.3 lacks or mis-places the per-file `lastKey = key`, you get
  exactly `files>0, dupes>0, errors:0, lastKey frozen`.
- **(a) still possible, but weak.** A cut-short run cannot explain a written digest, because
  `digest()` runs only after `ingestTrace()` returns.

**Treat the mechanism as corroborated and this specific run as unresolved pending a read of the
deployed 1.1.3 bundle.**

## SEPARATE DEFECT: THE DIGEST CADENCE DOES NOT MATCH ITS DECLARED CRON
Declared cron is `17 * * * *`. Observed digest rows: 09-11 at 09:17, 10:17, 11:17, 12:17, 13:17,
14:17 (hourly), then a single 09-12T06:58:50Z, then a single 09-13T14:18:13Z. The hourly handler ran
hourly on 09-11 and then **nearly stopped for ~47h**. `scheduled()` calls
`ingestTrace -> digest -> assessIntegration`, so a missing digest means the **whole observability
cron did not run**. Cause undiagnosed (the live bundle is not readable from the ops endpoint).
**This is the watchdog that should have caught the ingest stall, and it is itself intermittent.**

## CONSEQUENCE
`worker_logs` holds 1,578 rows covering one ~5h window (2026-09-10T06:18:30Z .. 2026-09-10T11:17:40Z).
No per-request wall/cpu/status telemetry for ~76h. The `DELETE ... WHERE ts_ms < ?` retention sweep
also runs against that stale column, so it sees only the old window.
