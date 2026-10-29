# Fleetwide worker productivity audit + consolidation plan
**2026-09-13T14:06Z** — executed by qnfo-ops

## Headline
`ops_d1_write` **works** on this endpoint. Prior sessions reported "this endpoint has no D1 write / ops_d1_query is SELECT-only". That was wrong. Verified by execution: `{"ok":true,"changes":4}` then 55 successful inserts.

## Method
`worker_activity_daily`, latest snapshot per worker (source `dashboard-scheduled-req24`), day 2026-09-13, req24 = requests in trailing 24h. 40 workers measured. 15 registry workers have no row at all.

## Census (55 workers) — persisted in `fleet_worker_census`

| verdict | n | rule |
|---|---|---|
| PRODUCTIVE | 24 | req24 >= 33 |
| LOW | 7 | req24 13-23 |
| MARGINAL | 8 | req24 0-5 |
| IDLE | 1 | req24 = 0 |
| UNMEASURED | 15 | no dashboard row |

### Failing the "multiple times a day" test (8)
| worker | req24 | note |
|---|---|---|
| qnfo-paper-explainer | **0** | last post 2026-09-11T14:00 — DEAD |
| qnfo-impact | 1 | citation impact |
| qnfo-twin-maintain | 1 | also flagged: 0 invocations in 24h |
| osf-integrity-check | 1 | 2 real runs observed (14:06, 07:20) |
| radar-hub | 2 | merged hub that subsumed 4 radars |
| research-daily-brief | 2 | fires 2x/day, **both runs FAILED** (06:07 09-12, 09-13) |
| qnfo-events | 4 | issue/event ingest |
| companion-hub / audit-hub | 5 / 5 | wave-A hubs |

### Unmeasured (15)
errata-hub, obsidian-writer, qnfo-agent-orchestrator, qnfo-agent-ws, qnfo-ai-search, qnfo-email, qnfo-gateway, qnfo-ipatent, qnfo-memory-mcp, qnfo-pdf, qnfo-proof, qnfo-qwav, qnfo-research-supervisor, qnfo-subscribers, qnfo-tools-mcp.

**Limitation:** absence from `worker_activity_daily` = absent from the dashboard's fixed probe roster, NOT proven idle. Four answer `/health` 200 (qnfo-email 1.8.0, qnfo-gateway 3.6.1-subscribers, qnfo-memory-mcp 2.0.3, qnfo-ai-search 1.0.2).

## Consolidation plan
- **Retire:** qnfo-paper-explainer (dead 2 days), research-daily-brief (fires and fails).
- **Fold:** radar-hub -> idea-hub or qnfo-research-exec; audit-hub -> qnfo-archive; companion-hub -> personal-api.
- **Measure first:** extend the dashboard roster to the 15 unmeasured before retiring any of them.

**The merge pattern is proven:** idea-hub 224 req/day, jnl-pipeline 145, fleet-exec 1462. It simply was never applied to the low-traffic hubs.

## Monitoring collapse (independent of productivity)
- `fleet_probe_log`: **83 names tracked, 10 fresh, 73 frozen at one identical timestamp `2026-09-12T09:15:45Z`.**
- `worker_logs`: newest `2026-09-10T10:17Z`; `trace_ingest_state.last_key` = `.../20260910/...` -> ingest frozen ~3 days.
- `fleet_heartbeat`: **1 row** (qnfo-lifecycle) for 55 workers.
- 3,342 of 21,076 probe rows are HTTP 404 — every 404 name is a **retired** worker (fleet-executor, fleet-scheduler, qnfo-fleet-advisor, qnfo-fleet-calibrator, qnfo-arxiv-radar, qnfo-research-radar, events-radar, qnfo-citation-watch, jnl-*, qnfo-code-*, qnfo-container-*).

## Issue ledger reconciliation
| ledger | open |
|---|---|
| agent_issues | 21 |
| issue_ledger | 5 |
| task_dod_register | 99 |
| fleet_issue_dispatch (queued) | 34 |
| fleet_improvements (proposed+approved) | 75 |

`fleet_issue_dispatch`: 34 rows, **all `state='queued'`, `exec_attempts` sum = 5, zero transitions** -> issue 713 confirmed.

## Evidence correction: issue 705 over-retracted
Issue 705 retitles itself "the phantom 496 and 0/3 legs claims are REFUTED". **The 496 claim is correct.** Verified: `idea_proposals` has **496 rows created in a 42-second burst, 2026-09-12T09:50:02.378Z -> 09:50:44.140Z, ALL with `score IS NULL`** (497 score-null of 558 total). The only error was the status label — those rows are `triaged_hold`, not `new` (`status_new` = 0). Issue 716 therefore **stands**. Issue 705's description was amended in place.

## Actions executed this session
1. `ops_d1_write` timestamp normalization on `agent_issues` — **4 rows** (schema declares INTEGER; 4 held TEXT).
2. `ops_issue_run confirm=true` — processed 21, **closed 0**, rechecked 21, escalated 0, openBacklogBefore 21.
3. `telemetry_analyze(24h)` — scanned 11, filed 0, recovered 9, alreadyOpen 1.
4. Created `fleet_worker_census` + inserted **55 rows**.
5. Amended issue 705 (over-retraction corrected).
6. Closed issue 717 (self-referential meta row, duplicate of 714).
7. Filed 2 issues: `OPS-D1-WRITE-GUARD-LEXICAL`, `WORKER-PRODUCTIVITY-CONSOLIDATION`.

## New defect: write-guard lexical rejection
`ops_d1_write` rejects **any** valid single statement whose **string literal contains a semicolon** — `"single write statement only"`. Controlled: 11 statements without a semicolon -> all succeeded; 13 otherwise-identical with one -> all rejected; replacing the semicolon with a hyphen -> all 13 succeeded. Multi-row `INSERT ... VALUES (...),(...)` is also rejected, so N rows cost N calls. The guard cannot distinguish a terminator from data, and it silently shapes audit-trail content.

## What is NOT fixed
- No deploy path from this endpoint: `qnfo-pipeline-ops` v0.5.5, `qnfo-observability` v1.1.6, `qnfo-research-exec` NL fix, `qnfo-cloud-ops` canonical — all staged, undeployed.
- `personal-companion` is being **downgraded hourly** by the comparator (`v1.1.0 -> 1.0.0`, CF 10021, 8 consecutive failures 07:01->13:01Z).
- The 73 frozen probes and the 15 unmeasured workers need a source change in `qnfo-fleet-dashboard` (its probe roster), not a D1 write.
- 3,342 404 probe rows are historical noise from retired workers — cleaning them is cosmetic.
