# qnfo-fleet-control

Canonical source for the merged fleet-control hub worker (advisors + calibrator + deploy/drift).

- Deploy method: Cloudflare API `PUT /accounts/{acct}/workers/scripts/qnfo-fleet-control/content`
  with multipart `metadata={main_module:"worker.js"}` + `worker.js` part **including filename="worker.js"**.
  This preserves all 23 existing bindings (verified 2026-09-12).
- Do NOT deploy via wrangler: it would drop the script-API-managed bindings (BINDING-PRESERVATION-1).
- Deployed version: 0.4.11 (qnfo-fleet-deploy / drift scanner).

## 2026-09-12 change (self-heal wiring)
`scan()` now writes a row to `self_heal_actions` (qnfo-audit D1) for every
`drifted` / `stale-canon` / `health-ver` finding, with a `status`
(healed|failed|deferred|detected) and `verified_at`. Replaces a count-and-skip
path that re-observed the same unhealed problems every cycle.

## PROFILE-CLAIMS-SCRUB-1 (0.4.79, 2026-10-01, pillar reach)

When PORTFOLIO-LOOP-1 writes `QNFO/.github/profile/README.md`, it first applies `PF_PROFILE_SCRUB`: exact
`[from, to]` pairs that replace the hand-written claims the public record does not support (the $10M NHTS
"co-directed" line, a patent line with no application numbers, "predictive analytics at Deloitte and Publicis", Empowering
Change as QNFO's current 501(c)(3), "scientific research incubator", stale record counts, a duplicated ledger row) and
swap the theory-first publication list for the STRATEGY-1 s2.4 selected works. Each pair is a no-op once applied;
drifted text is left alone. Tests: `portfolio.test.mjs` (scrub section).

## CODE-TASK-MERGE-RUNNER-1 (0.4.85, 2026-10-02, pillar autonomy, agent_issues 1726)

The hourly cron (`0 * * * *`) runs `codeMergeTick`: it merges pull requests opened by the code loop
(qnfo-code-orchestrator + `scripts/code-task-publish.py`, table `code_tasks`), so no person sits between a verified patch
and main. It reuses EVOLVE-PR-1's GitHub token, squash merge pinned to the tested head (`evMergePr`), deploy ledger
(`evDeployRow`), live check (`evLiveCheck`) and revert pipeline (a revert is an evolve `revert` candidate that `evAdvance`
merges and verifies).

- **Candidates**: `code_tasks` rows with status `published` or `pr_open`, branch `codeagent-<id[3:15]>`, and a
  `QNFO/qnfo-workers` pull URL whose head is that branch, based on `main`.
- **Merges only when all hold**: the orchestrator's verify passed (`step='done'`, `attempts<3`, no `last_error`, patch or
  proposal stored); the PR changes exactly the task path (plus the deployed-current mirror for a `worker.js`); the path is
  a `worker.js` outside `CM_DENY` without `[[containers]]`, or a Markdown doc; the source issue is a trusted origin
  (`CM_TRUSTED_SOURCES`, overridable by `ops_config.code_merge_trusted_sources`); each file at the head equals the
  verified patch applied to the merge base; a `worker.js` is auto-revertible; every required check (gate, mirror-guard,
  comparator, plus guard / charter / test where they run) ended `success` on the head, no other check failed or runs;
  the PR is open, not draft, mergeable. One merge per tick; never while the same worker has a change in flight.
- **CI kick**: a PR opened with the Actions `GITHUB_TOKEN` starts no workflow. After the scope and integrity gates, the
  runner pushes one empty commit (same tree) with its own token; no required check 3h later is a refusal.
- **Refusal**: status `needs_human`, `last_error` `merge-runner: <reason>`, and a comment on the PR.
- **After a merge**: `merged_by='qnfo-fleet-control'`; a `worker.js` must show a `fleet_deploys` row for its new VERSION
  within 3h and a later `worker_live_audit` http 200 with it, otherwise the inverse patch is opened as a revert PR.
- **Kill switch**: `ops_config.code_merge_runner_enabled` (`0`/`off` stops it; absent means on). Heartbeat:
  `cloud_ops_events` `code-merge-tick-<UTC day>`; each action is one `cloud_ops_events` row `code-merge.<action>`.
- **Routes**: `GET /code-merge/status` (public), `POST /code-merge/tick` (admin token).
- **Watchmaker**: qnfo-fleet-dashboard 1.15.5 counts `code-task-merge` only when the runner is stalled or disabled or
  leaves work for a person. Tests: `code-merge.test.mjs` (deploy-gate, Node 22).
