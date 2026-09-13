# FLEET-WIDE PRODUCTIVITY AUDIT + CONSOLIDATION PLAN
WBS P0-P9 · generated 2026-09-13 by qnfo-ops (ops-exec) · all numbers from live tool calls

## VERDICT ON THE PREMISE
"Too many workers doing little or no actual work" is NOT SUPPORTED by the invocation data.
All 40 scheduled workers execute at or above their designed rate. Measured req24 vs expected24:
req24 range 1 -> 1663; 35 of 40 have req24 >= 3; 38 of 40 have req24 >= expected24.
The 15 non-scheduled workers are services/apps by design (qnfo-gateway alone: 157,988 req/30d,
highest-traffic worker in the fleet). They are pull-based, not idle.

## P0 — MEASUREMENT INTEGRITY (blocks every consolidation decision)
- P0.1 TRACE-STALL. worker_logs frozen 76.22h (ts_ms 2026-09-10T10:15:58.174Z). 58 script_names
  present, none current. Logpush ingestion dead + qnfo-observability cursor. Issues 702, 752.
- P0.2 ISSUE-LEDGER SPRAWL. 45 open, ALL source='qnfo-ops', filed in one 68-min burst
  (14:15:25Z -> 15:23:20Z). Five competing open-backlog numbers (D1 45 / dashboard 14 /
  report_card 12 / backlog-exec / issue_ledger). Issues 714, 715.
- P0.3 WRITE-GUARD CHANGE-COUNT UNRELIABLE. ops_d1_write returned changes:0 for two UPDATEs that
  DID apply (read-back verified). Reconciliation code trusting `changes` will silently no-op.
- P0.4 OPS-EXEC LATENCY. Dashboard err #1: 225 calls, 26 failed (ok=0), avg 200300ms.

## P1 — RECURRING ALERT CLASSES (4 firing on cron)
- P1.1 WATCH:trace-stall (err) hourly. <- P0.1
- P1.2 WATCH:research-failed (err) hourly. <- research_queue open=4, newest 102h,
  drain=qnfo-research-supervisor (silent since 09-11).
- P1.3 WATCH:agent-issues (warn) when open>20 (now 45). <- P0.2
- P1.4 WATCH:probe-fails (warn). Driver: qnfo.org status 0 ms 10000 at 14:01:34Z yet 200/379ms
  at 14:16:30Z. Intermittent.
- P1.5 worker-health (err) 2x/day 03:05 & 15:05: qnfo-ai / personal-api / *-chat "HTTP 530
  error 1016" while qnfo-ai answers 200 via binding in 48ms => probe-target misconfig.

## P2 — WORKER PRODUCTIVITY
- P2.1 errata-hub: merged from 4 errata workers, declares scheduled handler, NO cron registered.
- P2.2 qnfo-subscribers: claims weekly-digest, no cron registered.
- P2.3 qnfo-research-supervisor: Workflow, nothing since 2026-09-11T14:30Z.
- P2.4 SELF-REWRITE ZERO-YIELD: jnl-referee 48 attempts / 0 ok / hourly, all "snapshot read 404",
  newest 2026-09-13T14:06:15.318Z. 9 workers, 0 successes ever.
- P2.5 GHOST-ROSTER PURGE NOT DEPLOYED: repo registry.js (2026-09-12T06:38:13Z) dropped 25 ghost
  scheduled + 39 ghost probes; live still reports workers:55 scheduled:40 probes:10.
- P2.6 GHOST PROBE TARGETS: ~37 names absent from the live 55, all HTTP 404 on
  https://<name>.q08.workers.dev/health. Repo carries ~100 dirs vs 55 live.

## P3 — ERROR ATTRIBUTION
err24 = 26. qnfo-fleet-dashboard = 18 of 26 (69%) — the monitoring worker is the fleet's largest
error source, from probing dead targets. calendar-api 2; six workers 1 each. Unattributed 0.
=> "numerous errors, warnings and alerts" is predominantly probe noise against retired workers.

## P4 — REGISTRY TRUTH
- Name drift 0 (55 == 55).
- CORRECTED THIS SESSION: qnfo-ops 2.15.7 -> 2.15.10; qnfo-backlog-exec 1.2.7 -> 1.2.8.
- base_url dead for all 55 (http 404) while binding transport returns 200. Wrong transport,
  not downtime. Issue 739.
- qnfo-ai-calibration registry 1.1.4 vs deployed 1.1.5 (issue 721) — needs source diff first.

## P5 — QUEUE HEALTH
- research_queue open=4, newest 102h STALE.
- version_queue error=1 publish failure (high blast radius).
- outreach_queue open=20 needs-contact=20 pending=0 -> SELECTOR-DRIFT (drain selects 'pending',
  producer writes 'needs-contact'). Sends gated to 2026-09-15.

## P6 — DEPLOY/DRIFT CONTROL
- fleet_deploy_state enabled=0, auto_heal=0. Healer disabled.
- fleet_drift_report: newest real drift row 2026-09-08; SCAN notes stop 2026-09-09T02:03:59Z.
- report_card drift_total=1 (unversioned 1).

## P7 — MODEL / AI HEALTH
- ai_model_health 8 of 20 stale. AI latency 16% >60s. Gateway 8 blank/fallback in 24h.
  Checker fail-open posted without fact-check 2026-09-13T06:02:05Z. Request-shape 400s.

## P8 — SECURITY
- Issue 747: fleet-deploy-admin-token + 8 credentials readable via bound R2 tool.

## P9 — DOCUMENTATION / HYGIENE
- Issue 737: ~195 audit artifacts for 2026-09-13 alone.
- Issue 716: 496 malformed Zenodo fragments in 42s.
- Issue 708: fleet_improvements 31 proposed / 44 approved, no consumer.

## BLOCKED
P0.1, P0.4, P1.*, P2.*, P5, P6, P7 need a worker edit + wrangler deploy or CF-API write access.
This endpoint has no workers-script PUT, no CF-API write channel, no shell.
