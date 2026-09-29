# RETRIGGER-4 — CONTAINER-DO-BINDING-LOST-1 (2026-09-29, issue #1485)

This file exists to fire `.github/workflows/deploy-containers-pilot.yml`, which is the only
deploy path that transmits `[[containers]]` and the `SHELL_CONTAINER` durable-object binding.
It deliberately carries NO `[skip ci]` token (CI-TRIGGER-SKIP-1).

## Measured regression (qnfo-ops session, 2026-09-29)

The container failure signature CHANGED, which localises the defect to the deploy path rather
than to worker code:

| Window | Live error from the exec path | Implication |
|---|---|---|
| before 19:37:37Z | `Cannot read properties of undefined (reading 'running')` | `env.SHELL_CONTAINER` resolved; `ctx.container` was undefined (containers config dropped) |
| after 19:37:37Z | `Cannot read properties of undefined (reading 'idFromName')` | `env.SHELL_CONTAINER` itself is now undefined (the DO namespace binding was dropped too) |

The only deploy between those two observations is `deployment_history` id 182:

```
id 182 | qnfo-containers-pilot | v1.0.3-clone-egress-timeout-fallback
deployed_by = scripts/raw_put.py | 2026-09-29T19:37:37.283Z | status = success
notes = raw_put.py /content deploy; compatibility_date=2026-08-01; flags=1; schedules=applied
```

Compare with the two `qnfo-ops:cf_worker_deploy` deploys in the same window (ids 175 @19:34:11Z
and 178 @19:34:53Z), which both record `bindings_preserved=2`. Those two left
`env.SHELL_CONTAINER` resolvable; the `raw_put.py` deploy that followed did not.

## Consequence

`raw_put.py` records `status = success` while having silently removed a binding the worker
depends on. A green deploy ledger entry therefore does not imply a working worker, and
`/health` cannot detect it: `/health` returns `200` and advertises the full shell capability
list while every shell tool is dead. That is the false green recorded in
`ci-status/deploy-containers-pilot.json` (`wrangler_outcome=failure`,
`nomig_outcome=failure`, `verify_outcome=success`).

## What this retrigger is expected to produce

A run of the CURRENT workflow revision (which replaced `verify_outcome` with an explicit
`verify_rc` and restored `wrangler_tail` / `nomig_tail` into the artifact). The prior artifact
on main is from the pre-revision workflow and carries no failure text, so the wrangler failure
reason is currently unrecoverable from outside the runner.

Tracked as agent_issues id 1498 (CONTAINER-HEALTH-FALSE-GREEN-1) and id 1499
(RAWPUT-SCHEDULES-FAILED-1).
