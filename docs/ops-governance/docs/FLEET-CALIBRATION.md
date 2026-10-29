# FLEET CALIBRATION & STRESS-TESTING — qnfo-fleet-calibrator

> Version 1.0.0 (2026-09-04). Canonical source: QNFO/qnfo-workers/qnfo-fleet-calibrator.
> Deployment: `wrangler deploy` from that dir; then `cp worker.js deployed-current.worker.js`.
> Runbook owner: autonomous scheduled layer (CLOUD-FRONTEND-ONLY-1).

## Purpose

Scheduled, server-side, 100% autonomous calibration/stress-testing of fleet-wide
infrastructure performance, with **self-auditing, self-correcting and self-improving**
properties and **reversible autonomous adjustments**. No user effort is required after deploy.

## What runs when (Cloudflare Cron Triggers)

| Cron (UTC) | Type | Content |
|---|---|---|
| 0 3 * * * | daily | Full static probe set (8 HTTP via service bindings + public sites, D1, R2, Vectorize) |
| 30 3 * * 1 | stress (weekly, Sunday) | daily + adversarial input battery + 8-way burst concurrency + plan-weight tuning |
| 0 4 1 * * | monthly | stress + retention cleanup (90d metrics / 30d resolved anomalies / 7d R2 cal prefix) |

Missed crons are detected (NO-CATCH-UP-1 style: schedule-gap recorded, next fire recovers).

## Endpoints

| Route | Auth | Purpose |
|---|---|---|
| GET /health | none | worker/version/last_run/open_anomalies |
| POST /run?type=daily|stress|monthly&simulate=anomaly | X-Run-Key | manual trigger (used by ops + this runbook's verification) |
| GET /diag?url= | X-Run-Key | single fetch diagnostic (browser UA) |
| GET /report | X-Run-Key | runs/anomalies/baselines/actions/learnings JSON |

Secret: `RUN_SECRET` (mirrored to ~/.env CALIBRATOR_RUN_SECRET). Auth compare is timing-safe.

## Self-* design

- **Self-auditing**: every run writes `verdict_score` (completeness/integrity/plausibility checks) + audit_json. Simulate mode proves the detector fires on injected extreme input.
- **Self-correcting**: per-probe retry-once; rollback engine verifies prior autonomous actions every run and reverts drift with an audit row + learning; real anomalies auto-resolve when their probe is clean (verified: vectorize-cal anomaly auto-resolved after the {topK:1} fix). Simulated anomalies are deliberate test artifacts and are resolved manually after verification (they never appear in clean runs by construction).
- **Self-improving**: EMA baselines with variance-adaptive thresholds; 7d failure-rate probe weighting; learnings table; KV config recommendations published to `qnfo-fleet-config/latest`.
- **Autonomous adjustments (allowlist, reversible, binding-only)**: tune-threshold, tune-plan, publish-config, retention-cleanup. Every action has before/after JSON, verified next run, rollback on regression.

## Data model (qnfo-audit D1, fleet_cal_*)

runs / metrics / baselines / anomalies / actions / learnings / state. Probe traffic is
self-generated calibration traffic (IMPRESSIONS-ZONE-NOT-WORKER-1) and never counted as external.
Vectorize probe targets the empty `qnfo-calibration` index (query-path latency only; upsert/retrieval
correctness is owned by the qnfo-memory-mcp search surface).

## Claims & Evidence

| Claim | Evidence | Confidence | Status |
|---|---|---|---|
| Daily run complete with audit score 1.0 | D1 fleet_cal_runs run 189b389b (2026-09-04) | high | VERIFIED |
| Stress run complete with audit score 1.0 | D1 run 61174815 (2026-09-04) | high | VERIFIED |
| Adversarial battery: all cases survive (<500) | run 61174815 metrics adv-* | high | VERIFIED |
| Simulated anomaly detected high (simulate=anomaly) | anomaly id 2: severity high, status resolved, detail test-artifact-resolved-manually | high | VERIFIED |
| Auto-resolve mechanism on clean run | vectorize-cal anomaly id 1 auto-resolved 2026-09-04 04:59Z after probe fix; 0 open anomalies at close | high | VERIFIED |
| Rollback engine verifies prior actions | run roll.checked>0, reverted=0 across runs | high | VERIFIED |
| Service bindings probe siblings (CF 1042 fixed) | run metrics qnfo-ai/infra/auditor 200 | high | VERIFIED |
| 3 cron schedules live | CF schedules API 2026-09-04 | high | VERIFIED |
| Superseded stub qnfo-calibration-audit deleted | CF API DELETE 200 (id 1781ce79) | high | VERIFIED |
