# Gradual deploys with automatic rollback (BP26-GRADUAL-DEPLOYS-1)

Charter pillar: autonomy. Program QNFO.INFRA, project BP26.ENGINEERING. agent_issues 1000352, GitHub 4428. Written 2026-10-28.

## What Cloudflare provides (docs read 2026-10-28)

- Versions: `wrangler versions upload` / `POST /accounts/{id}/workers/scripts/{name}/versions` creates an immutable Version without sending it traffic.
  `keep_bindings` in its metadata carries the live script's bindings, secrets and settings forward.
- Gradual deployments: `POST .../deployments` with `strategy: percentage` and up to two versions (percentages sum to 100). A request is routed to one
  version for its whole life; use `Cloudflare-Workers-Version-Overrides: <worker>="<version-id>"` to send a smoke test to a version at 0 percent.
- Rollback: deploy the previous Version at 100 percent (`wrangler rollback`). Code only: data written by the new version stays, so migrations are
  expand-then-contract and writes idempotent.
- Limits: a Version upload cannot carry Durable Object migrations, and at most two versions are live during a rollout.
- Analytics: the account GraphQL dataset `workersInvocationsAdaptive` has the `scriptVersion` dimension, so errors and wall time compare per version.

## What the fleet had

The canonical path (`canonical-deploy.yml` > qnfo-ops `/ops/deploy`, PUT `/content`) replaces the code at 100 percent at once. `scripts/canary_revert.py`
proves the new `VERSION` arrived at `/health` and reverts the push on main when it does not (control-plane workers only). It cannot see an error-rate
regression and it acts after every request already runs the new code. Metric `deploys_via_gradual` was 0.

## What this adds

`scripts/gradual_deploy.py` (offline `--selftest`) and `.github/workflows/gradual-deploy.yml` (workflow_dispatch):

1. upload the Version from `<worker>/worker.js` (refuses a non-module script, a missing script and a rollout already in progress);
2. smoke test: `/health` with the version override must answer 200 and report the new `VERSION`, before any traffic; a failed smoke test deploys nothing;
3. 10 percent, soak, compare error rate (new above max(2 percent, 2x old + 1 point)) and wall-time p99 (above 1.5x old) from GraphQL, and `/health`;
   fewer than 20 requests on the new version is "no verdict" (cron-only workers) and is gated on `/health` alone; then 50 percent, soak, compare; then 100;
4. any regression: deploy the previous Version at 100 percent, exit 1, `RESULT_JSON` names the stage and reason.

`scripts/bp26_cfapi.py` already reads each worker's deployment history: a `percentage` strategy with two versions counts as gradual (`deploys_via_gradual`),
a rollback or canary revert inside 24 h counts toward `change_failure_rate`, and rollback minutes feed `mttr_rollback_min_p95`.

## Adoption path

| Step | State 2026-10-28 |
|---|---|
| Script, selftest, workflow | done |
| Live proof on a non-control-plane worker (identical main code, so harmless) | run by this session; result on the issue |
| Make the canonical path call it for non-control-plane workers (`canonical_deploy.py`) | roadmap row `ROADMAP-1: QNFO.INFRA BP26-GRADUAL-ADOPT-1`; `deploys_via_gradual` reaches 1.0 only when every production deploy uses it |
| Control-plane workers (qnfo-ops, qnfo-fleet-control, qnfo-deploy-guard) | after two clean proofs; the canary and revert rules in CLAUDE.md stay in force |
| Workers that need DO migrations, bindings or crons | stay on the canonical path; documented exception |

Honest limits: analytics lag a few minutes, so a short soak can see no requests at all; the script then trusts `/health`. A regression that only shows in
a cron step or a downstream write is for LOOP-WATCH-1 and the metric triggers, as with the canary.
