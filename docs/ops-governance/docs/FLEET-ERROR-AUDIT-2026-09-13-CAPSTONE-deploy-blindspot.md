# VERIFICATION 8 — CAPSTONE: the storm fix is unreachable because the worker is invisible to the deploy machinery

Date: 2026-09-13. This is the structural answer to the audit's largest defect.

## The finding

`qnfo-pipeline-ops` is the source of **931 alerts all-time / 72 in the 24h to 14:08Z** — every
critical alert in this audit. Its fix has been committed three times (v0.5.3 alert dedup,
v0.5.4 summary fingerprint, v0.5.5 race+triage). None has deployed.

I had attributed that to path shadowing (`ADDENDUM-deploy-path-shadow`) and, earlier, to a missing
deploy route. **Both are secondary. The primary cause is that the deploy machinery does not know
this worker exists.**

```
SELECT COUNT(*) FROM fleet_drift_report WHERE worker='qnfo-pipeline-ops';   -> 0   (never scanned)
SELECT COUNT(*) FROM fleet_deploys      WHERE worker='qnfo-pipeline-ops';   -> 0   (never deployed)
SELECT COUNT(DISTINCT worker) FROM fleet_drift_report;                      -> 62
```

**Zero drift rows and zero deploy rows, ever, across 1,708 drift rows covering 62 distinct
workers.** Of six names I tested for presence in `fleet_drift_report`:

| worker | in `fleet_drift_report`? |
|---|---|
| `qnfo-cloud-ops` | yes |
| `qnfo-fleet-advisor` | yes |
| `qnfo-observability` | yes |
| **`qnfo-pipeline-ops`** | **no** |
| **`qnfo-fleet-deploy`** | **no** |
| **`qnfo-idea-triage`** | **no** |
| **`qnfo-error-selfheal`** | **no** |

## Why this is the capstone

The chain is now closed end to end:

1. `qnfo-pipeline-ops` is absent from `service_registry` (55 names) — measured earlier.
2. It is absent from `fleet_drift_report` (62 distinct workers) — measured now.
3. It is absent from `fleet_deploys` (76 rows) — measured now.
4. **Therefore no commit to its source can ever ship through the standard path**, regardless of
   path shadowing, tombstones, or runners. The scanner has no row for it and no deploy is attempted.
5. Yet it **demonstrably runs**: it writes a `cloud_ops_events kind='health'` heartbeat and alerts
   every 15 minutes, and has done so for the whole period covered by this audit.

So the remedy is not a patch, a tombstone, or a dispatch. It is **making the worker visible**:
either register it so the scanner picks it up, or deploy it manually with `wrangler deploy` from
`QNFO/qnfo-workers/qnfo-pipeline-ops/`.

## This reframes my own contribution

The runner I added (`apply-staged-patchers.yml`, commit `7f4a9d0b`) patches
`qnfo-research-exec/worker.js` — and `qnfo-research-exec` **is** in the scan set, so for that
worker the runner is the right instrument. **For `qnfo-pipeline-ops` no patcher and no runner can
help**, because the deploy path never looks at it. My earlier framing — "the fix exists and is
undeployed" — was right about the symptom and wrong about the mechanism, twice.

## Three rosters, none reconciled

| roster | count | source |
|---|---|---|
| `service_registry` | 55 | `service_discover` |
| `fleet_status` deployed census | 55 | fleet probe |
| `fleet_drift_report` scanned set | **62** | drift scanner |
| `fleet_probe_log` ghost roster (100% fail) | **12** | ticket 701 / `VERIFICATION-7` |

Four overlapping, mutually inconsistent lists of what the fleet is. A worker can be running,
alerting hourly, and present in none of them — which is exactly the case here.

## What is needed

1. **Register or explicitly retire `qnfo-pipeline-ops`.** Until it is in the scanned set, the
   931-alert storm cannot be fixed by any source change.
2. Reconcile the four rosters into one authoritative list.
3. Only then do the v0.5.3/v0.5.4/v0.5.5 fixes have any prospect of shipping.

None of the three is possible from this endpoint: `service_registry` is written by a
registration path this endpoint does not hold, and a manual `wrangler deploy` needs a machine with
the Cloudflare credential — the same credential class as the P0 finding below.

## Standing

Unchanged: H1 (fix not live), H2 (19 NL rows masked as `status='ok'`, plus a live Zenodo 504 at
14:16Z), H3, P0 (9 credential objects readable in bound `BACKUPS_R2`), tickets 691–712, the
research-exec tombstone test still pending at `fleet_drift_report` max id 1708.
