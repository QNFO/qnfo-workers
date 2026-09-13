# Fleet-wide audit: stale workers, errors, warnings, alerts
Date: 2026-09-13 ~14:25Z | Auditor: qnfo-ops endpoint | All figures from live tool output

## 0. Headline

- **55 workers deployed. 12 respond to a binding health probe. 10 are probed by the
  fleet-dashboard. 45 have no independent liveness probe.**
- **26 open agent_issues (718 lifetime) and the count grew 15 -> 16 -> 21 -> 26 inside a
  single session.** The system files issues faster than it closes them.
- **108 `critical` alerts in the last 24h**, all marked `digested=1` — consumed, no action.
- **The merged task engine runs 10 registered tasks; only 2 actually fire**, and one of them
  is literally `SELECT 1 AS beat`.
- **`worker_logs` trace ingest has been frozen for 76h** (last row 2026-09-10T10:15:58Z).
- **`fleet_issue_dispatch` has 34 rows, every one still `state='queued'`.** Nothing drains.

## 1. Correction to the premise (adversarial finding)

The mandate "every worker must execute multiple times a day or be merged" is **wrong as a
literal rule** and will destroy working infrastructure if applied mechanically.

Roughly a third of the fleet is **correctly event-driven, not scheduled**. A PDF renderer,
an MCP server, a calendar API, a gateway, an email service, and an on-demand model router
*must not* fire on a timer. Their health metric is "does a caller reach it", not "did it run
today". Merging them on a fires-per-day test would break the fleet.

So this audit splits the fleet into three tiers and applies the right test to each:
- **Tier A — scheduled workers.** Test: did it fire, and did firing produce output?
- **Tier B — event-driven services.** Test: is anything calling it?
- **Tier C — no evidence of either.** Test: why does it exist? Merge/delete candidate.

## 2. Tier A — scheduled workers: firing vs producing

Evidence: `cloud_ops_events` job activity (48h), plus each worker's own output table.

| Worker | Fires? | Last output | Verdict |
|---|---|---|---|
| qnfo-kaizen | yes | kaizen_reports 2026-09-13 10:01 | ACTIVE |
| qnfo-social | yes | social_threads 2026-09-13 06:02 | ACTIVE |
| qnfo-signal-loop | yes | signals 2026-09-13 06:01 | ACTIVE |
| radar-hub | yes | events_radar 2026-09-13 05:00 | ACTIVE |
| qnfo-impact | yes | citation_stats/impact_scores 2026-09-13 04:00 | ACTIVE |
| osf-integrity-check | yes | osf_check_log 2026-09-13 14:06 | ACTIVE |
| qnfo-chat-canary | yes | chat_canary 2026-09-13 12:16 | ACTIVE |
| qnfo-ai-calibration | yes (30 min) | ai_calibration_runs every ~30 min | ACTIVE |
| qnfo-research-exec | yes | 618 events/48h | ACTIVE (but NL-not-defined bug, issue #706) |
| qnfo-paper-reviser | yes | paper_revision_log 2026-09-12 16:37 | ACTIVE |
| **qnfo-paper-explainer** | **yes, ERROR today** | **paper_explain_log 2026-09-11; state table 0 rows** | **FIRING, NO OUTPUT** |
| **fleet-exec (task engine)** | yes | only 2 of 10 tasks fire | **DEGRADED** |
| **qnfo-research-supervisor** | **no** | 1 event since 2026-09-11T14:30Z (47.7h) | **STALLED** (issue #703) |
| **qnfo-cloud-ops** | partial | visibility 2 events/48h | **DEPLOY BLOCKED** |
| **qnfo-ddocs-indexer** | — | ddocs_index_state 2026-09-04 (9d) | **STALE** |
| **qnfo-proof** | — | proofs 2026-09-04 (9d) | **STALE** |
| **errata-hub** | — | errata_queue 2026-09-01 (12d) | **STALE** |
| **qnfo-subscribers** | — | subscriber_digest_runs **0 rows ever** | **NEVER RAN** |
| qnfo-outreach | — | outreach_log 2026-09-02 (269.3h) | IDLE **by design** (activates 2026-09-15) |

### The task-engine finding (highest-value)

`fleet_tasks` registers 10 tasks. `fleet_runs` shows only two ever execute:
- `demo-heartbeat`, cron `*/15`, definition `SELECT 1 AS beat` — 480 runs/day producing nothing.
- `systems-watch-hourly`, cron `9 * * * *`, 8 SQL steps — **every step returns `rows: 0`.**

Tasks registered but never firing: `bench-arc-10task`, `bench-arc-battery`,
`bench-arc-sample-01`, `probe-qwen38`, `demo-fleet-census`, `venue-radar-scan`,
`report-card-weekly`, `demo-venue-radar` (disabled).

`fleet_crons` shows `report-card-weekly-cron` last_fired **2026-09-10**, `bench-arc-weekly`
last_fired **2026-09-10** — both weekly crons have missed their window. `fleet_runs` has no
rows for either.

**This is exactly the case the mandate describes: a worker firing and nothing happening.**
`demo-heartbeat` should be deleted; the two weekly crons need repair; `systems-watch-hourly`
runs 8 queries that match zero rows and therefore cannot alert on anything.

## 3. Tier B — event-driven services

| Worker | Evidence | Verdict |
|---|---|---|
| qnfo-ai | /health 200, v5.25.1 | ACTIVE (core) |
| qnfo-ai-search | /health 200, v1.0.2 | ACTIVE |
| qnfo-gateway | /health 200, v3.6.1 | ACTIVE |
| qnfo-archive | /health 200, v1.2.0 | ACTIVE |
| qnfo-lifecycle | /health 200, heartbeat 14:01 | ACTIVE |
| qnfo-memory-mcp | mcp_log 2026-09-13T14:22 | ACTIVE |
| qnfo-email / -orchestrator | email-triage 12:01 | ACTIVE |
| qnfo-paper-indexer | /health 200, 529 papers | ACTIVE |
| qnfo-skill-sync | /health 200, v1.1.2 | ACTIVE |
| qnfo-pdf | on-demand by design | OK |
| calendar-api | calendar 33 rows | OK (low use) |
| qnfo-ipatent | ipatent_submissions **0 rows** | OK if app unused — verify |
| qnfo-twin-maintain | 16 requests/30d | LOW |
| qnfo-tools-mcp | registry-listed | UNVERIFIED |
| qnfo-agent-ws / -orchestrator | no invocation evidence | UNVERIFIED |
| qnfo-qwav | legacy, "deployed-ahead" drift | MERGE CANDIDATE |

## 4. Errors, warnings, alerts — the permanent-fix list

### P0 — deploy is the binding constraint
`fleet_deploys` last 12 rows:
- **personal-companion**: 7 consecutive hourly FAILURES today (07:01→13:01), all
  `HTTP 400 code 10021: Workflow GenerationFlow must be exported or a script_name must be
  specified`. `from_sha v1.1.0 -> to_sha 1.0.0` — this is a **downgrade loop**, unbounded.
- **qnfo-cloud-ops**: `Uncaught SyntaxError: Invalid or unexpected token at worker.js:1:2`.
  Root cause confirmed separately: `r2:qnfo-canonical/qnfo-cloud-ops.js` is corrupt and the
  deployer resolves R2 **before** GitHub, so 25 consecutive hourly redeploys fail (issue #691).
- **qnfo-observability**: `No such module "fleet.js"` — bundle references a missing module.

`fleet_drift_report` latest SCAN (14:05:46):
`scanned=55 clean=33 drifted=9 ahead=9 healed=1 errors=0 staleCanon=4 healthVer=10
errKinds={version-format:14, stale-canon:4, health-ver:10} regOpen=99 regOverdue=26 regDue7=51`

### P0 — AI gateway request-shape defects (cumulative totals)
| Model | Status | Class | Total | Root cause |
|---|---|---|---|---|
| @cf/baai/bge-base-en-v1.5 | 429 | rate-capacity | **36,749** | embedding tier oversubscribed |
| @cf/qwen/qwen2.5-coder-32b-instruct | 400 | content-shape | **16,548** | caller sends `messages` where `prompt` required |
| @cf/qwen/qwen3.8-27b | 400 | upstream | **3,459** | "System message must be at the beginning" |
| @cf/moonshotai/kimi-k2.6 | 429 | rate-capacity | 998 | capacity |
| @cf/google/gemma-4-26b-a4b-it | 400 | image-input | 395 | caller sends a **1x1 px** probe image; API requires >=10px |
| @cf/zai-org/glm-5.2 | 400 | tool-args-json | 392 | caller emits invalid JSON in tool arguments |

**Every 400 here is a caller bug, not a model fault.** The gemma image-input case is
self-inflicted: the calibration probe itself sends an invalid 1x1 image. Fixing the probe
removes 395 failures; fixing the request builder removes 16,548 + 3,459 + 392.

### P1 — alert storm
`alerts` last 24h: **108 critical**, 10 info, 3 warning, 2 error — **all digested, zero acted
on**. Recurring content, hourly:
- `terminal research failure 45 -> agent_issues dup: ensemble: only 0/3 legs produced drafts`
- `terminal research failure 51 -> ...`
- `research pipeline: failed=2 ... terminal=2`
- `INTAKE-STALL escalated -> agent_issues dup: 496 proposals stuck new`

**Falsified by direct query:** `research_queue` holds 25 rows — `published` 19, `ensemble-draft`
3, `pending` 1, `queued` 1, `researching` 1 — and **zero rows with status `failed`**. The
"terminal research failure" alerts describe a state that does not exist in the table they
name (issue #704). These alerts should be suppressed until they reconcile with the source.

### P1 — observability blind spots
- `worker_logs`: **76h frozen** (last `ts_ms=1789035358174` = 2026-09-10T10:15:58Z). Trace
  ingest is dead (issue #702). The `systems-watch` step that watches this reads
  `worker_logs` and its own query returns 0 rows.
- `freshness_guard`: `outreach` **idle 269.3h** (threshold 72); `pipeline_status`
  **idle 161.5h** (threshold 24); `amh_coverage` **stale — 8/20 models stale**.
- `pipeline_status` has exactly 1 row, last_updated 2026-09-06T20:46:01Z — project
  `autonomous-research` pinned in phase `research` for 6.7 days.
- `fleet_probe_log`: single source (`qnfo-fleet-dashboard`), 10 targets, 81 probes/day.
  **45 of 55 workers are never probed** (issue #701).

### P1 — the dispatch queue does not dispatch
`fleet_issue_dispatch`: 34 rows, **all `state='queued'`**:
`needs-human` 11 (0 attempts), `executed` 10 (2 attempts), `null` 9 (0 attempts),
`no-action` 4 (3 attempts). Zero transitions out of `queued`.
Meanwhile `fleet_issue_loop` reports all 34 as `dispatch_state='dispatched'`.
**Two ledgers, opposite claims** (issue #714). `fleet_loop_meta` corroborates:
`last_execute_summary = {scanned:25, executed:0, failed:0, needs_human:0, no_action:0}` —
25 scanned, and **not one received a disposition**.

### P1 — issue-system sprawl
Four parallel ledgers with five different open counts:
`agent_issues` open **26** | `issue_ledger` open **5** (3 medium + 2 high telemetry-self-heal) |
`fleet_issue_loop` 34 open | `fleet_issue_dispatch` 34 queued | `freshness_guard` reports
`regOpen=99`.
Top emitter: `kaizen-ai` 301 lifetime (0 open) — historical. Currently: **`qnfo-ops` 95 filed,
25 open** and `qnfo-fleet-advisor` 95 filed, 1 open. ~20 of the open rows were bulk-inserted
in a single second at 2026-09-13T14:15:25Z.

## 5. Consolidation plan (evidence-based)

**Delete (zero value, actively misleading):**
1. `demo-heartbeat` task — `SELECT 1 AS beat`, 480 no-op runs/day.
2. `demo-venue-radar` task — disabled, `last_fired` null.
3. `demo-fleet-census` — registered, never fires.

**Repair (firing but broken):**
4. `systems-watch-hourly` — all 8 queries return 0 rows; the trace-stall watch reads a
   frozen table. Repair the queries, or the watch is decorative.
5. `report-card-weekly-cron` / `bench-arc-weekly` — both last fired 2026-09-10, no
   `fleet_runs` rows; weekly window missed.
6. `qnfo-paper-explainer` — cron errors daily, `paper_explain_state` empty, log 2 days stale.
7. `qnfo-subscribers` — `subscriber_digest_runs` has never had a row.

**Merge candidates:**
8. `qnfo-qwav` (legacy research API, superseded by qnfo-ai-search + qnfo-memory-mcp).
9. The `*-hub` family — `audit-hub`, `idea-hub`, `companion-hub`, `errata-hub`,
   `jnl-pipeline`, `radar-hub` — are already consolidation artifacts; verify each has a
   live caller before keeping it.
10. `qnfo-tools-mcp` vs `qnfo-memory-mcp` — overlapping tool surfaces, both MCP.

**Do NOT merge (event-driven by design):** qnfo-pdf, qnfo-gateway, qnfo-ai,
qnfo-ai-search, calendar-api, qnfo-ipatent, qnfo-email.

## 6. What this endpoint cannot do

No deploy capability, no branch creation, no R2 delete, no CF API mutation. Every P0 above
needs an actuator this endpoint lacks. Filing tickets is possible; applying fixes is not.
The single highest-leverage fix available is repairing `r2:qnfo-canonical/qnfo-cloud-ops.js`
— one object overwrite unblocks 25 failed deploys.
