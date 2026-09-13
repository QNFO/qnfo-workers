# BIG PICTURE + ACTION PLAN — 2026-09-13T14:45Z (REV 2 — corrects the T0 in REV 1)

Supersedes REV 1 (14:35Z) and the prose in the 12-document audit. All numbers are live tool output.

## 1. BIG PICTURE

The fleet is not down. It is **frozen, and the freeze is currently load-bearing**. 55 workers deployed,
12 probed healthy, spend/error low ($12.45 / 1.13M neurons / 187 errors in 281,106 invocations, 30d).

**The decisive new fact: 9 of 55 workers are running AHEAD of their canonical artifact.**
`fleet_drift_report` 14:02-14:04Z, note=`deployed-ahead`:
personal-api 3.5.0 > v3.2.2-maxout200k · personal-companion 1.1.0 > 1.0.0 · qnfo-ai 5.25.1 > 5.21.3 ·
qnfo-ai-calibration 1.1.5 > 1.1.4 · qnfo-fleet-control 0.3.4 > 0.3.3 · qnfo-fleet-dashboard 1.5.1 > 1.1.0 ·
qnfo-ops 2.15.7 > 2.15.6 · qnfo-research-exec 0.8.1 > 0.5.17-research-restored · qnfo-signal-loop 1.1.2 > 1.1.0

**Therefore auto_heal is a downgrade engine, not a repair engine.** Turning it on with the canonical
store in its current state would overwrite qnfo-ai, qnfo-ops, qnfo-fleet-control, qnfo-fleet-dashboard,
qnfo-research-exec, personal-api, personal-companion, qnfo-ai-calibration and qnfo-signal-loop with
older artifacts. The `auto_heal=0`/`enabled=0` freeze set at 14:15:02Z is the only thing preventing that.
This REVERSES the T0 recommendation in REV 1 ("unfreeze, it buys nothing").

**The root cause is the drift comparator, and it has two confirmed defects.**
(a) *Version-string format defeats it.* The same live worker was judged `canonical-ahead` at 13:01:22
    (`deployed_version` = `"v1.1.0"`) and `deployed-ahead` at 14:02:05 (`deployed_version` = `"1.1.0"`),
    with the SAME live build and the SAME canonical 1.0.0. Only the leading "v" changed. The inverted
    verdict produced by the "v" is what drove personal-companion's 8 hourly downgrade attempts
    (06:01 -> 13:01Z, all ok=0). They stopped at 14:02:05 when the string lost its "v" — **not** because
    of the 14:15:02 freeze.
(b) *Wrong field.* 7 workers report `deployed_version` = `"<worker>/fabric-20260910"` — a fabric deploy
    tag, not a semver (qnfo-agent-orchestrator, qnfo-archive, qnfo-ddocs-indexer, qnfo-email,
    qnfo-lifecycle, qnfo-paper-indexer, qnfo-qwav). Those are permanently classified `canonical-ahead`
    regardless of truth, and they are the `version-format` errors the scanner counts against itself.

## 2. STATE (verified this session)

| surface | value | source |
|---|---|---|
| deployed / probed healthy | 55 / 12 | fleet_status 14:25:59Z |
| drift scan 14:05:46Z | scanned=55 clean=33 drifted=9 ahead=9 healed=1 errors=0 staleCanon=4 healthVer=10 regOpen=99 regOverdue=26 regDue7=51 | fleet_drift_report SCAN |
| agent_issues open | 39 (28 high, 10 med, 1 low) | agent_issues |
| issue_ledger open | 305, rising (247 -> 261 -> 266 -> 270 -> 305) | fleet_audit_runs |
| tickets filed in 3h | 55 | agent_issues |
| deploy auto-heal | OFF (`auto_heal=0`, `enabled=0` @ 14:23:10Z) | fleet_deploy_state |
| last deploy attempt / success | id 76 qnfo-observability 14:04:01 ok=0 / id 75 backlog-exec 1.2.7 -> 1.2.8 14:02:44Z ok=1 | fleet_deploys |
| trace ingest | frozen since 2026-09-10T10:15:58Z; cursor reset failed (issue 702 reopened) | trace_ingest_state |
| alerts last 24h | 4 rows — the "802 critical" storm is historical | alerts |
| endpoint 24h | 10,338 calls / 872 failures (8.4%) | telemetry_report |
| R2 credential exposure | 9 objects under backups:credentials/ incl. fleet-deploy-admin-token.txt | r2_list |

## 3. ACTION PLAN

Revised order. REV 1's order would have caused a mass downgrade.

**T0-a. Keep the freeze ON until T0-c. It is load-bearing.** Do not set `auto_heal=1` first.
**T0-b. Refresh the canonical store from live for the 9 `deployed-ahead` workers**, so canonical == live.
Actuator: qnfo-canonical R2 write (NOT bound here) + a deploy-path source.
**T0-c. Fix the comparator** — normalise the "v" prefix and stop comparing fabric tags as semver.
The repo already carries the tools: `qnfo-fleet-control/version-compare.mjs`,
`version-compare.test.mjs`, `PATCH-2026-09-13-downgrade-guard-bundle.mjs`,
`PATCH-2026-09-13-deploy-subsystem-verified.mjs`. Actuator: canonical R2 + deploy. Not available here.
**T0-d. Only then unfreeze**, with a per-worker no-downgrade guard as belt-and-braces.
**T0-S. Remove the credential exposure and rotate the deploy admin token.** Filed as issue 747.
**T1. Ship the dead-consumer fixes** (research-exec `NL is not defined`; cloud-ops canonical SyntaxError
`worker.js:1:2`; observability 1.1.4 vs repo 1.1.6) — all blocked by T0-c/T0-d.
**T2. Repair the instruments** (trace cursor, 43/55 probe gap, 1-row heartbeat, 4-row cron registry,
91% unattributed invocations). **T3. Collapse the ledgers.** **T4. Research pipeline.**

## 4. WHAT CHANGED THIS SESSION

Two D1 writes: agent_issue 747 (R2 credential exposure) and a warning appended to issue 724 so the
"restore auto_heal=1" framing is not acted on before T0-b. No deploy, no canonical write, no destructive
action. Gated and NOT taken: `ops_issue_run`, and reversing the `auto_heal=0` freeze.

## 5. FAILURE MODES / CORRECTIONS

1. **REV 1's T0 was wrong and is corrected here.** REV 1 said the freeze "buys nothing" and should be
   reversed. With 9 workers ahead of canonical, reversing it would have downgraded 9 workers including
   qnfo-ai, qnfo-ops and qnfo-fleet-control. The data that corrects this was one query away in REV 1
   (`fleet_drift_report`), which I had not run.
2. **REV 1's failure mode #1 (unexplained missing 14:01 slot) is now RESOLVED**, and the resolution is
   the "v"-prefix defect above. The 14:01 slot did run — at 14:02:05 — as `deployed-ahead`, so no deploy
   was attempted. My REV 1 suspicion that "something else stopped it" was correct; the freeze was not
   the cause.
3. **The freeze's blocking effect is inferred from a 22-minute window** (14:15:02 -> 14:26Z). No deploy
   scan boundary has been crossed yet, so "the freeze stops all deploys" is not yet observed.
4. **The comparator's own semantics are not read.** I have the verdicts and the version strings, not the
   comparison code. `version-compare.mjs` was not opened.
5. **The denominator is unreliable** — 43/55 unprobed. **cf_analytics attributes 23,971 of 281,106
   invocations.** **39 vs 305 unreconciled.** The repo source read caps at 32,768 of 75,875 bytes.
6. The credential exposure is a privilege-boundary failure only if a worker bound to `qnfo-backups`
   exposes an R2-read route to a lower-privilege caller — unverified.
