# Fleet error / warning / stale-worker audit + executed remediation
Date: 2026-09-13 (UTC). Executor: qnfo-ops endpoint. Every figure is a tool return from this session.

## 0. Executed remediation (verified)

| # | action | tool | result |
|---|---|---|---|
| 1 | `UPDATE fleet_deploy_state SET value='0', updated_at=datetime('now') WHERE key='auto_heal'` | `ops_d1_write` (db=audit) | `changes:1`; read-back `auto_heal='0'` @ 2026-09-13 14:15:02 |
| 2 | Backlog drain on open agent_issues | `ops_issue_run` (confirm:true) | HTTP 200, processed 3, closed 0, rechecked 3 — all `no probe target` |
| 3 | Filed the one undocumented ongoing defect | `ops_d1_write` (db=audit) | `agent_issues` id **702** (TRACE-STALL) |

**Why action 1 and not "fix the errors":** the largest error in the fleet — 25 failed `personal-companion`
redeploys with CF error 10021 — must NOT be fixed. See §1. The prior source-verified finding
(`personal-companion/FINDING-2026-09-13-deploy-loop-DO-NOT-FIX-10021.md`) is correct, and I re-verified
its load-bearing claims independently.

## 1. The inverted finding: the biggest "error" is protective

Independently re-verified this session:

| what | how | value |
|---|---|---|
| production version | `web_fetch https://reading.q08.org/health` | `1.1.0`, `ok:true`, `pieces:8` |
| hourly loop target | `fleet_deploys` id 74 @ 13:01:23 | `from_sha=v1.1.0` -> `to_sha=1.0.0`, `ok=0` |
| loop attempts | `fleet_deploys` ids 68,70,71,72,73,74 | every hour, all `ok=0`, all error 10021 |
| kill-switch | `fleet_deploy_state` | `enabled=1`, `auto_heal=1`, both set **2026-09-08 16:25:49** (5 days) |

The loop attempts a **downgrade** of live production every hour. The 10021 rejection is the only thing
preventing it. Fixing 10021 makes the downgrade execute.

### 1.1 Root cause chain (read from source, 24,761 B read in full)

Source: `qnfo-fleet-deploy/deployed-current.worker.js` @ ref `db9d2fdb~1`, blob `ed539ec3`.

- **D2 — comparator misorders.** `newer()` does `num()` = `s.split("-")[0]` then `parseInt` per component.
  `parseInt("v")` -> `NaN` -> `0`, so `"v1.1.0"` -> `[0,1,1,0]`, which sorts **below** `"1.0.0"` -> `[1,0,0]`.
  `newer("v1.1.0","1.0.0")` -> `false` -> classified *behind* -> `scan()` calls `redeploy()`.
- **D3 — the guard is absent.** `direction` is computed then discarded; nothing gates on it.
- **D6 — the upload omits `script_name`.** The multipart branch appends only
  `{"main_module":"worker.js"}`. A worker owning a Workflow binding rejects that PUT with 10021.

### 1.2 The failure is INTERMITTENT, not constant (new observation)

`fleet_drift_report` shows the *same* worker classified both ways depending on which version-extraction
path wins:

| ts | deployed_version | canonical_version | note |
|---|---|---|---|
| 13:01 | `v1.1.0` | `1.0.0` | `canonical-ahead` -> **attempts redeploy** |
| 14:02:05 | `1.1.0` | `1.0.0` | `deployed-ahead` -> correctly **skips** |

`1.1.0` -> `[1,1,0] > [1,0,0]` -> skipped. `v1.1.0` -> `[0,1,1,0] < [1,0,0]` -> attempted.
So the protection depends on which string the version extractor happens to return. This is why
`fleet_deploys` has attempts at 13:01 but none at 14:01. **The exposure is a coin-flip per hour.**

### 1.3 What was disarmed and what it preserves

Source-verified semantics of the key I changed:

```js
async function autoHeal(env) { return (await stateGet(env,"auto_heal","0")) === "1"; }
async scheduled(event, env, ctx) { var heal = await autoHeal(env); var res = await scan(env, heal); ... }
// inside scan():  if (heal && !usedHealth) { var res = await redeploy(env, n); if (res.ok) out.healed++; }
```

`auto_heal` gates **only** the `redeploy()` call. `scan()` and drift reporting run regardless, so
**visibility is preserved and automated deploys stop**. `enabled=1` was deliberately left in place:
it gates `redeploy()` itself (403 kill-switch), i.e. the authenticated manual `POST /redeploy` path —
an operator action, not the automated risk. Residual exposure is recorded in §5.

**Cost of this change (stated plainly):** the loop was also doing *successful, wanted* upgrades —
`fleet_deploys` id 75 `qnfo-backlog-exec 1.2.7->1.2.8 ok=1` @14:02, id 69 `1.2.6->1.2.7 ok=1`,
id 67 `qnfo-social 0.5.2-checker-heal->0.5.3-failclosed ok=1`. Disarming `auto_heal` freezes those too.
Given a comparator that misorders live strings and 1,492 drift rows across 50 workers, frozen upgrades
are the cheaper failure. Re-enable only after the comparator and canonicals are fixed (§6).

## 2. Deploy subsystem failures (26 `drift` + 25 `fleet-execute` failed)

| ref | fails | last | error |
|---|---|---|---|
| `personal-companion` | 25 | 2026-09-13 13:01:23 | 10021 `Workflow GenerationFlow must be exported or a script_name must be specified` |
| `qnfo-observability` | 1 | 2026-09-13 14:04:01 | 10021 `No such module "fleet.js" imported from worker.js` |
| `iss-*` (5 refs) | 5 each | 2026-09-12T12:31 | issue-dispatch failures |

**`qnfo-observability` is structurally undeployable via this deployer.** `fleet.js` *does exist*
(`qnfo-observability/fleet.js`, 2,596 B) and `worker.js` line 16 is `import { FLEET } from './fleet.js';`
— but the deployer's multipart branch appends **only** `worker.js` as a single module, so the relative
import cannot resolve. `wrangler deploy` from that dir would bundle it; the raw-PUT path cannot.
Consequence: canonical 1.1.4 can never ship over deployed 1.1.3. A source fix alone does not help.

## 3. TRACE-STALL — 76h, verified, filed as issue 702

| check | value |
|---|---|
| `trace_ingest_state.last_key` | `workers_trace/20260910/20260910T101640Z_a05671da.log.gz` (frozen) |
| `worker_logs` MAX(ts_ms) | `1789035358174` = **2026-09-10T10:15:58Z** -> 76.0h stale |
| `worker_logs` rows | 1,578, spanning 2026-09-06T18:00Z .. 2026-09-10T10:15Z |
| Logpush still delivering? | **YES** — `workers_trace/20260911/*` returns >500 objects; `20260913/` has objects (e.g. `20260913T000150Z` uploaded 00:03:01Z) |
| worker invoked? | **YES** — `worker_activity_daily` req24 = 143 @14:06, 134 @13:06, 134 @12:06 |
| watchdog | `cloud_ops_events` `watch-trace-stall-*` status=`err` every 3h since 2026-09-12T16:09Z (8x, unresolved) |

Delivery works, the cron fires, and nothing is written -> the ingest does not advance its cursor.
Leading hypothesis (**unconfirmed**): the ingest lists keys ascending and processes the first
`INGEST_CAP_FILES=300`, which are all already-ingested keys <= cursor, so progress is impossible.
Falsifiable by reading the ingest loop in `qnfo-observability/worker.js`; I did not read it, so this
stays a hypothesis. Not fixable here: no deploy route, and the worker is undeployable anyway (§2).

## 4. Warnings / staleness

| item | evidence | status |
|---|---|---|
| non-semver VERSION | `self_heal_actions` `version-format` **184 detected** / 410 healed | open |
| — examples | `qnfo-qwav/fabric-20260910`, `qnfo-paper-indexer/fabric-20260910`, `qnfo-memory-mcp/2024-11-05`, `qnfo-agent-ws/2025-11-25`, `qnfo-gateway/3.5.3-quarantine-filter`, `qnfo-social/0.5.3-failclosed`, `companion-hub/v1.0.0` | HUB-VERSIONING-1 wants strict X.Y.Z |
| drift deferred | `self_heal_actions` `drift` **deferred 228** + `health-ver` **deferred 228** — all `canonical via /health; no source to redeploy` | open, structural |
| `integration_state` | last generated **2026-09-11T14:17:37Z** (~2 days), `fleet_size:80` vs actual 55 | stale |
| `ai_model_health` | ~8 models `last_probe_ts` = 2026-09-11T16:44Z (2 days); `freshness_guard.amh_coverage` = `stale` | stale |
| `version_queue` id=18 | created 2026-09-11 10:22:29, still `drafted`; 16/17 peers publish in ~4 min. `recover_count=1`, updated 14:05:07 | **stuck 2 days** |
| `worker-health` alerts | 6 in 3 days, all identical 530/1016 for `qnfo-ai`, `personal-api`, `qnfo-ai-chat`, `personal-api-chat`, `qnfo-idea-factory` | **false positive** |
| blank gateway responses | `blank-audit` 8/26 (5 junk<8ch, 3 fallback) | warning |
| `regOpen=99 regOverdue=26 regDue7=51` | `fleet_drift_report` id 1708 SCAN @14:05:46 | open |
| `fleet_deploy_state` `scanerr:*` | **44** keys | housekeeping |

**`worker-health` is a false-positive generator.** `qnfo-ai-chat`, `personal-api-chat` and
`qnfo-idea-factory` **do not exist** in the 55-worker fleet, and `qnfo-ai` returns `healthy:true, http:200`
via service binding at the same time the checker reports 530/1016. The checker is probing a wrong
hostname/routing, then emailing an alert that itself bounces (§4.1). 6 spurious errors in 3 days.

### 4.1 Alert mail loop
`emails` shows the fleet's own notifications returning via `bounces@cf-bounce.qnfo.org` and being
re-ingested as `processed`: "QNFO AI endpoint health alert", "Loose threads — 41 item(s) need
disposition", "QNFO register guard: 26 overdue", "Outreach pipeline self-check", "QNFO briefing",
and `[research-daily-brief] FAILED` — which fires **daily** (2026-09-12T06:07:42, 2026-09-13T06:07:35)
and whose failure notice bounces back in. Spam is separate (45 messages, `personal`+`general`).

## 5. What is NOT fixed, and why (honest limits)

1. **`personal-companion` deploy target is still wrong.** Canonical `1.0.0` must be replaced by a source
   that is >= `v1.1.0` **and** exports `GenerationFlow`. Requires a deploy route I do not have.
2. **The comparator is still live-broken.** `qnfo-fleet-control/version-compare.mjs` (corrected,
   20/20 tests) exists in-repo but is **staged, not deployed** — the running control plane is 0.3.4.
3. **`enabled=1` remains.** With D3 absent, an authenticated `POST /redeploy` can still revert any of the
   **19 deployed-ahead workers** re-observed at 14:02 (incl. `qnfo-ai 5.25.1 vs 5.21.3`,
   `qnfo-ops 2.15.7 vs 2.15.6`, `qnfo-fleet-dashboard 1.5.1 vs 1.1.0`, `personal-api 3.5.0 vs v3.2.2-maxout200k`).
   I left it because it is operator-gated, not automated; lowering it would remove the only deploy path.
4. **`qnfo-observability` cannot ship** (single-module upload vs `fleet.js` import).
5. **TRACE-STALL is diagnosed, not fixed** — hypothesis only, no deploy route, worker undeployable.
6. **`version_queue` id=18 deliberately untouched.** Marking it `published` would assert a publication
   that has not happened. It stays stuck and visible.

## 6. Recommended order (requires a principal with a deploy route)

1. Keep `auto_heal=0` until 3 and 4 below land.
2. Reconcile `personal-companion` canonical to >= `v1.1.0` **with** the `GenerationFlow` export.
3. Deploy the corrected comparator into `qnfo-fleet-control`, **and** add `script_name` to the multipart
   metadata (D6) and bundle all modules (fixes both 10021 classes).
4. Bring the 19 deployed-ahead canonicals forward, then re-enable `auto_heal=1` and verify from `/health`.
5. Fix the `worker-health` endpoint list (drop `qnfo-ai-chat`, `personal-api-chat`, `qnfo-idea-factory`).
6. Read the `qnfo-observability` ingest loop and confirm/refute the cursor-advance hypothesis.

## 7. Fleet baseline at audit time (2026-09-13 14:09Z)

`fleet_status`: 55 deployed, 12 probed healthy (the other 43 report `healthy:null` = **unprobed, not
down** — they have no service binding to this endpoint; `fleet_probe_log` shows them returning 200).
Crons healthy: `demo-heartbeat` */15 fired 14:00, `systems-watch-hourly` fired 14:09, `venue-radar` 06:45,
weekly crons next 2026-09-14. Bindings 200: `qnfo-ai` 5.25.1, `qnfo-ops` 2.15.7, `qnfo-kaizen` 0.3.2,
`personal-api` 3.5.0, `qnfo-social` 0.5.3, `qnfo-paper-reviser` 1.0.4, `qnfo-outreach` 0.1.0,
`qnfo-paper-indexer` 2.2.0, `qnfo-gateway` 3.6.1-subscribers. One intermittent: `https://qnfo.org/`
timed out at 10,000 ms at 14:01:34 while also returning 200 in 394 ms in the same run.
Open backlog: 3 -> now 4 (issue 702).
