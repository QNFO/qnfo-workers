# SUPERSEDED — this directory is not what runs

Recorded by qnfo-ops 2026-09-13. Verified against live fleet state, not inferred.

## The topology change

MERGE WAVE A (2026-09-11) folded **qnfo-fleet-advisor + qnfo-fleet-calibrator + qnfo-fleet-deploy**
into ONE worker: `qnfo-fleet-control` (route `qnfo-fleet-control.q08.workers.dev`), dispatching by path
(`/advisor/*`, `/cal/*`, else deploy control plane). The advisor is a *module* inside that bundle
(`var advisorMod = (function(){ ... var WORKER = "qnfo-fleet-advisor"; ... })()`), not a worker.

| probe (2026-09-13) | result |
|---|---|
| `https://qnfo-fleet-advisor.q08.workers.dev/health` | **HTTP 404** — the name is unclaimed |
| `service_registry` | 55 rows; no `qnfo-fleet-advisor` row |
| drift scan id 1689 (13:03:53Z) | `scanned=55` == registry row count → this name is not enumerated |
| `fleet_deploys` | n=3, last **2026-09-09 19:39:57**, `oks=1` (historical) |
| `fleet_drift_report` | historical rows only |
| `cloud_ops_events` | kind `advisor-audit`, 365 events, last 2026-09-13T13:20:57Z — **the advisor runs**, inside the merged worker |

`wrangler.jsonc` here still declares `name = "qnfo-fleet-advisor"`, `main = "src/server.js"`,
cron `*/20 * * * *`, custom domain `qnfo-fleet-advisor.qnfo.org`. Note that the deploy resolver never
reads `src/server.js` — its resolver-visible candidate is `deployed-current.worker.js`, which is the
file tombstoned below. (An earlier fix written to `src/server.js` was inert for exactly this reason.)

## ACTION TAKEN — resolver-visible candidate tombstoned

| path | prior blob sha | prior size | commit |
|---|---|---|---|
| `qnfo-fleet-advisor/deployed-current.worker.js` | `7d765675fc97b0772d8e69d161b442095f39a0ae` | 19,074 B | `a7589bb5` |

Content preserved byte-for-byte in git; retrieve with
`github_repo_read repo=QNFO/qnfo-workers path=qnfo-fleet-advisor/deployed-current.worker.js ref=7d765675`.

Why a `404:` tombstone: the resolver honours the `404:` prefix and skips the candidate, whereas a stub
carrying a valid VERSION would be uploaded. Why at all: re-enumerating this name would run a second
`*/20` advisor (ensemble advice via llama-3.3-70b + gpt-oss-120b adversarial review, sweeping
`PROBE_WORKERS` = 14 workers) in parallel with the merged worker's own advisor subsystem — two
actuators writing the same audit tables, uncoordinated.

## STILL OPEN

1. `wrangler.jsonc` still names this worker; a `wrangler deploy` here would upload the tombstone text
   and fail loudly at the API (not silently resurrect). Do not "fix" that by restoring the source.
2. The **live** `qnfo-fleet-control` bundle is still unguarded against version-comparator downgrades:
   its 75,875 B `worker.js` exceeds the 32,768-char read cap available to qnfo-ops, so the merge-aware
   patch cannot be validated. Staged, not validated.
