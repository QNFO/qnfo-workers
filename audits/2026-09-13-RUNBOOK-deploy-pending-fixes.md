# RUNBOOK — deploy the three pending fleet fixes, then restore auto-heal

Date: 2026-09-13. Author: qnfo-ops endpoint (Chatbox session).

**Status: NOT EXECUTED.** This endpoint cannot perform it. `web_fetch` is GET-only and `run_code`
has no network access, so no `POST`/`PUT` to any deploy route is reachable regardless of tokens.
`qnfo-fleet-control` (the deployer) also reports `routes: null` in `service_registry`, and its
`worker.js` is 75,875 B against a 32,768-char read cap, so it cannot be patched from here either.

Everything below was verified this session. The fixes are **already written and verified**; they
need transport, not authoring.

## Current interlock state (verified)

| key | value | set |
|---|---|---|
| `fleet_deploy_state.auto_heal` | **`0`** | 2026-09-13 14:15:02 |
| `fleet_deploy_state.enabled` | `1` | 2026-09-08 16:25:49 |

`auto_heal=0` is deliberate. See "Do not do this first" below.

## Step 1 — `qnfo-pipeline-ops` v0.5.5 (highest value: 802 critical alerts)

Source: `qnfo-pipeline-ops/worker.js`, 20,030 B, sha `a7580136`.
Contains fingerprint-gated alert dedup, the `AUTOINCREMENT` id fix (the old `MAX(id)+1` raced
`qnfo-fleet-advisor`'s `*/20` cron and silently dropped tickets), and a real triage drain.

```
cd qnfo-workers/qnfo-pipeline-ops && wrangler deploy
```

Verify — all three must hold:

1. `pipeline_state` now exists (proves the new build is serving):
   `SELECT name FROM sqlite_master WHERE name='pipeline_state'`
2. The alert rate collapses. Baseline measured this session: 802 criticals all-time, 66 since
   midnight, newest 14:01:22.
   `SELECT COUNT(*) FROM alerts WHERE source='qnfo-pipeline-ops' AND level='critical' AND created_at >= '<deploy time>'`
3. `/health` reachability: today `https://qnfo-pipeline-ops.q08.workers.dev/health` returns **404**.
   If it still 404s after deploy, the worker has no public route — that is a separate finding, not a
   failed deploy.

Rollback: `wrangler rollback` from the same directory.

## Step 2 — `qnfo-observability` v1.1.6 (unblocks the multi-module deploy)

Source: `qnfo-observability/worker.js`, 37,386 B, sha `c72736a8`, `v1.1.6-single-module`.
`v1.1.4` and earlier did `import { FLEET } from './fleet.js'`, making it a two-module worker, but
the control plane deploys from a single R2 key — hence
`HTTP 400 code 10021 No such module "fleet.js"` (fleet_deploys id 76). FLEET is now inlined, so the
worker is single-module and `wrangler deploy` will carry it.

```
cd qnfo-workers/qnfo-observability && wrangler deploy
```

Then reconcile the three conflicting version claims for this one worker: `service_registry` says
`1.2.0`, `fleet_drift_report` says canonical `1.1.4`, and the repo source is `1.1.6`. Pick one and
write it to both the registry and the canonical.

Rollback: `wrangler rollback`.

## Step 3 — repair the `qnfo-cloud-ops` canonical (do NOT deploy from R2)

25 consecutive hourly failures, `ok=0`, `SyntaxError: Invalid or unexpected token at worker.js:1:2`.
The repo source `qnfo-cloud-ops/worker.js` (129,457 B, sha `59dd468d`) is **valid JavaScript**
beginning with `import { connect } from "cloudflare:sockets";`, so the corruption is in
`r2:qnfo-canonical/qnfo-cloud-ops.js`, not the source.

Action: regenerate the R2 canonical from the repo source, then let the deployer retry. Do **not**
hand-edit the R2 object.

## Step 4 — wire the comparator, THEN re-enable auto-heal

`qnfo-fleet-control/version-compare.mjs` is the corrected comparator. Rule 5 (equal cores with
differing suffixes ⇒ `UNORDERABLE`, never ordered) is load-bearing: a naive semver rule would order
`3.6.1` above `3.6.1-subscribers` and **downgrade the live gateway**, and would order `1.14.1` above
`1.14.1-gtd-guard` and strip the cloud-ops guard.

PR #1 adds a CI job that runs `version-compare.test.mjs` and asserts those invariants. Verified
independently this session by transcribing the functions and executing them: **17 passed, 0 failed**
(the module header's "20/20" claim is wrong — the suite holds 17 assertions). Six extra adversarial
probes all fail closed, including `canonical=''` and `deployed=null`.

Wire it into `qnfo-fleet-control/worker.js` (the wiring patch
`PATCH-2026-09-13-downgrade-guard-bundle.mjs` could not be validated from the ops endpoint), deploy,
and only then:

```sql
UPDATE fleet_deploy_state SET value='1' WHERE key='auto_heal';
```

Watch the next hourly scan. Success = `fleet_deploys` gains no new `personal-companion` row.

## Do not do this first

`personal-companion` has 30 deploy attempts, every one `v1.1.0 -> 1.0.0`. Live
`https://reading.q08.org/health` = **`1.1.0`, pieces 8**. The loop wants to install `1.0.0`, a
downgrade. The **only** thing stopping it is that the uploaded artifact lacks the `GenerationFlow`
export, so Cloudflare rejects it with 10021.

**Fixing the 10021 rejection before wiring the comparator converts a benign 400 into a live
production downgrade, hourly, with `auto_heal=1` and nothing to stop it.** That is why the
`FINDING-*-DO-NOT-FIX-10021.md` documents exist, and why `auto_heal` was set to `0`.

## Also recommended, and not executed here

Add `qnfo-pipeline-ops` to `service_registry`. The deploy scan set is registry-keyed
(`scanned=55` == `service_registry` rows = 55) and this worker has **no registry row**, so it is
never scanned — which is one reason its v0.5.5 fix never shipped. NOT done from the ops endpoint:
the R2 canonical for this worker is unreadable here, so enabling the scan could deploy an artifact
older than production.
