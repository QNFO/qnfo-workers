# FINDING — trace-ingest stall is R2 list pagination, proven from the live worker's own log

Date: 2026-09-13 (~14:40Z). Resolves E1 of `qnfo-ops/REMEDIATION-2026-09-13-fleet-errors.md`.
Supersedes the "producer healthy / consumer stalled" framing with a mechanical root cause.

## Proof by elimination

`cloud_ops_events` `kind='fleet-observability-digest'`, three most recent rows
(2026-09-11T13:17 → 2026-09-12T06:58), identical `meta.ingest`:

```json
{"version":"1.1.3",
 "ingest":{"files":0,"inserted":0,"dupes":0,"errors":0,
           "lastKey":"workers_trace/20260910/20260910T101640Z_20260910T101725Z_a05671da.log.gz"},
 "total_events_24h":0,"workers_seen_24h":0}
```

1. R2 holds keys beyond the cursor (`workers_trace/20260913/…T140653Z…`, uploaded 14:06:53Z).
2. The filter is deterministic: `endsWith('.log.gz') && !includes('/test') && k > cursor`.
3. `errors: 0` → `list()` succeeded.
4. `files: 0` → no key passed the filter.
5. ⇒ the listed set contained no key > cursor ⇒ the page was truncated before the cursor.
6. `list({prefix:'workers_trace/', limit:1000})` with no pagination returns the first 1000 keys
   lexicographically ⇒ **≥1000 keys exist at or before the cursor.** ∎

## Mechanism

```js
listed = await env.LOGS.list({ prefix: 'workers_trace/', limit: 1000 });   // one page, no cursor
const files = (listed.objects || [])
  .map(o => o.key)
  .filter(k => k.endsWith('.log.gz') && !k.includes('/test'))
  .filter(k => k > cursor)          // cursor is past the end of this page
  .sort().slice(0, INGEST_CAP_FILES);
```

`INGEST_CAP_FILES = 300` caps processing; the **1000-key page is the real ceiling**. The stall
is **permanent and monotonic** — each new day pushes the cursor further past the first page, so
it can never self-recover.

Measured object counts: `workers_trace/20260910/` → 500+ (truncated);
`workers_trace/20260912/` → 500+ (truncated); `20260908/20260908T00` → 3; `…T12` → 2.
09-08 is anomalously sparse; 09-10 and 09-12 exceed 500/day each.

## Fix

```js
listed = await env.LOGS.list({ prefix: 'workers_trace/', startAfter: cursor, limit: 300 });
```
Plus a cursor-age alarm (page if `trace_ingest_state.last_key` age > 2h) — `fleet_logpush_sweep`,
the watchdog meant to catch this, is itself frozen 78.3h while asserting `"on"`.

## Two further live defects in qnfo-observability 1.1.3

1. **Digest stopped**: `fleet-observability-digest` rows 2026-09-10T06:31:44 → 2026-09-12T06:58:50,
   none for ~35h, while the dashboard reports the cron lastRun 2026-09-13T13:30:57.
2. **Stale FLEET list → false silent-worker reports**: live 1.1.3 reports `workers_seen_24h: 0`
   and lists ~26 retired workers as `workers_silent_24h` (events-radar, fleet-executor,
   fleet-scheduler, jnl-referee, jnl-reviser, jnl-watch, jnl-zenodo, job-market-watch,
   personal-events-radar, personal-life-indexer/maintain/search, qnfo-analytics,
   qnfo-arxiv-radar, …). The repo's `fleet.js` header documents this class; the 1.1.6 fix
   inlines a regenerated 55-name list — not live.

## Version state and a new structural blocker

Live **1.1.3** (digest `meta.version`); repo **1.1.6-single-module** (37,386 B); last deploy
attempt 1.1.3 → **1.1.4** at 14:04:01, rejected (`No such module "fleet.js"`).

`qnfo-observability/worker.js` is now **37,386 B > the 32,768-char read cap**, joining
`qnfo-ops` (161,339 B) as workers that can no longer be re-emitted from this endpoint.

## Correction trail

I hypothesised page overflow, then falsely refuted it from two sparse hour-samples of 09-08
(3 and 2 objects), then re-tested at day granularity (>500/day) and proved it from the worker's
own diagnostic. The intermediate refutation rested on a non-representative sample.
