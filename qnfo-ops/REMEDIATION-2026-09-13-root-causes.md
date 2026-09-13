# Fleet Error Root Causes — 2026-09-13

Addendum to `qnfo-ops/REMEDIATION-2026-09-13-fleet-errors.md`. Each item is a *resolved* root
cause with a discriminating test that excludes the alternative hypothesis.

## E1 (P0) — trace-ingestion CURSOR STALL; the producer is healthy

**Root cause:** `trace_ingest_state.last_key` is pinned at
`workers_trace/20260910/20260910T101640Z_20260910T101725Z_a05671da.log.gz`
and has not advanced since **2026-09-10T10:17:25Z**.

| surface | observation | verdict |
|---|---|---|
| R2 `workers_trace/` (producer) | objects for 09-10/11/12/13; newest upload **2026-09-13T14:06:53Z** | HEALTHY |
| `trace_ingest_state.last_key` (cursor) | pinned at `...20260910T101725Z...` | **STUCK** |
| `worker_logs` (consumer output) | 1578 rows, ingest window **09-10T06:18:30Z → 09-10T11:17:40Z** | FROZEN 74.8h |
| `fleet_logpush_sweep` (watchdog) | newest `2026-09-10 07:51:05`, all rows `status="on"` | FROZEN 78.3h, false-green |
| `qnfo-observability` cron | status OK, lastRun **2026-09-13T13:30:57Z** | GREEN (lying) |

**Discriminating test:** a producer outage would leave no R2 objects after 09-10. R2 holds
files uploaded 2026-09-13T14:06:53Z. Producer healthy; consumer stalled. Logpush
misconfiguration and producer outage are both excluded.

**Fix (narrow):** advance/reset the cursor to the newest object; make the ingest loop
resume-from-`last_key` with error backoff; add a **cursor-age alarm** (page if the cursor's
age > 2h). No producer-side change required. Until this lands, 74.8h of telemetry sits
unconsumed in R2 and no per-request wall/cpu/status data exists.

## E7 (P1) — health probe builds a nonexistent `.internal` host

`worker_invocations` rows 88–90, all `created_at = 2026-09-13T03:05:38.245Z`:

```
personal-api-chat   https://personal-api.internal/v1/chat/completions  -> 530,   5ms
qnfo-ai-chat        https://qnfo-ai.internal/v1/chat/completions       -> 530,   5ms
qnfo-idea-factory   https://ideas.qnfo.org/health                      -> 200,  49ms
```

530 in 5ms is an instant DNS/route failure — `.internal` does not resolve. The control row
using a real hostname returns 200, and internal service bindings return 200 for both workers.
**The 12h `worker-health FAILED` alerts (03:05 / 15:05) are false.** Fix the probe's URL
construction, or probe via the service binding.

## E10 (P1) — zenodo_stats dead ~15 days

`zenodo_stats` newest `updated_at = 2026-08-29 07:04:24` (`fetched_at = 20260829`); no newer
row exists. The 2026-09-12T07:01:21 run logged `{"fetched":0,"errors":218,"corpus":218}`.
A uniform 100% failure across 218 records indicates credential/quota/endpoint, not
per-record errors.

## Issue 677 — premise no longer holds

`version_queue` now reads **published 16, publishing 1 — zero error rows.**
Row 18 (`10.5281/zenodo.22706406`, 2.0.1 → 2.0.2): `error` (05:21:30) → `drafted` (14:05:07)
→ **`publishing`** (14:11:17), `recover_count` 1, `new_doi = 10.5281/zenodo.22732639`.
The purge-fix/rearm path recovered it unaided.

Ticket 677's title and the dashboard `queue_version` audit ("drafted=0 error=1 … ERROR=1
publish failure") are both stale — the dashboard was stamped 14:01:38, after row 18 had
already left `error`. **No available tool can close 677:** `ops_issue_run` auto-closes only
health-availability rows with a probe target; a `zenodo-publish` row has none
(it reports `"no probe target"`). Needs a manual close or a drain rule for
"described condition no longer holds".

## E3 (P0) — root cause is the source fetch, not the ensemble stage

`research_queue` grouped by status/stage/context:

| status | n | context |
|---|---|---|
| failed | 2 | `{"pipeline":"0.8.0-artifact-deposit","bibCount":0,"srcFetched":false}` |
| pending | 1 | `{"pipeline":"0.8.0-artifact-deposit","bibCount":1,"srcFetched":true}` |
| published | 19 | the paper body markdown (semantics shift by stage) |

The only row that progressed carries `srcFetched:true`; both terminal failures carry
`srcFetched:false`. Retries can succeed (a published row exists at `attempt:2,
recover_count:1`), so the discriminator is the source fetch, not the ensemble stage.
**Fix the source-fetch stage; fail legs fast on source error.**

## Backlog reality check

3 open of 686 — closed 320 / resolved 105 / wontfix 258.
**677 is obsolete; 687 and 688 are two tickets for one unresolved root cause (E3).**
