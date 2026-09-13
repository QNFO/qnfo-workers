# FLEET PRUNE + CONSOLIDATE — EXECUTION RECORD
2026-09-13 ~14:30Z | executor: qnfo-ops (ops-exec) | DB: QNFO_AUDIT

This is an EXECUTION record, not another analysis. Every row below was a tool call whose
result is quoted. Companion artifacts: ops-workspace `fleet-consolidation/2026-09-13-PLAN.md`
and `r2:qnfo-audit/fleet-consolidation/2026-09-13-plan-and-evidence.md`.

## 1. ACTIONS EXECUTED (verified same-turn)
| # | statement | target | returned |
|---|---|---|---|
| 1 | `DELETE FROM worker_activity_daily WHERE worker_name IN (<25 ghosts>)` | worker_activity_daily | `changes=1050` |
| 2 | UPDATE canonical ticket 736 with 4 absorbed facets | agent_issues | `changes=1` |
| 3 | `SET status='closed'` on 728,730,732,733 | agent_issues | `changes=4` |
| 4 | INSERT REGISTRY-STATE-CONTRADICTS-DEPLOYMENT | agent_issues | `changes=1`, id 750 |
| 5 | UPDATE ticket 721 with module-set root cause | agent_issues | `changes=1` |
| 6 | `ops_issue_run` drain (confirm=true) | qnfo-backlog-exec v1.2.8 | `processed=40 closed=0 rechecked=40 escalated=0` |
| 7 | `telemetry_analyze` 24h | self-heal | `scanned=12 persistent=[] recovered=11 filed=0` |

Post-state: `worker_activity_daily` 3331 rows/65 names -> **2281 rows/40 names**.
`agent_issues` open **42 -> 38** net (4 closed, 1 filed).

## 2. THE PREMISE THAT WAS WRONG
"Too many workers doing too little work — prune and merge them." The measurement says the
merge already happened. All 25 zero-traffic names in the activity ledger are **absent from
the 55-worker deployed roster** (intersection = 0, computed in `run_code`). They are the
pre-merge sources of hubs that now exist and are deployed:

| ghost names | merge target, deployed |
|---|---|
| events-radar, qnfo-arxiv-radar, qnfo-research-radar, qnfo-citation-watch | `radar-hub` |
| qnfo-fleet-advisor, qnfo-fleet-calibrator, qnfo-fleet-deploy | `qnfo-fleet-control` |
| fleet-scheduler + executor | `fleet-exec` |
| qnfo-errata-watch/publish/respond | `errata-hub` |
| qnfo-idea-miner, qnfo-idea-triage | `idea-hub` |
| jnl-watch, jnl-referee | `jnl-pipeline` |

So the defect was never "un-merged workers". It was an **uncleaned measurement table**, which
is why successive audits keep re-deriving the same ghost roster. P1 fixed the table, not the
fleet. There was nothing on that axis left to merge.

## 3. WHAT IS ACTUALLY IDLE (measured, not inferred)
`fleet_worker_census` — a live register written 2026-09-13T14:25:55Z — already scores workers:
`PRODUCTIVE / DEGRADED / FIRING-NO-OUTPUT / DAILY-ONLY / LOW-YIELD`.

Non-PRODUCTIVE: qnfo-research-exec DEGRADED, qnfo-observability DEGRADED, radar-hub DEGRADED,
research-daily-brief DEGRADED, qnfo-ddocs-indexer FIRING-NO-OUTPUT, qnfo-paper-explainer
FIRING-NO-OUTPUT, qnfo-impact DAILY-ONLY, qnfo-twin-maintain DAILY-ONLY, audit-hub LOW-YIELD,
companion-hub LOW-YIELD, qnfo-events LOW-YIELD.

**15 of 55 deployed workers have no activity row at all** — unmeasurable, not proven idle:
errata-hub, obsidian-writer, qnfo-agent-orchestrator, qnfo-agent-ws, qnfo-ai-search, qnfo-email,
qnfo-gateway, qnfo-ipatent, qnfo-memory-mcp, qnfo-pdf, qnfo-proof, qnfo-qwav,
qnfo-research-supervisor, qnfo-subscribers, qnfo-tools-mcp.
qnfo-gateway and qnfo-subscribers serve public traffic and legitimately have no cron — merging
them on this evidence would be an error.

## 4. THE ONE TRUE NO-OP — AND THE PREMISE IT REFUTES
`demo-heartbeat` (cron_name `demo-heartbeat-minutely`) fires **every 15 min** and returns
`{"type":"sql","rows":1,"sample":[{"beat":1}]}` — a literal `SELECT 1 AS beat`. ~96 fires/day,
zero output. Confirmed across fleet_runs 14:15, 14:00, 13:45, 13:30, 13:15.

**Refuted:** issue 732's framing that the fleet's scheduled fires "produce zero output by
construction". `systems-watch-hourly` also reports `rows=0` on all 8 steps — but that is
*correct* behaviour for a threshold guard: each step is `INSERT ... WHERE <threshold breached>`,
so `rows=0` means no threshold was breached. A guard that finds nothing is working. Only
demo-heartbeat is a genuine no-op.

demo-heartbeat **cannot** be pruned from this endpoint: it has no row in `fleet_tasks` (7 rows)
and no row in `fleet_crons` (4 rows), so its schedule lives in a worker's wrangler triggers.
Deleting a task row would leave a firing cron with no task — worse than the no-op.

## 5. ROOT CAUSES DETERMINED THIS TURN
**REGISTRY-BASE-URL-DEAD (739) — root cause found.** `https://qnfo-ai.q08.workers.dev/health`
-> HTTP 404 and `https://qnfo-ops.q08.workers.dev/health` -> HTTP 404, while `https://qnfo.org`
-> 200 and `https://reading.q08.org/health` -> 200. The workers.dev subdomain is not serving;
**custom domains do serve**. All 55 registry `base_url` values are therefore structurally
unprobeable. This is a URL-scheme defect, not 55 broken workers.

**qnfo-observability redeploy — root cause sharpened.** `fleet_deploys` id 76, 14:04:01Z:
1.1.3 -> 1.1.4 FAILED `ok=0`, HTTP 400 code 10021
`Uncaught Error: No such module "fleet.js" imported from worker.js`.
The canonical artifact `r2:qnfo-canonical/qnfo-observability.js` is **single-file** while the
live worker is **multi-module** — so every redeploy from canonical fails 10021 until the module
set is staged together. This is a module-set defect, not merely the version conflict of 721.

**The deploy mechanism is real and was active today.** `fleet_deploys` id 75, 14:02:44Z:
`qnfo-backlog-exec 1.2.7 -> 1.2.8` `ok=1` from `r2:qnfo-canonical/qnfo-backlog-exec.js`.
id 67: `qnfo-social 0.5.2 -> 0.5.3` `ok=1`.

## 6. A CLAIM OF MINE THAT DIED
I planned to fix registry drift `qnfo-backlog-exec 1.2.7 -> 1.2.8`. The UPDATE returned
**`changes=0`** — the value was already `1.2.8` (`updated_at 2026-09-13 14:27:56`). The deployer
had fixed it at 14:02:44 and post-deploy self-registration refreshed the row one minute before
my write. My 14:26 snapshot was stale. **Not claimed as my fix.**

Residual registry drift that is real: **6 rows carry `state='merged'` while still deployed and
serving** — qnfo-backlog-exec 1.2.8, qnfo-paper-explainer 0.2.0, qnfo-paper-indexer 2.2.0,
qnfo-pdf 1.0.0, qnfo-research-exec 0.8.1, qnfo-research-supervisor 1.1.1. Filed as **750**.
**Not state-flipped**: the reading is ambiguous (absorbed-others vs forward-retire-marker), and
a wrong flip either mislabels a live worker or authorises a retire that breaks the version_queue
drain, paper indexing and PDF rendering.

Live drift-scanner corroboration: `fleet_drift_report` id 1708, 14:05:46Z —
`scanned=55 clean=33 drifted=9 ahead=9 healed=1 errors=0 staleCanon=4 healthVer=10
errKinds={version-format:14, stale-canon:4, health-ver:10} regOpen=99 regOverdue=26`.

## 7. COST — MEASURED, AND THE QUESTION IS NOT ANSWERABLE AS POSED
`cf_analytics` 30d: 1,132,021 neurons, est_cost_usd **12.45**, 281,106 requests, 187 errors.
Per-worker attribution is **not available**: `by_worker` returns 8 named workers plus
`__unknown__ 20380` against a 281,106 total. No per-worker cost claim can be made from this
data. Only defensible statement: total fleet AI spend is ~$12.45/30d.

## 8. THE DRAIN DOES NOT REPAIR
`ops_issue_run` (confirm=true): `openBacklogBefore=44, processed=40, closed=0, rechecked=40,
escalated=0, noiseClosed=0, ledgerResolved=0`. It re-probes 40 tickets and closes none. It is a
recheck loop, not a repair loop — consistent with the 42-open backlog surviving every drain.

## 9. BLOCKED — exact blocker
Merge/prune/deploy requires writing canonical source into R2 bucket **qnfo-canonical** and
triggering **qnfo-fleet-control**. This endpoint's four bound R2 buckets are `releases, audit,
backups, skills` — **qnfo-canonical is absent**. qnfo-fleet-control's registry `base_url` sits on
the non-serving workers.dev subdomain, so it is unreachable by HTTP too. The write surface *and*
the trigger are both outside this endpoint's grant. The healer is additionally off:
`fleet_deploy_state enabled=0, auto_heal=0` (14:26:29Z / 14:23:10Z).

## 10. FAILURE MODES OF THIS RECORD
1. **Concurrency.** Sibling ops jobs wrote the same tables during this session: the registry row
   for qnfo-backlog-exec changed under me, and agent_issues open moved 42 -> 44 -> 38. Every
   count here is a point-in-time read.
2. **Unresolved semantics.** If `merged` means "absorbed others", ticket 750 is a labelling bug.
   If it means "scheduled for retirement", 750 is a near-miss that would have been an outage.
3. **Unmeasurable != idle.** The 15 unmeasured workers may be productive; nothing here proves
   otherwise.
4. **P1 deleted rows** are recoverable only from the ghost roster recorded in the R2 artifact,
   not from D1.
5. **I deployed nothing and merged nothing.** Sections 4-9 are diagnosis plus a queue.
6. **This file adds to documentation sprawl** tracked by open issue 737 (~55 artifacts in
   `docs/` for 2026-09-13). It is justified only as the execution record of the writes above.
