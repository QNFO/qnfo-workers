# FLEET PRUNE + CONSOLIDATE — WBS PLAN, EVIDENCE, EXECUTION

Date: 2026-09-13 · Executor: qnfo-ops (ops-exec) · DB: QNFO_AUDIT
Mandate: every worker must execute successfully when fired and have a measurable
outcome / definition-of-done. Workers that fire and produce nothing are cost centres.

> **CORRECTED 2026-09-13.** Two claims in the first revision were wrong and are fixed
> inline below: the measured=0 count (26 -> **15**) and the strength of the base_url
> finding (now evidenced by probe transport). See
> `docs/FLEET-PRUNE-2026-09-13-CORRECTIONS-v2.md` for the diff and reasoning.

---

## 1. VERIFIED PRE-FLIGHT (all values read 2026-09-13 ~14:27Z)

| Fact | Value | Source |
|---|---|---|
| Deployed workers | 55 | fleet_status `deployedCount:55` |
| Healthy (probe pass) | 12 | fleet_status `healthyCount:12` |
| service_registry rows | 55 | service_discover |
| Registry vs live roster diff | **0 both directions** | run_code set-diff |
| Open agent_issues | 44 -> 43 during turn | agent_issues |
| Open backlog (backlog_status) | **42 -> 51 in ~13 min** | backlog_status |
| Census verdicts | 35 PRODUCTIVE / 20 non | fleet_worker_census |
| fleet_tasks enabled | 7 | fleet_tasks |
| fleet_crons rows | **4** | fleet_crons |
| fleet_heartbeat rows | **1** (qnfo-lifecycle only) | fleet_heartbeat |
| fleet_error_state rows | **0** | fleet_error_state |
| Deploy healer | enabled=0, auto_heal=0 | fleet_deploy_state |

**Correction to the premise.** "Every worker must fire multiple times a day" is the
wrong test for 7 of 55. FETCH-ONLY workers (errata-hub, obsidian-writer,
qnfo-agent-orchestrator, qnfo-agent-ws, qnfo-ipatent, qnfo-pdf, qnfo-qwav) are
request-driven by design. Merging them on a fires-per-day test would delete working
infrastructure. The mandate applies to the **13** that are cron/event driven and
producing nothing.

## 2. THE REAL SPLIT (fleet_worker_census, 55 rows)

- PRODUCTIVE 35 (29 measured)
- **FETCH-ONLY 7** — request-driven, not a defect
- **DEGRADED 4** — qnfo-observability (trace ingest frozen 76h), qnfo-research-exec
  (NL ReferenceError blocking v2-drain), radar-hub (21 of 24 timeouts),
  research-daily-brief (failed 09-13T06:07Z)
- **FIRING-NO-OUTPUT 2** — qnfo-ddocs-indexer (indexed_at frozen 09-04, hardcoded date
  prefix), qnfo-paper-explainer (log frozen 09-11T14:00Z, off-domain content)
- **LOW-YIELD 3** — audit-hub 5 req24, companion-hub 5 req24, qnfo-events 4 req24
- **DAILY-ONLY 2** — qnfo-impact 1/day, qnfo-twin-maintain (own dispatcher flagged 0)
- **STALLED 1** — qnfo-research-supervisor, silent 48h, no cron path
- **NOT-YET-FIRED 1** — qnfo-subscribers (weekly Mon 16:00, deployed 09-12) — NOT a defect

Genuinely defective: **7**. Thin: **5**. Misclassified by the premise: **7**.

## 3. WBS PLAN (registered in task_dod_register as QNFO.FLEET.P0..P9)

| WBS | Item | Definition of done |
|---|---|---|
| P0 | PRUNE | census shows 0 FIRING-NO-OUTPUT and 0 STALLED; retired set recorded in service_registry.state; drift_total 0 |
| P1 | CONSOLIDATE | 55 -> 48 workers, no capability removed, registry == live script list, strict-semver VERSION on every hub |
| P2 | MEASURABLE-OUTCOMES | one open DoD row per live worker with non-null evidence_pointer + named sink + fresh freshness_guard signal |
| P3 | INSTRUMENTS | fleet_probe_log covers all 55 per cycle; cf attribution >50%; fleet_heartbeat >1 worker |
| P4 | CIRCUIT-BREAKERS | 0 workers with >3 consecutive reverted-or-rejected; per-target exclusion key in fleet_deploy_state |
| P5 | CALLER-400s | ai_gateway_failures 24h delta 0 for content-shape, tool-args-json, image-input |
| P6 | DEAD-SINKS | each of paper_index, analytics_daily, social_media_posts, fleet_error_state revived or retired with a decision |
| P7 | TASK-ENGINE | every enabled fleet_tasks row has a cron row or explicit manual-only marker; >=1 non-heartbeat outcome row/day |
| P8 | DECISION-PLANE | 0 fleet_issue_dispatch rows queued >24h; >=1 fleet_improvements row reaches deployed |
| P9 | VERIFY | registry count == live script count; 0 version mismatches; drift_total 0 |

## 4. PRUNE / CONSOLIDATE DECISION TABLE

### 4a. RETIRE (no consumer, no output)
| Worker | Evidence | Action |
|---|---|---|
| qnfo-qwav | census reason: "legacy QWAV research API - candidate for retirement" | retire |
| qnfo-research-supervisor | STALLED 48h, no cron path, routes[] empty | retire or fold into research-exec |
| qnfo-fleet-dashboard | probe roster collapsed 83->10, pinned 10 for 27h; registry purpose says "MERGE candidate into fleet-deploy" | merge into fleet-control |

### 4b. MERGE (overlapping capability)
| Group | Members | Target |
|---|---|---|
| personal | personal-api, personal-companion, companion-hub | 1 worker (companion-hub + personal-companion are a verified duplicate pair: identical config constants, same PERSONAL D1) |
| fleet self-monitoring | qnfo-fleet-control, qnfo-cloud-ops, qnfo-observability, ai-health-prober, qnfo-signal-loop, qnfo-autopilot, qnfo-kaizen | 2 (a control plane + an observability plane) |
| ideas | idea-hub | fold into qnfo-intent-orchestrator (ideas ARE intents) |
| errata | errata-hub | fold into jnl-pipeline |
| records | qnfo-impact, qnfo-infra | 1 records API |
| twin | qnfo-twin-maintain | fold into personal worker |

### 4c. FIX, do not merge
qnfo-observability (trace ingest cursor), qnfo-research-exec (NL ReferenceError),
radar-hub (timeout budget), research-daily-brief (06:07Z failure),
qnfo-ddocs-indexer (hardcoded date prefix), qnfo-paper-explainer (log frozen).

### 4d. KEEP — correctly event-driven
qnfo-ai, qnfo-gateway, qnfo-pdf, calendar-api, qnfo-ipatent, qnfo-email,
qnfo-memory-mcp, qnfo-tools-mcp, qnfo-archive, qnfo-email-orchestrator, obsidian-writer,
qnfo-agent-orchestrator, qnfo-agent-ws.

## 5. TASK-ENGINE RECONCILIATION (P7)

7 enabled fleet_tasks vs 4 fleet_crons. Orphans (enabled, no cron, cannot fire):
bench-arc-sample-01, bench-arc-10task, probe-qwen38.

**DO NOT disable them.** Their only runs came through manual cron_name values
(manual-10task-arcagi, manual-bench-01, model-probe), so enabled=1 is likely required
for the manual dispatch path. Disabling would break manual invocation to fix a
cosmetic mismatch. Correct fix: add cron rows or an explicit manual-only marker.

demo-heartbeat: fires 101x/24h as `SELECT 1 AS beat`, is NOT in fleet_tasks and NOT in
fleet_crons (hardcoded in fleet-exec). It is the **only** writer to fleet_runs, and
freshness_guard tracks fleet_runs as a heartbeat signal — so it must not be deleted,
only slowed. Its cron lives in worker config, so this needs a deploy.

Weekly crons: bench-arc-weekly (`0 8 * * 1`) and report-card-weekly (`30 6 * * 1`)
last fired 2026-09-10T12:29/12:32 — a **Thursday**, not their Monday slot. Insufficient
evidence to call them broken: fleet-exec was deployed 2026-09-12, after that date, and
next_fire is 2026-09-14T08:00 (a Monday). Watch, do not ticket.

## 6. EXECUTED THIS TURN (verified)

1. **Closed 6 duplicate tickets** into canonical ones, with evidence preserved in the
   description. Verified: ids 701, 729, 734, 741, 742, 743 all `status=closed` with the
   merge note appended.
   - 701 + 741 + 743 -> **736** (one root: the fleet cannot measure its own workers)
   - 734 -> **727** (ai_model_health status not derived from probe evidence)
   - 742 -> **738** (companion duplicate pair)
   - 729 -> **697** (pipeline-ops invisible)
2. **Registered 10 WBS DoD rows** (QNFO.FLEET.P0..P9) in task_dod_register.
   Verified: all 10 present, status=open.
3. **Attempted a registry version fix — NO-OP, and that is the finding.** I read
   `qnfo-backlog-exec` version as 1.2.7 from service_discover (snapshot ts
   14:01:17Z) and issued `UPDATE ... WHERE version='1.2.7'`. It matched **0 rows**.
   D1 truth at 14:27:56 was already **1.2.8**, and qnfo-ops itself moved 2.15.7 ->
   2.15.10 inside the same session. A background registry refresher converges drift
   faster than an agent can act on it, and `service_discover` serves a stale snapshot.
   The "registry version drift" I reported was transient, not a defect.

## 7. RED-TEAM: HOW THIS ANSWER COULD BE WRONG

- **Aggregate open count barely moved (44 -> 43) despite 6 closures.** Concurrent
  writers closed ~5 and filed ~12 more during the turn. Total rows went 741 -> 752,
  and backlog_status went 42 -> 51. Consolidating tickets cannot outrun the rate at
  which they are created — the generator, not the ledger, is the problem.
- **`state` column is semantically unusable for retirement.** qnfo-backlog-exec and
  qnfo-paper-indexer both carry `state='merged'` while both are LIVE and serving
  /health (200). 'merged' marks provenance, not lifecycle. FLEET-STATE tells me to
  retire ghosts via this column; that would be wrong.
- **The registry base_url is dead.** Verified: `fleet_probe_log.url` is EMPTY and
  `transport='binding'` for every worker row — only the two zone hostnames are probed
  over HTTP. So the registry base_url is never exercised by the fleet's own probe path,
  and my direct fetch of `https://qnfo-ops.q08.workers.dev/health` (HTTP 404, on a
  transport that returns 200 for example.com) stands. Issue 739 is corroborated;
  DoD row 217, which asserts those URLs return 200, is contradicted.
- **Census verdicts are the census's own judgement, not mine.** I did not re-derive
  req24 for all 55; I am relaying fleet_worker_census. **15** of 55 rows have
  `measured=0` (verified: total=55, measured_n=40, unmeasured=15), so a quarter of the
  verdicts rest on unmeasured inputs.
- **cf_analytics attributes 23,971 of 281,106 requests (8.5%)** to named workers, so
  "LOW-YIELD" cannot be distinguished from "unattributed".
- **I cannot deploy, delete a CF script, or create a git branch.** Every P0/P1 merge
  in section 4 is a specification. Nothing in this turn changed the running fleet.
- **The DoD register now has 109 open rows.** Adding 10 improved mandate coverage but
  also added to the sprawl the user is complaining about (see issue 737).

## 8. BLOCKED — needs an actuator this endpoint lacks

| Need | Why blocked |
|---|---|
| Merge/retire any worker | no deploy path, no CF API mutation tool |
| Re-enable deploy healer | fleet_deploy_state write is possible, but there is no per-target exclusion key, so re-enabling also resumes the personal-companion downgrade loop |
| Circuit breaker in self-rewrite | needs a worker deploy |
| Slowing demo-heartbeat | cron lives in worker config |
| Branch + PR | github_pr requires an existing head branch; no ref-creation tool exists |
