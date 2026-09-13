# FINDING — two deleted workers are still referenced by live probe lists and a live service binding

Date: 2026-09-13. Author: qnfo-ops. Every value below is a tool return from this session.

## The deleted workers

`fleet_probe_log` records both as missing from Cloudflare, repeatedly:

| id | name | url | ok | status | body | ts |
|---|---|---|---|---|---|---|
| 19964 | `qnfo-error-selfheal` | `https://qnfo-error-selfheal.q08.workers.dev/health` | 0 | 404 | `error code: 1042  \| script missing from live CF list (deleted?)` | 2026-09-12T09:15:45Z |
| 19953 | `qnfo-auditor` | `https://qnfo-auditor.q08.workers.dev/health` | 0 | 404 | `error code: 1042  \| script missing from live CF list (deleted?)` | 2026-09-12T09:15:45Z |
| 19893 | `qnfo-error-selfheal` | same | 0 | 404 | same | 2026-09-12T09:00:54Z |
| 19873 | `qnfo-auditor` | same | 0 | 404 | same | 2026-09-12T09:00:54Z |
| 19810 | `qnfo-error-selfheal` | same | 0 | 404 | same | 2026-09-12T08:45:44Z |
| 19795 | `qnfo-auditor` | same | 0 | 404 | same | 2026-09-12T08:45:44Z |

Corroborating absence from every roster I checked:

- `fleet_status` — **55 workers, neither present** (confirmed by reading the full list).
- `service_registry` — `WHERE service LIKE '%auditor%'` → **0 rows**; `%error-selfheal%` → **0 rows**.
- Both are 404 at their own `.q08.workers.dev` hostnames.

The repo still contains `qnfo-auditor/` and `qnfo-error-selfheal/` directories, which is presumably why
they were never pruned from the configs below.

## They are still wired into live configuration

`qnfo-fleet-control/wrangler.toml`, read verbatim this session:

```toml
PROBE_WORKERS = "qnfo-ai,qnfo-ops,qnfo-kaizen,qnfo-paper-reviser,qnfo-outreach,qnfo-research-exec,qnfo-error-selfheal,qnfo-fleet-control,qnfo-auditor,qnfo-social,qnfo-intent-orchestrator,qnfo-cloud-ops,qnfo-gateway,qnfo-infra"

[[services]]
binding = "SVC_QNFO_AUDITOR"
service = "qnfo-auditor"
environment = "production"
```

**Two of the fourteen `PROBE_WORKERS` entries are deleted scripts**, and there is a **service binding to
a deleted worker**. `probeHealth()` iterates `PROBE_WORKERS` and pushes every non-ok result into
`down[]`, so both are structurally guaranteed to report down on every advisor run, forever.

## Consequences, all currently live

1. **An open high-severity anomaly that cannot self-clear.** `fleet_cal_anomalies` id=3:
   `probe_id=qnfo-auditor-health`, `severity=high`, `status=open`,
   `detail="probe-failure status:404 body:error code: 1042  retry-failed"`,
   `first_seen=2026-09-12T03:01:13Z`, `last_seen=2026-09-13T03:31:09Z`. It has been open ~36h and will
   stay open, because the fix is not on the target's side.
2. **A permanent 404 stream** in `fleet_probe_log` at ~15-minute cadence for both names.
3. **Kaizen noise.** `kaizen_candidates` carries `event-cluster` rows for `qnfo-error-selfheal/alert x15`
   (n=49) and `worker-health/alert x7` (n=11), the latter still `proposed`.
4. **A service binding that cannot resolve** — `SVC_QNFO_AUDITOR` → `qnfo-auditor`. Any code path using
   it fails at runtime rather than at deploy time.

## Same defect class as the rest of this audit

This is the third instance in this audit of a monitoring surface asserting a condition that its own
evidence contradicts, or that no longer has a referent:

- `worker-health` alerts on `qnfo-ai-chat`, `personal-api-chat`, `qnfo-idea-factory` — none exist.
- `ai_model_health` reports 20/20 `ok` while `ai_gateway_failures` shows 45–47 failures/model/24h.
- `ai_calibration_results` id=15975 marks probe `endpoint`/`deepseek-direct/models` **`status:"fail"`**
  with **`detail:"http=200"`**, on every 30-minute run (27 pass / 1 fail, `digest.failing: []` empty, so
  the digest never surfaces it).

In each case the probe or flag is the thing that is wrong, and in each case the defect is invisible to
the fleet's own alerting because the alerting is what is broken.

## Not fixable from this endpoint

Every fix is a config change: remove the two names from `PROBE_WORKERS`, drop or repoint
`SVC_QNFO_AUDITOR`, and delete the `qnfo-auditor-health` probe from the calibration worker. All live in
worker `vars`/bindings and require `wrangler deploy`. I deliberately did **not** mark
`fleet_cal_anomalies` id=3 `resolved`: the probe still fails, so it would re-open within 30 minutes, and
resolving it would hide a config defect that should actually be fixed. Recorded only.
