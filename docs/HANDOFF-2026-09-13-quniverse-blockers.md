# Handoff — QNFO integration & deployment blockers (corrected)

Author: qnfo-ops endpoint. Date: 2026-09-13 ~13:30Z.
Status: **audited, not fixed.** Every figure is a live tool return.
This file is documentation only. It is not a deploy candidate: `canonical()` resolves
`<worker>/deployed-current.worker.js` then `<worker>/worker.js`, never `docs/`.

## 0. The one correction that changes the P0

An earlier revision (and `docs/REMEDIATION-2026-09-13-qnfo-cloud-ops-multipart-corruption.md`)
implied the qnfo-cloud-ops shadow could be cleared from GitHub. **It cannot.**

- `qnfo-cloud-ops/deployed-current.worker.js` is now a **1,605-byte `404:`-prefixed tombstone**
  (sha `a8dfe8ba`). The resolver's `c.slice(0,4) !== "404:"` test correctly skips it.
- `qnfo-cloud-ops/worker.js` is valid JS — 129,457 B, sha `59dd468d`, begins
  `import { connect } from "cloudflare:sockets";`.
- **All 25 recorded deploy attempts nonetheless carried
  `source_path = r2:qnfo-canonical/qnfo-cloud-ops.js` and all 25 failed** with
  HTTP 400 code 10021 `Uncaught SyntaxError ... at worker.js:1:2`, the last at
  `2026-09-13 07:02:38Z`.

=> The deployer resolves **R2 first** and uploads the poisoned R2 object
`qnfo-canonical/qnfo-cloud-ops.js`. R2 is written back only on success, so the poison is
self-perpetuating and no GitHub edit reaches it.
**Required fix: delete or overwrite the R2 object `qnfo-canonical/qnfo-cloud-ops.js`.**
(Confidence: high but inferential — the resolution order is read off `source_path` on all 25
rows plus the retraction note, not from the live resolver source.)

## 1. Deploy loop — the binding constraint

`fleet_deploys`: **74 rows, 21 ok, 53 fail.** By day:

| day | attempts | ok |
|---|---|---|
| 2026-09-13 | 25 | 3 |
| 2026-09-12 | 38 | 9 |
| 2026-09-11 | 5 | 5 |
| 2026-09-09 | 4 | 2 |
| 2026-09-08 | 2 | 2 |

Two live hourly loops account for 55 of the 74 attempts:

| worker | attempts | ok | canonical | note |
|---|---|---|---|---|
| `qnfo-cloud-ops` | 25 | **0** | `r2:qnfo-canonical/qnfo-cloud-ops.js` | 10021 SyntaxError, ongoing |
| `personal-companion` | 30 | **4** | `r2:qnfo-canonical/personal-companion.js` | 4 ok = `v1.1.0 -> 1.0.0` **downgrade**; 26 fail = `PUT-ok but deployed still v1.0.0` |

**personal-companion is the worse fault: the regression was APPLIED.** Four successful
deploys on 2026-09-12 08:01–11:01Z replaced live v1.1.0 with 1.0.0, and the deployer can no
longer move it (26 consecutive no-ops through 2026-09-13 13:01Z). Restore v1.1.0 or pin the
deployer off this worker before anything else touches it.

Other 12 workers deployed cleanly (`qnfo-social`, `qnfo-paper-reviser`, `qnfo-email-orchestrator`,
`qnfo-kaizen`, `qnfo-fleet-dashboard`, `qnfo-backlog-exec`, `qnfo-ai-calibration`, `qnfo-ai`,
`personal-api`, `ai-health-prober`, `qnfo-chat-canary`, `qnfo-fleet-advisor`).
**The deploy path works when the canonical is valid.** 7 workers have unusable canonicals
(`stale-canon`/`nocanon`).

## 2. Repo is not a mirror of production

| worker | repo | live |
|---|---|---|
| `qnfo-ai` | 5.21.5 | **5.25.1** |
| `ai-health-prober` | 2.3.2 | **2.3.1** |
| `qnfo-ai-calibration` | 1.1.4 | **1.1.5** |
| `personal-companion` | 1.0.0 | 1.0.0 (downgraded from 1.1.0) |

Deploying repo source where canonical is *older* than live is a downgrade, not a heal.

## 3. Custom domains — per-host, not blanket

| host | result |
|---|---|
| `qnfo.org` | **200** |
| `papers.qnfo.org` | **200** |
| `qnfo-ai.qnfo.org/health` | 530 |
| `qnfo-ops.qnfo.org/health` | 530 |
| `qnfo-gateway.qnfo.org/health` | 530 |
| `qnfo-email.qnfo.org/health` | 530 |
| `journal.qnfo.org` | 530 |

2 of 7 resolve. Consistent with Pages custom domains resolving and **Worker** custom domains
not. Corrects the "10 of 10 return 530" claim in `docs/DEAD-SUBSYSTEMS-2026-09-13.md` §1/§3.
Note: `*.q08.workers.dev/health` is NOT a usable control from the ops endpoint's fetch path
(it 404s even for `qnfo-ops`, which is live) — do not read those 404s as worker status.

## 4. gw-fail tickets — two subsystems defeating each other

- Rows **654–660** created 2026-09-11 13:30:46–56Z; **bulk-resolved at `updated_at=1789284308000`**.
- Rows **678–684** created `1789284660954`–`1789284673255` — **~6 minutes after** that resolve.
- Dedupe keys on an **open** title; the stale-close pass deletes that key; the next sweep re-files.

Compounding it, `ai_gateway_failures` replays one window forever — 6 classes share
`first_ts 1788595252513` and `last_ts 1789304457836` with ~390 rows each (7.94 days at `*/30`
≈ 381 sweeps), so the 24h auto-close condition `COUNT(*) WHERE ts > t0-24h = 0` can never hold.

Lifetime hits: `bge-base-en-v1.5` 36,591 · `qwen2.5-coder-32b` 16,464 · `qwen3.8-27b` 3,423 ·
`kimi-k2.6` 986 · `gemma-4-26b` 393 · `glm-5.2` 390 · `kimi-k2.7-code` 100.
Classes: content-shape, rate-capacity, tool-args-json, image-input, upstream.

**Fix:** split create/dedupe from stale-close; make the sweep honour `start_time`.

## 5. Publish pipeline fails silently

`cloud_ops_events` kind=`v2-drain`: **40 events, every one `status='ok'`** with `ok:false`
payloads. Latest two (09-13 09:55:46Z, 07:45:50Z) = `newversion failed: {"_status":504}`;
earlier = `NL is not defined`. `logEvent`'s `status || "ok"` masks the failure class.
`latex-fail`: 23 events, null status, recurring ~2-hourly.

Stub publications live: `releases/2026/09/1-introduction.md` and
`releases/2026/09/operationalizing-infomatics.md` are **97-byte changelog-only files with an
identical etag** (`5951e425a3a1837c6ce8dcd5f4dd539c`).

`research_queue` lifetime: 19 published (last **2026-09-08**), 3 ensemble-draft, 2 failed
(= open issues #688/#687), 1 pending.

## 6. Decision plane armed but unwired

`self_heal_actions`: detected **170**, deferred **445**, healed 528, resolved 130, failed 50,
dispatched 35, **executed 10**.
`alerts`: 1,097 rows, 46 undigested — and **910 of the "digested" rows are `qnfo-pipeline-ops`
digesting its own rows** (`digestAlerts` scoped `WHERE source=?1` = its own name).
`analytics_metric_triggers`: 6 rows, all `enabled=1`, **no `last_fired_at` column**, so
`cooldown_hours=168` is unenforceable; no `metric-trigger` kind in 30d of `cloud_ops_events`.
`qnfo-kaizen` policy: `additiveOnly:true, versionBump:false`, weekly drift scan — overhaul is
excluded by configuration.

## 7. Memory plane empty and polluted

PERSONAL: `agent_memories` **0**, `notes` 503, `facts` 5, `tasks` 3, `handoffs` 6.
`notes` ~90.6% canary health-probe text ("Reply with exactly: OK"), growth ~48/day.
`memory_maintain_runs`: every run `scanned=0 pruned=0`.

## 8. Other verified blockers

- **Register cannot execute.** `task_dod_register`: 99 open, **26 overdue**, 1 owner;
  register-guard overdue went 7 (09-12) -> 26 (09-13).
- **Registry under-describes the fleet.** 55 rows, **23 blank capabilities, 21 blank purpose**;
  `fleet_status` healthy **12/55**; `fleet_probe_log` http transport 5,151 probes / **1,784 ok
  (34.6%)**, binding transport 3,223/3,223.
- **Routing.** `domain='code'`: `deepseek-v4-flash` **180** vs ensemble 46 (~71% to flash);
  `domain='general'` runs `kimi-k2.7-code` **209 times**. `ai_calibration_config.latency_max_ms
  = 8000` records a correct-but-slow model as `status:"fail"`.
- **Backlog.** `agent_issues` 684 total / **12 open**: 7 `[gw-fail]`, 2 `TERMINAL research
  failure 45/51`, 1 `VQ error version_queue id=18`, 1 MODEL-DEGRADED, 1 low.

## 9. Corrected P0 order

1. Delete/overwrite R2 `qnfo-canonical/qnfo-cloud-ops.js` so the resolver falls through to the
   clean GitHub `worker.js`. **GitHub edits provably do not reach this.**
2. Stop and reverse the `personal-companion` downgrade loop (restore v1.1.0).
3. Repair Worker custom-domain bindings (or stop advertising the hostnames).
4. Split gw-fail create/dedupe from stale-close; make the sweep honour `start_time`.
5. Delete the 2 stub releases; fix `logEvent` masking and the Zenodo 504.

## 10. Limits

- R2-first resolution is inferred from `source_path` on all 25 rows + a repo retraction note;
  the live resolver source was not read.
- `personal-companion`'s current live version is not directly observable from the ops endpoint.
- The custom-domain finding rests on 5 Worker hosts; the fetch transport has its own failure
  mode on `workers.dev`.
- Nothing in this document changed production. Six+ prior artifacts describe prepared
  remediation; the gap between prepared and applied remains the whole task.
