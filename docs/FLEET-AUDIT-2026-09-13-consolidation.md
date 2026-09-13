# FLEETWIDE AUDIT + CONSOLIDATION — 2026-09-13

Endpoint: qnfo-ops (Chatbox session). All figures read from live D1 / CF API in
this session, source named per line. Inferences are labelled.

> **REVISION 2 (2026-09-13T14:30Z).** §4 of revision 1 recorded an executed fix that
> was **wrong and has been reverted**. §7 gains a finding about a mid-session purge of
> the alert ledger. Read §4 and §8 before acting on anything here.

## 0. Authoritative census (fleet_dashboard_state.state_json, generated 2026-09-13T14:16:39Z by qnfo-fleet-dashboard v1.5.1)

| metric | value |
|---|---|
| workers live / registered | 55 / 55 |
| scheduled (cron) workers | 40 |
| probes configured | 10 |
| D1 databases | 9 |
| requests 24h | 15,730 |
| errors 24h | 26 |
| fleet score | 89 (chains 91, coverage 90, freshness 82) |
| registry integration edges | 32 (density 0.0108) |
| trace coverage | 58 / 80 workers emit trace events |

## 1. Error / warning / alert surface, decomposed

### 1.1 Alerts: 717 criticals in 7 days, ONE source, condition already cleared
Measured at ~14:22Z: `alerts` by source/level, 7d: `qnfo-pipeline-ops` critical
**717**, warning 1; `qnfo-error-selfheal` warning 36; `qnfo-backlog-exec` warning 26;
`worker-health` error 11; `checker` warning 8; `blank-audit` warning 7.

All 717 criticals were the same four messages re-emitted on a 15-minute loop:
`research pipeline: failed=2 ... terminal=2`; `terminal research failure 45 ->
agent_issues dup`; `terminal research failure 51 -> agent_issues dup`;
`INTAKE-STALL escalated -> agent_issues dup: 496 proposals stuck new`.

**The condition has cleared.** `cloud_ops_events` job=`qnfo-pipeline-ops`:
13:01–13:46 `intake_new:496, failed:2, triaged:62` → 14:01 `intake_new:0,
failed:2, triaged:558` → 14:16 `failed:0, queued:1, researching:1, triaged:558`.
Last critical alert id 1117 @ 14:01:22.

**As of ~14:30Z those rows no longer exist — see §8.** Do not quote the 717 figure as
current.

Root cause established in a companion finding: the storm and the suppressed ticket
are ONE bug. See
`qnfo-pipeline-ops/FINDING-2026-09-13-alert-storm-and-dedupe-are-one-bug.md`
(commit `9be83734`).

### 1.2 Errors: 26/24h across 8 workers; deploy scanner dominates the long tail
err24 by worker: `qnfo-fleet-dashboard` 18, `calendar-api` 2, then 1 each for
`fleet-exec`, `jnl-pipeline`, `qnfo-fleet-control`, `qnfo-research-exec`,
`qnfo-autopilot`, `ai-health-prober`.

`self_heal_actions` by kind: version-format **594**, health-ver **325**, drift
**290**, stale-canon **112**, fleet-execute 50, fleet-issue 36 — 1,321 rows, mostly
repeated detection of ~14 non-semver versions and 4 stale canonicals.

### 1.3 Recurring real failures
- **latex-fail ×18** (`qnfo-research-exec`, ~every 2h10m): qnfo-pdf returns
  `text/plain` not `application/pdf`. Latest 2026-09-13 05:21:19.
- **v2-drain** `{"ok":false,"stage":"v2","error":"newversion failed: {_status:504}"}`
  @ 14:16:11 (Zenodo 504); matches dashboard `queue_version` = err.
- **seo-fail**: `jsonld:false` on `papers` and `qnfo`.
- **gtd-overdue-guard**: overdue 7 → 26, agent_uncited 67 → 86.
- **worker-health** 11 errors / 6 days: identical `HTTP 530 / code 1016` on
  `qnfo-ai`, `personal-api`, `qnfo-ai-chat` every 12h while `qnfo-ai` `/health`
  returns 200 v5.25.1 — misconfigured hostname, alerting forever.
- **ops gateway**: `225 calls, 26 failed (ok=0), avg 200,300 ms`.

### 1.4 Fail-open: dead ingest reads as healthy
`fleet-observability-digest` @ 14:18:13: *"0 workers logged 0 events in 24h;
0 anomalies"*. Zero data scored as zero anomalies. `worker_logs` ingest stalled
since 2026-09-10T10:15:58Z (issue 702). Most dangerous class here.

## 2. Workers that fire and produce nothing

**Tier A — cron fires, zero output (issue 728):** `qnfo-paper-explainer`
(paper_explain_state 0 rows), `qnfo-subscribers` (subscriber_digest_runs 0 rows
ever), `qnfo-research-supervisor` (silent 47.7h), `qnfo-ddocs-indexer` (9d),
`qnfo-proof` (9d), `errata-hub` (12d).

**Tier B — fires but records nothing:** `audit-hub` (req24 6, `lastRun: null`),
`qnfo-twin-maintain` (req24 1, `lastRun: null`), `companion-hub` (req24 6, last
run 2026-09-12T09:30).

**Tier C — stale against own cadence:** `qnfo-ai-calibration` */30 → 11:00;
`qnfo-chat-canary` 3-hourly → 2026-09-12T07:07; `qnfo-ddocs-indexer` 2-hourly →
08:37; `qnfo-signal-loop` hourly → 02:00; `qnfo-events` 6-hourly → 09-11T17:10;
`qnfo-impact` daily → 09-11T17:10.

**Tier D — polling with no work:** `qnfo-research-exec` emitted `kind=idle,
"no work"` **343 times in 2 days** on a */10 cron with `research_queue` holding
25 rows total. Cadence exceeds workload; not a fault.

## 3. Consolidation plan

Waves A/B already merged: `fleet-exec`, `qnfo-fleet-control`, `radar-hub`,
`idea-hub`, `jnl-pipeline`, `audit-hub`.

**Wave C — proposed, priority order:**
1. `qnfo-fleet-dashboard` → `qnfo-observability` (both fleet-ops telemetry;
   dashboard has the highest err24 = 18 and duplicates the probe set).
2. `companion-hub` + `qnfo-twin-maintain` → `personal-companion` / `personal-api`
   (3 workers, ~7 req/24h combined, overlapping purpose).
3. `errata-hub` → `jnl-pipeline` (15 requests in 30 days, no cron).
4. `qnfo-qwav` → merge (prescribed in 728); superseded by `qnfo-memory-mcp` +
   `qnfo-ai-search`.
5. Repo hygiene: **39 worker directories exist with no live worker** — delete or
   move to `archive/`.

Do NOT merge on the "islands" list alone — see §7.

## 4. Executed this session — and one reversal

| action | result |
|---|---|
| `ops_issue_run` (backlog drain) | processed 30, closed 0, rechecked 30, escalated 0 — **no-op**; every open row is non-probe-target |
| DELETE 3 `fleet_tasks` (demo-heartbeat, demo-venue-radar, demo-fleet-census) | `changes: 3` — **WRONG, REVERTED, see below** |
| DELETE 2 `fleet_crons` (demo-heartbeat-minutely, demo-venue-radar-daily) | `changes: 2` — **WRONG, REVERTED, see below** |

### 4.1 The deletion was wrong and a concurrent instance was right to undo it

Within ~13 minutes, a parallel qnfo-ops instance **restored `demo-heartbeat`**
(`fleet_tasks.updated_at 2026-09-13 14:27:35`) and re-created its cron row
(`fleet_crons` id 7, `task_id='demo-heartbeat'`, cadence changed `*/15` → `*/30`).
Its stated reason, recorded in the task's own `name` field:

> "liveness probe for the fleet-exec task engine. RESTORED 2026-09-13 by qnfo-ops
> after deletion: fleet_runs is the only signal the task engine executes, and
> systems-watch-hourly's fleet-runs-stall check requires a row within 1h. Cadence
> reduced */15 -> */30 to cut no-op fires 480/day -> 48/day while keeping a margin
> under the 1h check."

**I verified that independently rather than accepting it.** `fleet_runs` rows
474–488 are almost entirely `demo-heartbeat` at */15 (11:45, 12:00, 12:15, 12:30,
12:45, 13:00, 13:15, 13:30, 13:45, 14:00, 14:15) plus `systems-watch-hourly`
hourly at :09. Deleting the heartbeat strips the task engine's only high-frequency
liveness signal. The restore also achieves the productivity goal (480 → 48 no-op
fires/day) **without** breaking liveness.

**The restore is strictly better than my deletion. My change was a mis-fix; I had
read issue 728's prescription and executed it without checking what consumed the
row.** Net change from my two deletes: zero.

### 4.2 Issue 728's "systems-watch-hourly is broken" claim is also refuted
728 states the task is broken because "all 8 steps rows=0". Its definition is
conditional — `INSERT OR IGNORE INTO cloud_ops_events ... SELECT ... WHERE
<condition>` — so `rows=0` means the condition evaluated **false**, which is correct
behaviour, not a defect. Re-examine before repairing.

## 5. Blocked — needs a deploy path (no wrangler on qnfo-ops)

1. **Deploy healer disabled.** `fleet_deploy_state` `enabled=0`, `auto_heal=0`,
   both written **2026-09-13 14:23:10**. Self-heal worked until then
   (`self_heal_actions` 1413/1414 "canonical resync ... verified", `healed`,
   14:05:2x). Disabling stops healing for all 55 workers. **Not re-enabled here** —
   unknown what tripped it; enabling resumes two guaranteed-failing hourly
   redeploys. Top decision point.
2. **`personal-companion`** — 30 consecutive hourly failures to 13:01,
   `Workflow GenerationFlow must be exported or a script_name must be specified`.
   Canonical **1.0.0** vs live **1.1.0**; preserved bindings include a
   `GenerationFlow` workflow the older module does not export. Fix: canonical to
   1.1.0, or drop the workflow from the preserved set.
3. **`qnfo-cloud-ops`** — 25 consecutive hourly failures ending 07:02:38,
   `SyntaxError: Invalid or unexpected token at worker.js:1:2`. Cause documented in
   the repo tombstone: `canonical()` resolved a **multipart upload body** as source
   and `versionOf()`/`isModule()` both passed it. The tombstone stopped it; the
   **class** is unfixed in `qnfo-fleet-control`.
4. **`qnfo-observability`** — failed 14:04:01, `No such module "fleet.js" imported
   from "worker.js"`. Repo has `fleet.js` (2,596 B); the upload sends only
   `worker.js`. Needs a bundling fix in the deployer.
5. **Deploy-defect source unpatchable from here.** `qnfo-fleet-control/worker.js`
   is **75,875 B**; `github_repo_read` caps at 32,768 chars with no offset, and
   `r2_get` also caps (~32,768 — verified by requesting 40,000 chars of a 34,825 B
   object and receiving `truncated:true`). Six staged patches already exist in
   `qnfo-fleet-control/` — they need a session with wrangler.
6. `qnfo-observability/worker.js` is **37,386 B** — also above the cap, so inlining
   `fleet.js` is not possible from here.

## 6. Findings that are NOT defects

- `qnfo.org` 10s probe timeouts (18 of dashboard err24) are transient: the same
  probe in state_json reports `ok:true status:200 ms:379`.
- **The 39 dead repo directories are not probed any more.** `fleet_probe_log` rows
  showing ~35 deleted workers (error 1042) are dated **2026-09-12T09:15:45**,
  before the roster rebuild (state_json `device.captured_at` 2026-09-12T10:00:00Z).
  I first read those as current; they are historical.
- `version-format: 14` is cosmetic, not a runtime fault.
- `demo-heartbeat` is **not** dead scaffolding — see §4.1.

## 7. Failure modes of this audit

- **Two agents audited the same fleet concurrently, and both wrote.** `agent_issues`
  open went **21 → 30 → 35** during this session (open_high 15 → 24), filed by a
  parallel instance; issues 719–734 were created mid-session; issue 731 states the
  deploy-healer finding verbatim. The backlog growth is **agent-generated, not
  failure-generated**.
- **My writes were reverted.** The `demo-heartbeat` deletion (§4.1) was undone in
  ~13 minutes and `venue-radar-scan` was disabled by the other writer at 14:27:56.
  Any "executed" claim in a concurrent-writer environment has a short half-life.
- **Backlog counts do not reconcile:** `backlog_status` 21, `ops_issue_run`
  `openBacklogBefore: 30`, D1 35 — three numbers, same minute.
- **The "islands" metric is a metadata artifact.** The 30 islands come from the
  registry graph, and most rows have `deps: []` — including `qnfo-ai`, a hub.
  Islands ≈ "deps not declared", not proof of missing integration.
- **`qnfo-pipeline-ops` is unlocatable as a worker.** Absent from the 55-worker
  roster and the 40-scheduled list; repo dir undeployed; `/health` 404s (CF 1042).
  Something live emits `job='qnfo-pipeline-ops'` every 15 min. An ancestor source was
  reachable via bound R2 and yielded the root cause, but the deployed revision
  cannot be patched from here. Ticketed as 729.
- **I executed a ticket's prescription without verifying what consumed the target.**
  That is the specific error in §4.1 and the most transferable lesson here.

## 8. The alert ledger was purged mid-session (new)

Between ~14:22Z and ~14:30Z the `alerts` table changed from
`critical 717 / warning 80 / info 59 / error 11` (7-day window) to
`critical 4 / warning 138 / error 16 / info 11` (all time). The `info` count falling
from 59 (a 7-day subset) to 11 (an all-time superset) is arithmetically impossible
without deletion, and the newest alert id dropped from 1117 to 1076.

The 4 surviving criticals are `chat-canary` ids 20–23, newest **2026-09-02**. So
**the 717 storm rows were deleted, not resolved.** `SELECT count(*) FROM alerts
WHERE level='critical' AND created_at > datetime('now','-3 hours')` → **0**.

Two readings, both partly true: the underlying condition genuinely cleared at
14:01–14:16 (§1.1), **and** another writer removed the evidence. A ledger that can be
purged by a peer is not an audit trail. No retention policy for `alerts` is
documented in the fleet's own state; `digestAlerts` only sets `digested`, it does not
delete.
