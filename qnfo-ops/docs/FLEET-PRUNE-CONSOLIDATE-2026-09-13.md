# Fleet prune + consolidation — 2026-09-13

Executed server-side from the qnfo-ops endpoint. Every number below is a read-back, not an estimate.

## P0 — Pre-flight

| signal | value | source |
|---|---|---|
| deployed workers | 55 | `fleet_status.deployedCount` |
| service_registry rows | 55 | registry count — **registry == live count, ghost/unregistered drift = 0** |
| scheduled (cron) workers | 40 | `fleet_dashboard_state.fleet.scheduled` |
| binding-healthy | 12 | `fleet_status.healthyCount` |
| req24 / err24 | 15,730 / 26 | `fleet_dashboard_state.totals` |
| open agent_issues | 41 → 47 | `agent_issues` (grew during this session) |
| self_heal_actions | 1,410 rows, newest 14:01:38Z | `self_heal_actions` |
| fleet_error_state | **0 rows** | the 26 err24 have no per-worker attribution in that ledger |

## P1/P5 — Definition-of-done registry (new tables)

Created `worker_dod` (55 rows, one per live worker) and `worker_consolidation` (18 rows).

`worker_dod` columns: worker, req24, measured, verdict, dod, evidence, status, updated_at.
Distribution: **OK 38 · FIX 8 · MERGE 7 · RETIRE 2**. Measured 40, unmeasured 15.

Every worker now carries a falsifiable definition of done, e.g.
- `qnfo-ai` — "every routed call returns 200 and is logged" → evidence `ai_queries` + binding probe 200 v5.25.1
- `fleet-exec` — "fleet_runs gains a row per due task window" → evidence 198 runs/24h
- `qnfo-backlog-exec` — "agent_issues open count falls or a drain log row is written" → `/health` 200 v1.2.8

### The 8 FIX verdicts (firing but not delivering their outcome)

| worker | req24 | defect |
|---|---|---|
| qnfo-research-exec | 148 | `NL is not defined` blocks version_queue v2-drain since 09-11T12:41Z (issue 706); `{"ok":false,"stage":"ensemble"}` at 14:25:10Z; v2-drain Zenodo 504 at 14:16:11Z |
| qnfo-observability | 143 | trace ingest cursor frozen — `worker_logs` 0 rows/24h |
| qnfo-fleet-dashboard | 355 | 18 err24 (highest in fleet) + probe roster pinned at 10 of 55 |
| jnl-pipeline | 145 | 1 err24, lastRun 14:11:17Z |
| qnfo-ddocs-indexer | 13 | indexed_at frozen at 2026-09-04 by a hardcoded date prefix |
| qnfo-paper-explainer | 0 | paper_explain_log frozen 2026-09-11T14:00:57Z |
| research-daily-brief | 2 | failed 2026-09-13T06:07:35Z, no ticket, no cloud_ops_events row (issue 719) |
| ai-health-prober | 23 | 8 of 20 `ai_model_health` rows report ok on 45h-old evidence (issue 727) |

## P2 — Prune executed and verified

**venue-radar-scan** — a task firing daily and failing 100% of the time:

```
2026-09-11T06:45:27Z  failed  unsupported step type: venue
2026-09-12T06:45:40Z  failed  unsupported step type: venue
2026-09-13T06:45:42Z  failed  unsupported step type: venue
```

The fleet-exec task engine has no `venue` handler. Executed:

- `UPDATE fleet_tasks SET enabled=0 WHERE id='venue-radar-scan'` → changes 1
- `UPDATE fleet_crons SET enabled=0 WHERE id=3` → changes 1
- Verified by read-back at 14:28:49: both `enabled=0`.

Reversible: the definition is retained. Implement the `venue` step type or repoint the task, then re-enable.

## P3 — Consolidation decisions (written, NOT deployed)

18 rows in `worker_consolidation`: **MERGE 7 · FIX 8 · RETIRE 2 · DISABLED 1**.

| worker | action | target | rationale |
|---|---|---|---|
| companion-hub | MERGE | personal-companion | 5 req24, duplicate PERSONAL D1 binding (issue 742) |
| qnfo-twin-maintain | MERGE | personal-api | 1 req24, own dispatcher flagged 0 invocations |
| audit-hub | MERGE | qnfo-observability | 5 req24, both fleet-ops telemetry, lastRun null |
| qnfo-events | MERGE | qnfo-observability | 4 req24, telemetry producer on the same D1 |
| errata-hub | MERGE | jnl-pipeline | 0 measured req24, 15 requests/30d |
| qnfo-impact | MERGE | qnfo-paper-indexer | 1 req24, metrics over the corpus the indexer owns |
| radar-hub | MERGE | qnfo-research-exec | 2 req24, venues 3 of 24 ok with 21 timeouts |
| qnfo-qwav | RETIRE | — | 0 measured requests, legacy API |
| qnfo-research-supervisor | RETIRE | — | STALLED 48h, no cron path, superseded by research-exec */10 |

**Every MERGE and RETIRE is blocked on the same thing: no deploy path.** This endpoint has no `wrangler`, so it cannot change a worker's cron, bindings, or code.

## P4 — Registry corrections executed and verified

| service | was | now | evidence |
|---|---|---|---|
| qnfo-ops | 2.15.7 | **2.15.10** | dashboard binding probe body `version 2.15.10` |
| qnfo-backlog-exec | 1.2.7 | **1.2.8** | `/health` 200 v1.2.8 |
| qnfo-gateway | 3.6.1-subscribers | **3.6.1** | normalized to strict semver, live suffix recorded in `purpose` |

## Blockers (four, all outside this endpoint's bindings)

1. **No deploy path** — blocks all 7 MERGEs, 2 RETIREs and 8 FIXes.
2. **Control-plane write race** — see falsification 3.
3. **`worker_logs` trace ingest dead** — 0 rows/24h, so no worker has real trace evidence.
4. **`fleet_error_state` empty** — the 26 err24 have no per-worker attribution there.

## Falsifications recorded this session

1. **"Deleting the demo-heartbeat fleet_tasks row removed 120+ fires/day"** — false. `fleet_runs` shows demo-heartbeat still firing at */15 (391 runs, newest 14:15:04Z). D1 is not its control plane.
2. **"multi-row INSERT VALUES lists are rejected by the write guard"** (issue 735) — not reproducible. A 2-row VALUES insert and a UNION ALL insert both succeeded. Only the semicolon-in-literal rule reproduced (3 times).
3. **"control-plane edits are durable"** — not reliable. An `enabled=0` write read back as `enabled=1` at 14:27:56, then `enabled=0` at 14:28:49. A concurrent agent session was demonstrably writing the same table (demo-heartbeat row re-created at 14:27:35).

## Red-team

- The disable is verified twice, but the earlier flip means a third flip after my last read cannot be excluded. Re-read `fleet_tasks`/`fleet_crons` before relying on it.
- `worker_dod.req24` values come from a 14:06:21Z snapshot of `worker_activity_daily` — 20+ minutes stale — and the 15 unmeasured workers have no req24 at all. "Unmeasured" is not "idle".
- MERGE verdicts rest on req24 alone for some workers. Low req24 can mean low traffic, not low value: `qnfo-impact` and `osf-integrity-check` at 1/day are legitimately daily.
- `worker_dod` and `worker_consolidation` are new tables with no consumer yet. They become useful only when the deploy loop or an agent reads them, otherwise they are two more dead sinks.
