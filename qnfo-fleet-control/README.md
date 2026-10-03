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

## CODE-TASK-MERGE-RUNNER-1 (0.4.86, 2026-10-02, pillar autonomy, agent_issues 1726)

The hourly cron (`0 * * * *`) runs `codeMergeTick`: it opens and merges the code loop's pull requests
(qnfo-code-orchestrator + `scripts/code-task-publish.py`, table `code_tasks`), so no person sits between a verified patch
and main. It reuses EVOLVE-PR-1's GitHub token, squash merge pinned to the tested head (`evMergePr`), deploy ledger
(`evDeployRow`), live check (`evLiveCheck`) and revert pipeline (a revert is an evolve `revert` candidate that `evAdvance`
merges and verifies).

- **Opening**: a PR opened with the Actions `GITHUB_TOKEN` starts no `pull_request` workflow, and `code-task-publish.yml`
  holds no other GitHub credential. So the workflow pushes the branch and stops at `branch_pushed`
  (`CODE_TASK_PR_OPENER=qnfo-fleet-control`), and the runner opens the PR with the fleet token, so CI starts by itself. It
  opens only a branch that passes the verify, scope, provenance and integrity gates (CI runs the PR's code); an existing
  PR for the branch is adopted; a branch that fails a gate is `needs_human` with the compare URL kept.
- **Merge candidates**: `code_tasks` rows with status `published` or `pr_open`, branch `codeagent-<id[3:15]>`, and a
  `QNFO/qnfo-workers` pull URL whose head is that branch, based on `main`.
- **Merges only when all hold**: the orchestrator's verify passed (`step='done'`, `attempts<3`, no `last_error`, patch or
  proposal stored); the PR changes exactly the task path (plus the deployed-current mirror for a `worker.js`); the path is
  a `worker.js` outside `CM_DENY` without `[[containers]]`, or a Markdown doc; the source issue is a trusted origin
  (`CM_TRUSTED_SOURCES`, overridable by `ops_config.code_merge_trusted_sources`); each file at the head equals the
  verified patch applied to the merge base; a `worker.js` is auto-revertible; every required check (gate, mirror-guard,
  comparator, plus guard / charter / test where they run) ended `success` on the head, no other check failed or runs;
  the PR is open, not draft, mergeable. One merge per tick; never while the same worker has a change in flight.
- **No checks**: no required check on a head 3h after the runner first saw it is a refusal (for example an older PR
  opened with the Actions token). Nothing is pushed to start CI.
- **Refusal**: status `needs_human`, `last_error` `merge-runner: <reason>`, and a comment on the PR when there is one.
- **After a merge**: `merged_by='qnfo-fleet-control'`; a `worker.js` must show a `fleet_deploys` row for its new VERSION
  within 3h and a later `worker_live_audit` http 200 with it, otherwise the inverse patch is opened as a revert PR.
- **Kill switch**: `ops_config.code_merge_runner_enabled` (`0`/`off` stops opening and merging; absent means on).
  Heartbeat: `cloud_ops_events` `code-merge-tick-<UTC day>`, plus `code-merge-first-ok` written once on the first ok
  tick; each action is one `cloud_ops_events` row `code-merge.<action>`.
- **Routes**: `GET /code-merge/status` (public), `POST /code-merge/tick` (admin token).
- **Watchmaker**: qnfo-fleet-dashboard 1.16.4 counts `code-task-merge` only when the runner is stalled or disabled or
  leaves work for a person (a person's merge or close counts only after `code-merge-first-ok`). Tests:
  `code-merge.test.mjs` (deploy-gate, Node 22).

## IMPROVEMENT-LOOP-1 (0.4.87, 2026-10-02, pillar autonomy)
Owner directive: measure internal and external performance systemwide and keep improving against it. The fleet already
measured (metric_registry) and filed off-target graded metrics (METRIC-TRIGGER-LOOP-1, OBJECTIVE-CONSTRAINTS-1). It could
not tell whether anything was getting better. The hourly tick now:
- writes `metric_history` (one row per metric per UTC day: value, met target or not);
- compares each metric's 7d mean with the prior 7d in its good direction (from the target: `<=` down, `>=`/`+N`/`maximize`
  up) and files `METRIC-REGRESSION-1: <metric>` on a >= 15% worsening, including `maximize` metrics that have no trigger
  (pageviews, referrals, Zenodo views, impact per dollar); it closes itself, with hysteresis, when the decline stops;
- re-checks metric issues closed in the last 30 days and files `METRIC-FIX-RELAPSED-1: <metric>` naming the issue whose
  remediation did not hold;
- grades itself in `metric_registry`: `improvement_rate_7d` (>= 0.5), `metric_regressions_7d` (<= 1), `fix_hold_rate_30d`
  (>= 0.8), with seeded triggers so a loop that stops improving things files its own issue.
Unknown is never a finding (4 daily points per window, so about 10 days of history before the first verdict). One issue per
metric: a finding already carried by an open trigger or constraint issue is not filed twice. At most 3 new issues per tick.
Read: `GET /improvement`. Run now: `POST /improvement/tick` (admin token). Ledger: `improvement_loop_runs`. Suite:
`improvement.test.mjs` (pure half plus the tick on an in-memory D1 with the live integrity and close-evidence triggers).

## SURFACE-METRICS-1 (0.4.88, 2026-10-02, pillar reach)
`IL_SURFACES` lists public surfaces that publish aggregate metrics. Each improvement tick reads them into `metric_registry`
(seeded idempotently past the integrity triggers, target `maximize`), so they get history, trends and regression issues.
First surface: iPatent (`https://ipatent.qnfo.org/api/metrics`): human views, search visits, crawler hits, drafters (7d).
An unreadable surface writes nothing.

## FLEET-RUN-RATE-1 (0.4.90, 2026-10-02, pillar cost)
`cost_usd_30d` ($450, target $200) is list cost over 30 days across all providers, dominated by spend no worker can move:
a one-off gpt-5.5 session burst on 2026-09-26 (about $198, ages out about 2026-10-26) and the owner's own desktop client
on BYOK DeepSeek (about $167). `fleet_ai_run_rate_30d_usd` is the fleet's own live AI cost projected to 30 days from the
last full days of data (attributed Workers AI neurons above the free 10k/day at $0.011/1k, plus qnfo-ai router spend on
other providers). Proposed target <= $15; its trigger names the top neuron consumer as the lever. Refreshed by the
improvement tick; tested in `improvement.test.mjs`.

## REACH-IDEATION-1 (0.4.93, 2026-10-02, pillar reach)
Owner directive: "the fleet shall ideate and shall build all next automatically". Once a UTC day the hourly tick probes
QNFO's public surfaces (qnfo.org home and work-with-me, papers index and the latest paper, iPatent home, guide and example,
ideas.qnfo.org) with nine reach checks (share image, canonical, structured data, description, author credit, contact path,
flagship link, subscribe box, speed) and a content-gap catalog (planned iPatent guide pages). Each failing check is one
deduped `REACH-IDEA-1: <check> on <surface>` issue (at most 3 new a day, buildable first), naming the worker file and the
metric to move. qnfo-code-orchestrator's planner trusts the prefix (0.3.10), so buildable ideas become code tasks and ship
through the merge runner. Ideas on deny-listed control-plane workers (qnfo-gateway) are filed as "not auto-buildable".
The next run closes an issue with evidence when the live page passes. Read: `GET /reach-ideas`; run now:
`POST /reach-ideas/tick` (admin). Ledger: `reach_idea_runs` (WATCHMAKER_OPS `reach-ideation`). Suite: `reach.test.mjs`.
Dry run on 2026-10-02 against the live pages: 26 ideas (14 buildable, 12 on qnfo-gateway).

## REACH-IDEATION-2 (0.4.101, 2026-10-02, pillars reach, autonomy)
The first live run (2026-10-02T09:00:45Z: 12 probes, 26 findings, 3 filed) showed four defects. (1) Finite catalog: the
loop now also probes the busiest pages on owned QNFO hosts by Cloudflare RUM traffic (`reach_signals`, 14 days, at most 3,
one per host + first path segment, skipping templates the fixed list covers). fleet.qnfo.org is excluded (operations
dashboard) and so is q08.org (STRATEGY 2.1: a separate publication that never carries the owner's identity). (2) Value
first: findings sort by score; buildable ideas fill the code loop's slots by score and one slot is kept for the best idea
on a deny-listed worker (qnfo-gateway) so the largest gap stays visible. (3) Work-in-progress cap: at most 4 open buildable
and 1 open not-buildable REACH-IDEA issue, and at most 3 new a day. (4) Learning: `reach_idea_outcomes` keeps each idea's
metric at filing, at close and 7 days after close; a check kind with 3+ measured outcomes is weighted x1.25 if its metric
rose and x0.5 if not (confounded by everything else that moved that week: a ranking prior, not a causal claim).
`reach_ideas_shipped_30d` grades the loop end to end (n/a for the first 14 days; trigger in
`migrations/2026-10-02-reach-ideation-2.sql`). `GET /reach-ideas` also returns `outcomes`, `efficacy` and `limits`.
No model call, worker, cron or binding is added: all `fleet_budget` AI caps were in breach on 2026-10-02.

## CF-CHANGELOG-LOOP-1 (0.4.112, 2026-10-03, pillar autonomy)

Once a day, inside the hourly tick, the kernel reads Cloudflare's changelog RSS and acts on it: at most 2 deduped
`agent_issues` a day for billing / deprecation / breaking changes to a product the fleet uses, rejected catalog rows reopened when
their product launches (max 2), `not_considered` rows for unknown products (max 5). No model call, no new worker or cron.
`GET /cf-changelog` is the digest, `POST /cf-changelog/run` forces a run (admin token). Metrics `cf_changelog_audit_age_h` and
`cf_changelog_open_proposals_14d` are registered with triggers in `migrations/2026-10-03-cf-changelog-loop.sql`. Tests:
`cf-changelog.test.mjs` replays real feed items (`cf-changelog.fixture.xml`); the feed shape, not the code, is what changes, so
a feed that stops parsing shows up as `parse-empty` in `cf_changelog_runs` and breaches the age metric within 48 hours.

