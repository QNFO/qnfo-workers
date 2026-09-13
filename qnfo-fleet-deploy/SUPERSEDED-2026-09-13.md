# SUPERSEDED — this directory is not what runs

Recorded by qnfo-ops 2026-09-13. Verified against live fleet state, not inferred.
Updated 2026-09-13T13:41Z with the topology question RESOLVED and the tombstones applied.

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
| `cloud_ops_events` | `advisor-audit` kind, 365 events, last 2026-09-13T13:20:57Z — the advisor runs inside the merged worker |
| `qnfo-fleet-control/worker.js` | 75,875 B, sha `d9d438f0`; first module is `var advisorMod = (function(){ ... var WORKER = "qnfo-fleet-advisor"; ... })()` |

## RESOLVED 2026-09-13T13:41Z — "listing-scope artefact, or a genuinely separate deployer?"

Original open question: `fleet_deploys` shows an hourly `:01` ledger while `fleet_status` never lists
`qnfo-fleet-deploy`. **Answer: listing-scope artefact — and the reading was wrong.**

| probe (this turn) | result |
|---|---|
| `https://qnfo-fleet-deploy.q08.workers.dev/health` | **HTTP 404** — no worker exists at that name |
| `https://qnfo-fleet-control.q08.workers.dev/health` | 200 `{"status":"ok","worker":"qnfo-fleet-deploy","version":"0.4.11","enabled":true,"auto_heal":true}` |
| `service_registry` | 55 rows; `qnfo-fleet-control` present, `qnfo-fleet-deploy` **absent** |
| `SELECT DISTINCT worker FROM fleet_drift_report WHERE worker LIKE '%fleet%'` | qnfo-fleet-advisor, qnfo-fleet-dashboard, fleet-executor, fleet-scheduler, **qnfo-fleet-control** — no qnfo-fleet-deploy |
| `SELECT DISTINCT worker FROM fleet_deploys` | 14 names, none `qnfo-fleet-deploy` |
| latest scan (id 1689, 13:03:53Z) | `scanned=55` == `service_registry` row count → the scan set is **registry-keyed** |

Three corrections that follow:

1. **The hourly `:01` rows are not this worker's ledger.** They are `personal-companion` deploy
   failures — `fleet_deploys` ids 65–74, `v1.1.0 -> 1.0.0`, `ok=0`, HTTP 400 code 10021
   "Workflow GenerationFlow must be exported or a script_name must be specified", once per hour
   07:01 → 13:01Z. The `0 * * * *` cron survives in `qnfo-fleet-control`'s trigger list; that is what
   drives the hourly attempt.
2. **The `/health` self-report is stale code text, not a second worker.** The deployed script name
   and route are `qnfo-fleet-control`; the body still says `worker: "qnfo-fleet-deploy"`. This is the
   "2 differ only by tag suffix or self-reported script name" class in the autonomy-gap census.
3. **The README's documented fail-closed defaults are inverted in production.** README: *"Kill-switch
   (fleet_deploy_state.enabled) + auto_heal flag BOTH default '0' (fail-closed)"* and *"Do NOT enable
   auto_heal until canonical bundles are synced ahead of deployed versions."* Live `/health` returns
   `enabled: true, auto_heal: true`. Those flags live in `qnfo-audit.fleet_deploy_state`, so **any**
   deployer reading that row inherits the inverted state.

## ACTION TAKEN — both resolver-visible candidates tombstoned

| path | prior blob sha | prior size | commit |
|---|---|---|---|
| `qnfo-fleet-deploy/deployed-current.worker.js` | `ed539ec3254633ed265aa344bbbcffd6cc5fdc9d` | 24,761 B | `db9d2fdb` |
| `qnfo-fleet-deploy/worker.js` | `ed539ec3254633ed265aa344bbbcffd6cc5fdc9d` | 24,761 B | `4c815079` |

Prior content was **byte-identical at both paths** (same blob sha), archived in git and retrievable
via `github_repo_read repo=QNFO/qnfo-workers path=qnfo-fleet-deploy/worker.js ref=ed539ec3`.

Why a `404:` tombstone and not a stub: the deploy resolver explicitly honours the `404:` prefix and
skips the candidate. A stub carrying a valid VERSION **would** be uploaded and would replace the live
worker; a tombstone cannot. This is the same instrument already used for `qnfo-cloud-ops`
(commit `927ccb8d`).

Why it was needed at all: this was the **pre-guard** v0.4.10/v0.4.11 deployer
(`VERSION 0.4.11`, `NO_SELF = ["qnfo-fleet-deploy"]`). Its `newer()` comparator and `canonical()`
candidate order are the pre-fix versions — the ones that misparse `v`-prefixed and build-tag
versions and can compute a downgrade. Had it been redeployed it would have read the same
`fleet_deploy_state` row (`enabled=1, auto_heal=1`) and resumed healing the fleet with the unguarded
comparator. The guard that exists to prevent this is
`qnfo-fleet-control/PATCH-2026-09-13-downgrade-guard-bundle.mjs`.

## STILL OPEN (unchanged by the tombstone)

1. **The LIVE `qnfo-fleet-control` bundle is still unguarded.** The merge-aware patch cannot be
   validated: `qnfo-fleet-control/worker.js` is 75,875 B and the read tool caps at 32,768 chars with
   no offset, so only the advisor module is reachable. Anchor counts are inherited from the
   pre-merge file, which is why the patcher fails closed. Staged, not validated.
2. **The comparator defect is live right now** — `personal-companion` downgrade attempt, hourly,
   `ok=0` (ids 65–74).
3. `qnfo-fleet-deploy/wrangler.toml` still carries `name = "qnfo-fleet-deploy"`. An accidental
   `wrangler deploy` in this directory would now upload the tombstone text (not JS) and fail at the
   API — loud, not silent. Do not "fix" it by restoring the source; recreate the name only from a
   guarded bundle.
