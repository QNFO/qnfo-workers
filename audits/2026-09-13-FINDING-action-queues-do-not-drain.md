# FINDING — the fleet detects and plans correctly; its action queues do not drain

Date: 2026-09-13. Author: qnfo-ops. Every count is a tool return from this session.

## The pattern

Across this audit I repeatedly found the same shape: a detection layer that works, a classification
step that produces a concrete remediation, and then **nothing executes**. Stated as one table:

| queue | state | count | evidence |
|---|---|---|---|
| `fleet_issue_dispatch` | `queued`, `exec_attempts = 0` | **6** | all `exec_state`/`exec_ts`/`exec_result` null; oldest queued 2026-09-12T11:14:36 (~27h) |
| `fleet_improvements` | `approved` (not `done`) | **44** | `GROUP BY status` |
| `fleet_improvements` | `proposed` | **31** | ditto |
| `task_dod_register` | `open` | **99** (26 overdue) | 100 done / 99 open / 19 cancelled / 1 in-progress |
| `agent_issues` | `open` | **11** | `backlog_status` |
| `fleet_cal_anomalies` | `open` | **1** (severity `high`) | id 3, open ~36h |
| `version_queue` | `drafted` (drain dead) | **1** | nothing published since 2026-09-11 10:16:31 |

Four independent work queues hold 190+ items in a post-decision, pre-execution state. The bottleneck is
not detection, classification, or planning.

## The detection layer demonstrably works — this is the point

It is worth being precise, because "the fleet is broken" would be the wrong reading. Every layer I
tested **identified its condition correctly and named it**:

| surface | what it correctly reported |
|---|---|
| `fleet_issue_log` `iss-cac511bc` | 24 models, and named **five** as `degraded`, four of which I found independently |
| `fleet_issue_log` `iss-9d0ff956` | named the exact worker (`qnfo-twin-maintain`) **and** caveated its own metric as adaptive-sampled |
| `fleet_issue_log` `iss-313bc84c` | `published 7d=0` — the dead publish drain |
| `fleet_issue_log` `iss-98f1c548` | `trace rows 24h=0` — the TRACE-STALL, with the diagnosis "components may probe green" |
| `fleet_cal_anomalies` id 3 | the deleted `qnfo-auditor` probe, severity `high` |
| `cloud_ops_events` `watch-trace-stall` | the stalled ingest, every 3h, status `err` |
| `fleet_drift_report` SCAN | `drifted=9 ahead=9 staleCanon=4 healthVer=10 errKinds={...}` — the taxonomy, hourly |

The `fleet_issue_dispatch` payloads even carry a machine-readable remediation per item
(`cron-trigger`, `queue-drain`, `model-fallback-pin`, `chain-produce`) plus prose instructions. The
planning is not the gap.

## Two consequences worth naming

1. **"Dispatched" is not a success signal.** `fleet_issue_loop.last_action` reads
   `"stale-escalated"` for five of six items — the loop escalates instead of executing, and
   `dispatch_state = "dispatched"` reports that as progress. This is the same defect class as the
   `ok=1` finding (a deploy that changed nothing) and the `status:"fail"` / `detail:"http=200"` probe:
   **the status field describes the attempt, not the outcome.**
2. **The noise is a symptom.** `fleet_improvements`' open items are dominated by
   `registerWatch()`-filed `P1 hygiene` rows — one per overdue register row, restating the same 26
   tasks (`Register row N OVERDUE (due 2026-09-12, owner agent)`). An action queue that never drains
   accumulates restatements of its own backlog, so queue depth stops being a signal of anything.

## What I could and could not determine

- **Could not:** identify the executor that consumes `fleet_issue_dispatch`. `service_registry` reports
  `fleet-exec` at **1.0.0** ("Merged executor+scheduler (wave A 2->1)"), but the repo's
  `fleet-exec/worker.js` is **v0.3.0** — the pre-merge copy, and it consumes `fleet_tasks`, not
  `fleet_issue_dispatch`. No registry entry has a purpose mentioning that table. So whether an executor
  exists, exists but never runs, or the `exec_*` columns are simply never written **remains open** —
  and it is unreadable from here because the deployed worker is newer than its repo source.
- **Could not:** say whether the 44 `approved` improvements are blocked on a deploy route (plausible,
  given §A2/A4 of the addendum) or on nothing. Both are consistent with the evidence.

## Not fixable from this endpoint

Draining any of these queues requires the executor and its deploy route. The one queue this endpoint
*can* drain — `agent_issues` via `ops_issue_run` — I ran, and it closed 0 of 3 because the remaining
rows are not health-availability types (`no probe target`). That is itself a datapoint: the one
available drain path is narrow by design, and the queues that matter are not behind it.
