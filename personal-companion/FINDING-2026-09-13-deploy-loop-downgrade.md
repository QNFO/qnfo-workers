# Finding — an hourly automated loop is attempting to downgrade this worker, and the kill-switch is ON

Date: 2026-09-13. Author: qnfo-ops. Every figure below was read from `qnfo-audit` this session
(`fleet_deploys`, `fleet_deploy_state`, `fleet_drift_report`) and from the live `/health`. Nothing here
is inferred.

This **supersedes the "hypothetical" framing** of `FINDING-2026-09-13-deploy-source-mismatch.md`. That
file said a repo deploy *would* regress production. In fact an automated loop is **already attempting
exactly that, every hour**, and its own records show it has succeeded before.

## 1. The loop targets 1.0.0 while production runs v1.1.0

`fleet_deploys` rows for `personal-companion` — 23 attempts, **4 ok, 19 failed**, from
2026-09-12 08:01 to 2026-09-13 06:01:

| id | ts | from | to | ok | note |
|---|---|---|---|---|---|
| 13 | 09-12 08:01 | v1.0.0 | 1.0.0 | **1** | `redeployed v1.0.0 -> 1.0.0` |
| 14 | 09-12 09:01 | v1.0.0 | 1.0.0 | 0 | **`PUT-ok but deployed still v1.0.0 (wrangler-managed no-op?)`** |
| 15 | 09-12 09:08 | v1.0.0 | 1.0.0 | **1** | `redeployed v1.0.0 -> 1.0.0` |
| 24 | 09-12 10:30 | **v1.1.0** | **1.0.0** | **1** | `redeployed v1.1.0 -> 1.0.0` |
| 26 | 09-12 11:01 | **v1.1.0** | **1.0.0** | **1** | `redeployed v1.1.0 -> 1.0.0` |
| 28 → 62 | 09-12 12:01 → 09-13 06:01 | v1.1.0 | 1.0.0 | 0 | `HTTP 400 … {"code":10021,…}` — **every hour** |

**Every attempt after 10:30 targets a lower version.** This is not drift correction; it is a downgrade,
and rows 24 and 26 record it as *succeeding*.

## 2. `ok = 1` does not mean the deploy took effect

Row 14 is the loop observing its own unreliability: *"PUT-ok but deployed still v1.0.0
(wrangler-managed no-op?)"*. So the `ok` flag can be set on a deployment that changed nothing. Combined
with rows 24/26 reporting a successful `v1.1.0 -> 1.0.0`, while `/health` **today** still reports
`"version": "v1.1.0"`, the only consistent readings are: the downgrades did not actually take, or
something outside the loop restored v1.1.0. **I cannot distinguish those from here, and I am not
asserting either.** What is certain is that `ok=1` in this table is not evidence that a version changed —
the same defect class as every other finding in this audit.

## 3. The kill-switch is ON, against its own documented default

`fleet_deploy_state`, both set **2026-09-08 16:25:49**:

| key | value |
|---|---|
| `enabled` | `1` |
| `auto_heal` | `1` |

The deploy README states: *"Do NOT enable auto_heal until canonical bundles are synced ahead of deployed
versions."* That precondition is **not** met — see §4. Nothing in the loop's records shows `healed`
activity, so whether `auto_heal` deliberately skips `deployed-ahead` cases or is simply inert is **not
established**. That distinction is the whole risk: if it ever treats a *newer* deployed version as drift,
it silently downgrades a live worker.

## 4. Two canonical sources disagree — for both workers

`fleet_drift_report`, recorded hourly:

| worker | deployed | canonical | note | ts (latest) |
|---|---|---|---|---|
| `personal-companion` | **v1.1.0** | **1.0.0** | `canonical-ahead` | 09-13 06:01 |
| `qnfo-ops` | **2.15.1** | **2.13.0** | `deployed-ahead` | 09-13 06:03 |

For `personal-companion` the label reads `canonical-ahead` while the canonical (`1.0.0`) is numerically
**behind** the deployed version (`v1.1.0`) — and the loop's action is to deploy `1.0.0`. The label and the
action point the wrong way. Separately, `qnfo-ops` is `deployed-ahead` (2.15.1 vs canonical 2.13.0), so a
redeploy of *this* endpoint would also regress it. The deploy path sources R2 `qnfo-canonical/*.js` while
the drift scan compares GitHub `deployed-current.worker.js` — **two canonical sources that disagree**, and
for `personal-companion` both are wrong: the GitHub copy is byte-identical to the v1.0.0 `worker.js`.

## 5. Why this invalidates the remediation as currently staged

Every artifact committed today assumes a **v1.1.0** base: `apply-remediation.mjs` patches the v1.0.0
repo copy and would be re-applied to a v1.1.0 source, and both SQL files correct rows in `PERSONAL`
independently of the worker version. **If the hourly loop ever succeeds, it reverts the worker that
serves the corrected text** — and with `auto_heal` on, nothing in the fleet stops it.

## 6. Correction to my own earlier claim

I stated repeatedly this session that *"qnfo-ops exposes no deploy route."* That is true of **this
endpoint's own routes**, which is what I checked. It was too broad: a **separate** deploy control plane
(`qnfo-fleet-deploy`, token-gated) exists and is actively deploying. The accurate statement is that **I
hold no token for it** — not that no path exists. The distinction matters, because "no path exists" reads
as a dead end when the real situation is a live, mis-targeted loop that someone should stop.

## 7. Recommended actions, in order

1. **Set `auto_heal = '0'` in `fleet_deploy_state`** until the canonical sources agree. This is the
   single highest-leverage change and it is reversible.
2. **Fix the `personal-companion` deploy target.** It must not deploy `1.0.0` over `v1.1.0`. Obtain the
   v1.1.0 source and make it the canonical.
3. **Stop treating `ok = 1` as proof.** Row 14 shows the flag can be set on a no-op. Verify the deployed
   version from `/health` after every deploy, and record that instead.
4. Investigate the hourly `HTTP 400 code 10021` — a loop failing 19 of 23 times for 18 hours is either
   broken or being silently tolerated.
5. Reconcile the two canonical sources (R2 `qnfo-canonical/*` vs GitHub `deployed-current.worker.js`)
   before trusting either, and fix the `canonical-ahead` label semantics for `personal-companion`.
