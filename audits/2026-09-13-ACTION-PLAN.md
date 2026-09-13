# ACTION PLAN — ranked remediation for the 2026-09-13 fleet audit

Consolidates the findings committed this session into one ordered sequence. Each step gives the
exact target, the evidence, the prerequisite, and how to verify. Order is by leverage × reversibility,
and it is not arbitrary: steps 1 and 2 are prerequisites for the deploy-path work, and step 5 must not
be done before step 1.

## Step 0 — read this before touching anything

`fleet_deploy_state.auto_heal = 1` (since 2026-09-08 16:25:49) and an hourly loop is attempting to
downgrade `personal-companion` from `v1.1.0` to `1.0.0`. It currently fails with
`HTTP 400 code 10021` — **and that failure is what protects production.**

> **Do not fix the 10021 error first.** Doing so lets the downgrade land.
> See `personal-companion/FINDING-2026-09-13-deploy-loop-DO-NOT-FIX-10021.md`.

## Step 1 — `auto_heal = '0'` (one row, reversible, highest leverage)

```
UPDATE fleet_deploy_state SET value='0' WHERE key='auto_heal';
```

**Why first:** it is the only change that makes every later deploy-path step safe, and it is fully
reversible. Nothing else on the deploy path should be attempted while it is `1`.

**Verify:** `SELECT key, value FROM fleet_deploy_state WHERE key IN ('enabled','auto_heal');`
**Evidence:** `fleet_deploys` rows 24 and 26 recorded `ok=1` for `v1.1.0 -> 1.0.0`; rows 28→74 fail hourly.

## Step 2 — deploy the comparator fix

Target: `qnfo-fleet-control/version-compare.mjs` + `.test.mjs` (commits `a62d6126`, `bc04f5ce`),
wired into the deploy scan/heal path in `qnfo-fleet-control/worker.js`.

**Why:** it strips the leading `v` (so `v1.1.0` is no longer misparsed as `[0,1,0]`), and it treats
equal-core/differing-suffix and unparseable build tags as `blocked` rather than acting on them —
which also protects `qnfo-gateway` (`3.6.1-subscribers`) and `qnfo-cloud-ops` (`1.14.1-gtd-guard`)
from a naive semver rule.

**Blocker:** the deploy module sits past the 32,768-char read cap in a 75,875-byte bundle, so the
wiring was not written. The module is standalone and tested (20/20).

## Step 3 — redeploy `qnfo-idea-triage` (drains 496 rows)

Target: `qnfo-idea-triage/` — repo source is `v1.4.0-intake-only`, sha `21661c12`.
Secrets required: `TRIAGE_TOKEN`, `DISPATCH_TOKEN`, `INDEXNOW_KEY`.
Bindings: `QNFO_AUDIT`, `LIVING_PAPER`, `AI`. Crons: `0 * * * *`, `*/10 * * * *`.

**Why:** it is the **only** consumer of `idea_proposals`. Retired ~2026-09-11; 496 rows now sit
`new`, `unscored: 496`. The repo source already carries the `extractText()` envelope fix for the
original 2026-09-03..09-06 freeze.

**Do not** substitute `qnfo-intent-orchestrator`'s `POST /triage/run` — its `runBatchTriage()` reads
`intents`, not `idea_proposals`. See `qnfo-idea-triage/REDEPLOY-REQUIRED-2026-09-13.md`.

**Verify:** `SELECT status, COUNT(*), MAX(triaged_at) FROM idea_proposals GROUP BY status;` —
`new` should fall and `triaged_*` should rise.

## Step 4 — deploy `qnfo-pipeline-ops` v0.5.4 and correct `TRIAGE_URL`

Target: `qnfo-pipeline-ops/worker.js` (16,933 B, sha `350aefa2`).
Change: `TRIAGE_URL` → the live host. `"https://qnfo-idea-triage.q08.workers.dev"` is retired and
returns 404 on every run (visible as `meta.triage_health: 404`).

**Why:** the repo's v0.5.3/v0.5.4 gate `escalateTerminal`, `intakeWatchdog` and the summary on
`r.inserted` / a condition fingerprint. Live volume is **107 critical alerts/24h** against
**16 issues ever filed**.

**Caveat:** the deployed worker is **not** this source. `worker.js` and `deployed-current.worker.js`
are byte-identical (sha `350aefa2`), yet the live alert text (`"-> agent_issues dup"`) and the
09-06 ticket title format (`"INTAKE-STALL: N idea_proposals stuck 'new'"`) appear in neither.
Establish what is actually running before deploying over it.

## Step 5 — reconcile `qnfo-fleet-dashboard/registry.js` (do after Step 1)

Target: `qnfo-fleet-dashboard/registry.js` (16,821 B, sha `41cd265b`).

**Why:** its header claims *"Live = 54 workers"* (actual: 55) and lists **42** `health_probes`, but
the dashboard reports `probes: 10`. Two of the ten observed probe names (`papers.qnfo.org`,
`qnfo.org`) are bare hostnames absent from the repo's probe list — so **the deployed registry is not
this file either.**

**Already fixed in the same class:** `qnfo-observability/fleet.js` (commit `2b9fbeee`) — was an
80-name 2026-09-10 snapshot, wrong on 51 of 80 entries (38 stale, 13 live-but-missing). Needs a
deploy to take effect.

## Step 6 — give `fleet_improvements` a consumer

75 rows awaiting action (29 × P1, newest filed 2026-09-13 00:04:56), **no consumer found**.
`qnfo-kaizen` — the declared consumer for the `issues` chain — reads `agent_issues` only as a
skill-staleness input and contains no reference to `fleet_improvements` or `task_dod_register`.

The loop: `task_dod_register` open = 99 → the register guard files a P1 burst (ids 653–660 in 7s) →
nothing drains → re-filed daily.

**Copy the working pattern:** `qnfo-kaizen` already disposes of `kaizen_candidates` weekly, with a
comment naming this exact failure mode (*"quiet candidates would sit 'proposed' forever"*).
See `audits/2026-09-13-FINDING-orphaned-producers.md`.

## Step 7 — `personal-companion` canonical (only after Steps 1–2)

Two independent blockers, routinely conflated:
1. the artifact is **older than production** (`1.0.0` vs `v1.1.0`) — deploying it is a downgrade;
2. it is **structurally undeployable** — R2 `qnfo-canonical/personal-companion.js` does not export
   `GenerationFlow`, so CF rejects with 10021.

Fix both, and only with `auto_heal='0'` in place.

## Step 8 — the `alerts@` sending path

258 of 682 stored emails are `status=spam`; **14 of the 20 most recent** are bounce notifications
from `bounces@cf-bounce.qnfo.org` to `alerts@qnfo.org`, themselves classified spam. Includes the
register-guard "26 overdue" notice and the daily-brief `FAILED` at ~06:07 on both 09-12 and 09-13.
The failure is on the **sending** path, not a whitelist on received mail.

## Cross-cutting: the systemic pattern

**The remedy exists in the repo; production runs the defect.** Four confirmed instances:
comparator, `pipeline-ops` v0.5.4, `fleet.js`, and `qnfo-idea-triage`. Two further suspected:
`qnfo-fleet-dashboard/registry.js`, `qnfo-fleet-control`'s canonical extraction (which reports the
advisor sub-module's `0.3.3` as the control plane's version).

## What this endpoint could not do

No D1 write path (`ops_d1_query` is SELECT/WITH only), no deploy route, no secret-setting. Steps 1–8
are all outside its capability. The only production-data fix it could land was `fleet.js`
(commit `2b9fbeee`), and that too needs a deploy.
