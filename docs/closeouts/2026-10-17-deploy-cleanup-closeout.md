# Closeout — merge branches, cleanup deployments, ensure workers up to date (2026-10-17)

## What was done

### 1. Merge all GitHub branches — COMPLETE
- `#1378` (code-orchestrator cron `*/2`) — **closed as superseded**: the `*/2` cron was already live on `qnfo-code-orchestrator` (fleet state `crons: ["*/2 * * * *"]`) and already in main's `wrangler.toml`. No force-merge of a conflicting branch.
- `#1403` (fleet-dashboard 1.40.0) and `#1407` (fleet-dashboard 1.40.1) — merged (by concurrent session).
- Final state: **0 open PRs**, remote has only `origin/main`.

### 2. Cleanup deployments — one real defect fixed
- **`personal-companion` drift (#2859)** was the only true drift: main `1.30.0-checkin-anchored` had been undeployable since 18:10Z because `worker.js` carried an unresolved relative import (`import * as WBW from "./wellbeing-wire.js"`) but `direct_content_deploy.py` uploads a single module → error 10021 "No such module wellbeing-wire.js". Live stayed at `1.29.0-wellbeing-loop`.
- **Fix:** bundled the three modules (`worker.js` + `wellbeing-wire.js` + `wellbeing.js`) into one self-contained `worker.js` (esbuild `--external:cloudflare:workers`). Verified no relative/node imports remain, `GenerationFlow` still extends `WorkflowEntrypoint`, `worker_default` exports `fetch`, VERSION intact. All 34 personal-companion suites pass (147/147 wellbeing assertions). Deployed via `direct_content_deploy.py` (HTTP 200, version `1.30.0-checkin-anchored`). **PR #1408 merged.**
- **`qnfo-research-exec` live-ahead** (`0.18.31` vs main `0.18.30`) — reconciled by concurrent session commit `a317995f`; main now matches live.

### 3. Workers functioning and up to date — VERIFIED
- Fleet state: **30 workers, 30 probes, 25 scheduled, all "OK", `err_active: 0`**.
- `personal-companion` live now serves the bundled `1.30.0` (Workers API returns inlined `wellbeing.js` content).

## Remaining items — handed server-side

Two open high-priority issues are now **resolvable by this session's work** (not yet auto-closed):

- **#2859 PERSONAL-COMPANION-UNDEPLOYABLE-1** — fixed by PR #1408 (bundled worker deployed live). Close it: the live worker is `1.30.0-checkin-anchored` and the `direct_content_deploy` path now succeeds.
- **#2849 STALE-PR-CONFLICT-REPAIR-1 PR 1378** — moot; PR #1378 was closed as superseded. Close it.

Open high-priority issues that remain genuine (not touched this thread):

- #2860 CONSUMER-CI-LOOP-1 — remediation-consumer re-triggers itself through workflow_run.
- #2855 LOOP-BREAKER-1 — qnfo-code-orchestrator fleet_tick UNIQUE constraint.
- #2850 DEPLOY-CANONICAL-KEY-EMPTY-1 — canonical-deploy refuses (OPS_ROUTER_AUTH_KEY empty).
- #2847 REVISE-STRIDE-1 — 135 items wait in revise, stage drains too slow.
- #2846 DOI-RECONCILE-1 — 598 published papers carry no DOI.
- #2845 SINGLE-PATH-1 — evidence persistence < 2 live paths.
- #2844 RUN-OBSERVABILITY-1 — 37/45 processes have no observable run record.
- #2842 LOOP-BREAKER-1 — qnfo-ops shell_exec exited.
- #2837 SLA-INSTRUMENT-1 — 42/44 processes assert an SLA no table enforces.
- #2834 EVOLVE-1 — queue:research-head-stalled.
- #2830 MERGE-BOUNDARY-GATE-1 — PR validates only changed dirs.
- #2829 EMPTY-REPLY-RATE-ALERT-1 — ai_model_health says ok for a model that answers empty.
- #2828 MODEL-QUALITY-PARITY-1 — no instrument measures answer quality after a model switch.
- #2827 DOD-CHECKABLE-1 — 32 contracts define done as intent.
- #2826 PATHS-UNTESTED-1 — 21/58 controls declare an untested alternate path.
- #2825 PARK-RISK-WATCH-1 — REVIEW-TRIAGE-CAP-1 cap gate.
- #2821 STALE-PR-CONFLICT-REPAIR-1 PR 1347.
- #2820 [self-heal] tool run_code failing x12.

Backlog: 206 open / 273 resolved / 349 wontfix / 1990 closed.

## Notes for the next session
- GitHub's `schedule` event never fires on QNFO/qnfo-workers — use `repository_dispatch` (PROBE-CADENCE-1 from qnfo-cloud-ops) or `direct_content_deploy.py` for periodic/deploy work.
- The `deploy_drift_cf` table may still show `personal-companion` "due" and `qnfo-research-exec` "live-ahead" until the next drift-guard cycle (every ~20 min); both are stale-audit artifacts, not real drift.
- Do not delete the ~26 unmerged local `chatbox/*` branches — they are concurrent-session in-flight work.
