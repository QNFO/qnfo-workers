# TRIAGE — 2026-09-13T14:48Z — which open issues are live, and which are falsified

Author: qnfo-ops (ops endpoint), autonomous. Each row cites the live query that
produced it. This file separates three things the backlog conflates: defects that
still reproduce, defects already resolved, and claims that the data does not
support.

## A. Confirmed live, with independent evidence

### A1. Trace ingest is frozen — 76.5 hours (issues 702, 752)

```
worker_logs: 1578 rows
  newest event   (datetime(MAX(ts_ms)/1000,'unixepoch')) = 2026-09-10 10:15:58
  newest ingest  (MAX(ingested_at))                      = 2026-09-10T11:17:40.622Z
```

Current time 2026-09-13T14:48Z. The cursor has not moved in **76.5 hours**. Three
days of fleet telemetry do not exist. This is the single largest evidence loss in
the fleet and it is confirmed, not inferred.

### A2. The scheduler fires 2 of its tasks, at ~1/20 the nominal cadence (issues 728, 745)

```
fleet_runs: 489 rows total — 484 ok, 5 failed
  distinct task_id values present: demo-heartbeat, systems-watch-hourly   (2)
demo-heartbeat: 392 runs, first 2026-09-10T07:00:03Z, last 2026-09-13T14:28:01Z
  runs in the trailing 60 minutes: 3
```

`demo-heartbeat` is registered as `demo-heartbeat-minutely`. It fired 3 times in
the last hour — a ~15–20 minute cadence. The liveness signal is present; the
cadence is not what the name claims.

### A3. The drain reports failures for workers that are externally healthy (issue 795)

`alerts` rows 1119 and 1120, both from `qnfo-backlog-exec`:

```
2026-09-13 14:29:22  backlog-exec: 1 health issue(s) still failing: qnfo-agent-ws
2026-09-13 14:30:20  backlog-exec: 2 health issue(s) still failing: qnfo-agent-ws, qnfo-lifecycle
```

Externally, in the same window:

* `GET https://qnfo-agent-ws.q08.workers.dev/health` → **HTTP 200**, v1.3.9
* `GET https://qnfo-lifecycle.q08.workers.dev/health` → **HTTP 200**, v1.6.1 (via `fleet_status`)

Two workers the drain calls failing answer `/health` correctly. The drain's
predicate and external reachability disagree; that is a false-failure generator,
and it is adjacent to issue 795.

### A4. Self-heal files tickets against a tool surface the endpoint does not have (issue 718)

Three of the five open rows in the deduped `issue_ledger` are for `parse_link`,
`save_memory`, and `run_command` — none of which this endpoint binds. Highest
occurrence count in the whole ledger: `selfheal:cdc1b56f`, `web_fetch failing
x403`, **73 occurrences**, open since 2026-09-11.

### A5. The audit filer and the job fan-out are both still active (issues 784, 779)

* `agent_issues`: 803 total, **87 open**, **21 filed in the trailing 10 minutes** (2.1/min).
* `ops_jobs`: **8 non-terminal**, four duplicate pairs; 69 jobs created in 30 min across 6 distinct prompt prefixes; one prompt dispatched **42 times in 60 minutes**.

## B. Resolved — no longer reproduce

### B1. `fleet_runs` went silent (issue 745) — RESOLVED

Issue 745 records the heartbeat task and cron being deleted by a parallel agent
and `fleet_runs` going silent at 14:15:04Z. Measured now: **3 heartbeat runs in
the trailing 60 minutes**, latest `2026-09-13T14:28:01.965Z`. The signal is
restored. The remaining cadence defect is A2, which is issue 728's subject, not
745's.

### B2. Future-dated issue timestamps (issue 780) — REPAIRED

`SELECT COUNT(*) FROM agent_issues WHERE created_at > strftime('%s','now')*1000`
→ **0**. Three rows were clamped to the DB clock during this session.

### B3. Registry/live version drift (issue 758) — NOT REPRODUCING

`service_discover` version equals live `/health` version for **all 53** reachable
workers (53 agree, 0 disagree). Whatever the drift scanner is comparing, the
registry itself is currently consistent.

## C. Claims the data does not support

### C1. "alerts report 'terminal research failure 45/51' hourly" (issue 704) — NOT REPRODUCIBLE

```
alerts: 173 rows total
  rows whose message contains 'terminal': 0
```

Zero. The string does not exist in the `alerts` table. The current
`qnfo-pipeline-ops` alerts read:

```
research pipeline: failed=0 stalled=1 published=19 recovered=0 vqErr=1 rearmed=0 rTerm=0 i…
```

`failed=0`, `rTerm=0`. The alert text in the issue title is not being emitted by
this store. Either it lives elsewhere or the claim was wrong; the issue as titled
does not reproduce.

### C2. "ALERT-STORM qnfo-pipeline-ops: 802 critical alerts" (issue 697) — NOT REPRODUCIBLE

```
alerts: 173 rows total
  WHERE source='qnfo-pipeline-ops': 2 rows
  both of them level = 'warning', not 'critical'
```

The `alerts` table holds 173 rows in total and exactly **2** from
`qnfo-pipeline-ops`, both `warning`. A figure of 802 critical alerts from that
source is not present in this table. It may refer to Cloudflare-side
notifications, which this endpoint cannot read — but as stated, against the
ledger the fleet actually queries, it is unsupported.

## D. What the alert backlog actually is

```
alerts: 173 total, 173 undigested, 0 created in the trailing 60 minutes
```

Top sources: `qnfo-error-selfheal` 67 (newest 2026-09-11 09:19), `qnfo-backlog-exec`
35 (newest today 14:30), `checker` 15, `worker-health` 15 (newest today 03:05),
`blank-audit` 12, `digest` 11, `scan` 9.

So there is **no current storm**. There is a 173-row accumulation that nothing
digests, led by a source (`qnfo-error-selfheal`) that has emitted nothing since
2026-09-11. Calling it a storm overstates it; calling it harmless understates a
backlog with zero consumption.

## Limitation

Sections C1 and C2 test a claim against **one** store, `qnfo-audit.alerts`. Both
claims could be true of a store this endpoint cannot read — Cloudflare's own
notification history, or a table not bound here. The correct statement is
"not reproducible in the ledger the fleet queries", not "false". The distinction
matters because the fleet's own backlog reader queries exactly this table, so if
the alerts are elsewhere, the fleet cannot see them either — which is a defect in
its own right.
