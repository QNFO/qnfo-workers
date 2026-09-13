# SUPERSEDED — this directory is not what runs

Recorded by qnfo-ops 2026-09-13. Verified against live fleet state, not inferred.

## The topology change

`qnfo-fleet-control/wrangler.toml` states, verbatim:

> MERGE WAVE A (2026-09-11): qnfo-fleet-advisor + qnfo-fleet-calibrator + qnfo-fleet-deploy merged
> into ONE worker (3 -> 1). Subsystems dispatched by path: `/advisor/*`, `/cal/*`, else deploy
> control plane.
> Cron dispatch: `*/20 * * * *` -> advisor; `0 3|0 4 1|30 3 1` -> calibrator; else -> deploy.

Corroborating live evidence:

| probe | result |
|---|---|
| `service_registry` row | `qnfo-fleet-control` v0.4.11, purpose "Merged fleet control (wave A): advisor audits + calibration baselines + deploy scan/heal/redeploy" |
| `fleet_status` | lists `qnfo-fleet-control`; does **not** list `qnfo-fleet-deploy` |
| `service_discover qnfo-fleet-advisor` | `service: null` — the advisor has no registry row of its own |
| `cloud_ops_events` | `advisor-audit` kind, 113 events since 09-12, last 2026-09-13T13:20:57Z — the advisor runs inside the merged worker |
| `qnfo-fleet-control/worker.js` | 75,875 B, sha `d9d438f0`; first module is `var advisorMod = (function(){ ... var WORKER = "qnfo-fleet-advisor"; ... })()` |

## Consequence for patches in this directory

`PATCH-2026-09-13-downgrade-guard.mjs` (and any future patcher here) edits
`qnfo-fleet-deploy/worker.js`, which **nothing executes**. Applying it changes no behaviour.

The merge-aware replacement is:

    qnfo-fleet-control/PATCH-2026-09-13-downgrade-guard-bundle.mjs

## What is still true here

- `wrangler.toml` (`name = "qnfo-fleet-deploy"`, cron `0 * * * *`, bindings AUDIT + CANONICAL)
  is the pre-merge spec. The `0 * * * *` cron survives in `qnfo-fleet-control`'s trigger list,
  which is why the hourly `:01` deploy attempts in `fleet_deploys` continue.
- `README.md` remains the clearest statement of the intended safety posture — and its two
  documented defaults are both inverted in production:

      enabled    = 1   (documented default 0)
      auto_heal  = 1   (documented default 0)

  The README itself says: *"Do NOT enable auto_heal until canonical bundles are synced ahead of
  deployed versions."* `fleet_drift_report` holds 1,492 drift rows across 50 workers, so that
  precondition is not met.

## Unresolved

`fleet_deploys` shows this worker's ledger firing hourly at `:01` through 2026-09-13T13:01:23Z,
while `fleet_status` never lists `qnfo-fleet-deploy`. Whether that is a listing-scope artefact or
a genuinely separate deployer was not determined. Do not assume either.
