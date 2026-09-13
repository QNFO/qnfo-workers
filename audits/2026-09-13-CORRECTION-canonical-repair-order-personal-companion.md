# CORRECTION — the prescribed canonical repair is safe for `qnfo-cloud-ops` and DESTRUCTIVE for `personal-companion`

Date: 2026-09-13 (qnfo-ops / ops-exec). Every figure is a live tool return from this session.
Clarifies `audits/2026-09-13-CORRECTION-git-is-the-deployer-upstream.md` §6 and
`audits/2026-09-13-REMEDIATION-EXECUTED-unshadow-and-deploy-loop-diagnosis.md` §3, which both prescribe
"replace the two corrupted canonicals with valid bare JS at their GitHub paths — the deployer will then
cache and deploy them."

## 1. The prescription is not symmetric

| worker | corrupted canonical | version it carries | effect of repairing it |
|---|---|---|---|
| `qnfo-cloud-ops` | multipart upload body, 121,107 B | `1.14.1-gtd-guard` — **same release as deployed** | behaviour-preserving; stops a futile hourly PUT |
| `personal-companion` | missing the `GenerationFlow` export | **`1.0.0`** — live is **`v1.1.0`** | **deploys an older worker over the only working reading site** |

For `personal-companion` the repair does not "restore" anything. The repo contains no newer source to
promote: `personal-companion/worker.js` and `personal-companion/deployed-current.worker.js` are the
**same blob**, `c06edffb22f3cefeed2d7568e1a7275f076320cc`, both 62,666 B, both `VERSION = "1.0.0"`,
while `GET https://personal-companion.q08.workers.dev/health` returns **`v1.1.0`**, 7 pieces.

## 2. Proof that repairing the bundle would make the downgrade LAND

The deployer has already computed the target. `fleet_deploys`, verbatim, five consecutive hourly rows —
`worker=personal-companion, actor=deploy, from_sha=v1.1.0, to_sha=1.0.0, ok=0`:

| id | ts | from_sha | to_sha | error |
|---|---|---|---|---|
| 62 | 2026-09-13 06:01:45 | `v1.1.0` | `1.0.0` | HTTP 400 `Workflow GenerationFlow must be exported or a script_name must be specified` |
| 60 | 2026-09-13 05:01:38 | `v1.1.0` | `1.0.0` | same |
| 58 | 2026-09-13 04:01:38 | `v1.1.0` | `1.0.0` | same |
| 56 | 2026-09-13 03:01:43 | `v1.1.0` | `1.0.0` | same |
| 54 | 2026-09-13 02:01:39 | `v1.1.0` | `1.0.0` | same |

`source_path = r2:qnfo-canonical/personal-companion.js` on every row. The loop is **not** mis-identifying
a version — `to_sha` is literally `1.0.0`. Only the bundle's invalidity is preventing the PUT from
succeeding. Remove that one obstacle and the same PUT succeeds with the same target.

So the two prescribed remedies conflict: the `qnfo-cloud-ops` repair is required, and the
`personal-companion` repair as written is the outage. Do them in this order, or not at all:

1. `qnfo-cloud-ops` canonical → valid bare JS (same version). Safe.
2. `personal-companion` canonical → **only** together with (a) the v1.1.0 source, which is at no path
   this endpoint can reach, or (b) `personal-companion` excluded from `redeploy()` — otherwise the
   repair itself takes reading.q08.org down and destroys the only copy of the gate-carrying worker.

## 3. The loop is live and otherwise working — do not dismiss it as broken

Same table, minutes after the rows above: id **64**, `ai-health-prober`, `2.3.1 -> 2.3.3`,
`redeployed`, **`ok:1`**, ts `2026-09-13 07:00:53`. Corroborated by `fleet_drift_report` id **1554**,
`ai-health-prober`, `canonical-ahead`, ts `2026-09-13 07:00:49`. The deploy control plane fires hourly
and succeeds when the canonical is well-formed. `personal-companion` fails *because of its bundle*, not
because the deployer is down.

## 4. My own error, recorded

Earlier on 2026-09-13 this session retracted the "deploy loop is attempting to revert the worker" claim,
on the evidence that `cloud_ops_events` has only one deploy-shaped `kind` (n=1) and that
`qnfo-fleet-deploy` is absent from the 55-worker `fleet_status`. **That retraction was wrong and is
withdrawn.** The deployer is cron-driven and does not appear in the CF-API worker listing; its ledger is
`fleet_deploys`, which I did not query before publishing the negative.

Same failure mode as the two already recorded in
`audits/2026-09-13-VERIFY-reading-patch-unapplied-and-attribution-errata.md` §1: an absence of evidence
**in the table I chose to test** converted into a claim of absence. Second instance today. The primary
observation was one table away the whole time.
