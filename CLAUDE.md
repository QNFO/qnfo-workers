# qnfo-workers: rules for agent sessions

Several agent sessions work this fleet concurrently with shared credentials. These rules exist
because each one was broken at least once; the linked issue holds the evidence.

## Shared secrets (#1701)
- Before you PUT, rotate or delete any worker secret, take the lease:
  `POST https://qnfo-deploy-guard.q08.workers.dev/secret-lock/acquire {"worker":"<script>","owner":"<session>","ttl_sec":300}`.
  If `acquired` is false, another session owns that secret right now: observe and verify, do not write.
- Release it with `POST /secret-lock/release {"worker":"<script>","token":"<token>"}`. Treat a write as durable only after
  a later re-probe confirms it.
- Never re-accept a rotated-out key, and never commit a secret value.

## Work claims (WORK-CLAIM-1, one procedure since WORK-CLAIM-UNIFY-1)
- Before you start an `agent_issues` row or change a file, take the claim:
  `POST https://qnfo-deploy-guard.q08.workers.dev/work-lock/acquire {"key":"file:<repo path>","owner":"<session>","intent":"<what you will change>","ttl_sec":3600}`
  (`issue:<id>` for an issue; `ttl_sec` at most 7200). If `acquired` is false, `holder` is on it until `expires_at`
  (`intent` says what it is doing): skip it and take other work, or review that change instead of writing a second one.
- `in_flight` in the answer lists the code loop's unfinished tasks on the same path or issue; they do not block you, but a
  task that fixes the same defect means you review it, not duplicate it. `GET /work-locks` lists every live claim and
  in-flight task (open, never a token).
- Acquire again with your `token` (and `pr` once you have one) to extend it; hold it until your PR merges or you stop, then
  `POST /work-lock/release {"key":"<key>","token":"<token>","pr":<n>,"outcome":"merged|closed|duplicate|abandoned"}`.
  An issue claim records you in `agent_issues.linked_session`.
- The claim is written to the D1 ledger `qnfo-audit.work_claims` (WORK-CLAIMS-1, migrations/2026-10-02-work-claims.sql) and
  released there too; a row another session inserted there directly also refuses your acquire. Do not keep a second claim
  procedure: the endpoint is the only writer a session needs.
- Before you bump a worker's VERSION, list what main and the open PRs claim (REST: `gh pr list` is GraphQL, refused in
  sessions) and take a numeric core above the last line. version-bump-guard fails one that is not ahead (VERSION-AHEAD-1).
  ```
  W=<worker>; R=repos/QNFO/qnfo-workers; for x in main $(gh api "$R/pulls?state=open&per_page=100" --jq '.[]|"\(.head.sha)#\(.number)"'); do gh api "$R/contents/$W/worker.js?ref=${x%#*}" -H 'Accept: application/vnd.github.raw' 2>/dev/null | grep -m1 -oE 'var VERSION = "[^"]*"' | sed -E "s/.*\"(.*)\"/\1 ${x#*#}/"; done | sort -V | tail -3
  ```

## Internal calls to qnfo-ai (#1703)
- Internal workers authenticate to qnfo-ai by service-binding props, not by a copy of the router key. Add
  `props = { caller = "<worker name>" }` under the worker's qnfo-ai `[[services]]` binding in wrangler.toml; the canonical
  deploy installs it (qnfo-ops BINDING-PROPS-APPLY-1). Do not create or rotate per-worker copies of ROUTER_AUTH_KEY.

## Deploys
- Deploy through the canonical path (merge to main; canonical-deploy.yml calls qnfo-ops /ops/deploy). It takes the
  deploy lock, writes the ledger, installs declared bindings and applies crons.
- The canonical path never creates a worker that is absent from the account (#1704, WORKER-RESURRECTION-GUARD-1). A
  brand-new worker deploys from the push that adds its worker.js, or by workflow_dispatch with `workers=<name>`.
- A retired or folded worker directory carries a `RETIRED` or `FOLDED` file; do not remove it to get a deploy through.
- Bump `var VERSION` in every changed worker.js and keep `deployed-current.worker.js` identical to `worker.js`
  (version-bump-guard and mirror-guard are required checks).
- The bump says what changed (VERSION-MINOR-CAPABILITY-1, proposed 2026-10-06 with FLEET-CHANGELOG-1). Raise the minor
  number (x.Y.0) when a change gives a worker a capability it did not have: a new route, page, loop, cron step, data
  product, or a decision it now takes on its own. Raise the patch number for fixes, tuning, refactors and wording. Raise
  the major number for a breaking change to a route, binding or table other workers depend on. A 0.x worker follows the
  same rule (qnfo-fleet-control 0.4.130 -> 0.5.0 for its next feature). The owner's changelog (fleet.qnfo.org/changelog)
  lists only minor and major releases, so a feature shipped as a patch never reaches the owner.

## Migrations and tests run themselves (MIGRATION-RUNNER-1, SUITE-RUNNER-1, PROBE-TEMPLATES-1)
- A D1 change to `qnfo-audit` is a file under `migrations/` that opts in with the header lines `-- APPLY-BY: ci`,
  `-- DB: qnfo-audit` and `-- Rollback: <sql>`. A file that runs DELETE or DROP also names `-- BACKUP: <table>`, either a
  table that already holds the rows or one the file creates first (`CREATE TABLE <table> AS SELECT ...` ahead of the
  delete). apply-migrations.yml applies the file when it merges and records it in `migration_runs`. A failure files
  `MIGRATION-APPLY-FAILED-1`. Do not also apply it by hand; check `migration_runs` for an `ok` row instead. deploy-gate runs
  `scripts/apply_migrations.py --check` on every changed migration, so a bad header fails the PR.
- A worker's `*.test.mjs` suites run on every PR that touches the worker (scripts/run-suites.mjs). The full set runs for
  control-plane, `scripts/`, `.github/` and `migrations/` changes. A new suite needs no deploy-gate line. A suite that
  pins an exact VERSION breaks on the next bump; assert a minimum instead.
- A `METRIC-TRIGGER-<id>-...` issue's contract gets its trigger's probe at birth (D1 trigger
  `contract_probe_templates_v1`). Write a probe by hand only for other families.

## Where probes run (PROBE-SYSTEMWIDE-1)
- A contract's `verify_transport` says where its probe runs:
  - `d1-query` reads qnfo-audit (qnfo-fleet-control's hourly tick and scripts/remediation_consumer.py);
  - `d1-query@portfolio-state` and `external-https` (hosts outside the fleet) run in qnfo-fleet-control;
  - `runner-https` GETs a fleet host from the GitHub runner, outside the Cloudflare account, because a Worker's request to its own account's hosts is the issue-1190 artifact;
  - `d1-query@<db>` reads any other account D1 by name (the consumer). qnfo-identity and qnfo-outreach are refused, because the run log is public.
- An issue about live behaviour names what closes it on a line of its own: `runtime-probe: {"url": "https://...", "status": 200, "contains": "<marker>"}`. D1 triggers make that line the issue's runner-https contract (PROBE-BIRTH-RUNTIME-1). Never choose a URL and marker that already pass while the defect exists. The runners' write-keyword guard scans string literals too, so a probe's failure text must not contain words like "update ".
- ORPHAN-GUARD-BIRTH-1 (migrations/2026-10-06-orphan-birth-contracts.sql) writes the `issue-<id>` contract row at birth, so a session or loop that gives an issue its probe uses UPDATE on class `issue-<id>` (PROBE-BIRTH-RUNTIME-1 does; an INSERT OR IGNORE of that class is silently ignored). An issue filed by a live worker carries a 48-hour probe that reads `pending` while the filing loop owns it and `stale` after.
- qnfo-cloud-ops dispatches the consumer when it has been idle for 60 minutes (PROBE-CADENCE-1), so runtime probes do not depend on pushes to main.

## Cloudflare actions without a token
- `cf-ops-actions.yml` (workflow_dispatch) runs allowlisted Cloudflare API actions with the repository's token:
  report, delete-worker (marker-guarded), gateway-logs, gateway-cost, ai-neurons, access-probe, r2-get. Extend
  `scripts/cf_ops_actions.py` rather than parking an issue as "needs the credential holder".

## The charter (QUNIVERSE-CHARTER-1)
- `docs/QUNIVERSE-CHARTER.md` is the system's charter: what the Quniverse is, what it should be, objectives, SWOT, MVP,
  blue-sky footprint, roadmap order and decision rules. Read it, and `GET https://qnfo-fleet-control.q08.workers.dev/charter`,
  before any change that adds, retires or redirects a worker, cron, binding, table family or spend.
- Every PR, issue and roadmap item names the charter pillar it serves (`core`, `autonomy`, `research`, `reach`, `cost`,
  `security`, `personal`). A new worker directory declares `# charter-pillar: <key>` in its wrangler.toml and names the
  same-class retirement it funds (net-zero rule); `charter-guard` fails CI otherwise. Work that serves no pillar is parked.
- The section between the `CHARTER-LIVE` markers is generated daily by qnfo-fleet-control (CHARTER-LOOP-1) and committed
  to main; never edit it by hand. Hand-written sections change by PR with a version bump. `CHARTER_PILLARS` and
  `CHARTER_MVP` in the kernel and the tables in the charter change together (the guard enforces parity).
- `docs/PORTFOLIO.md` is the portfolio of every QNFO GitHub repository (tiers, pillars, WBS links, hygiene). Its live
  block, `QNFO/.github/PORTFOLIO.md` and the index in the organisation profile README are regenerated daily by
  qnfo-fleet-control (PORTFOLIO-LOOP-1); never edit them by hand. A new repository names its tier and, for research, a
  WBS code in `portfolio-state.program_registry`; private repositories are counted and never named. The loop also
  repairs hygiene itself (PORTFOLIO-HYGIENE-1: the QNFO-ULA LICENSE file, a README-derived description, tier topics,
  registry links; `portfolio_actions` is the ledger), so do not hand-fix those on QNFO repositories; fix the README
  or the registry row and let the next sync take it.

## No Claude dependency at runtime (NO-CLAUDE-RUNTIME-DEPENDENCY-1, CLOUD-ONLY-VERIFICATION-1)
- Owner directive 2026-10-01: the fleet and its dashboard must not depend on continued Claude usage, and all data is hosted
  on Cloudflare (D1, R2, KV, Workers), never on claude.ai (Claude Docs, artifacts, Routines). A session builds the fleet; it
  is never part of it. A session that needs a durable record writes a D1 row or a repository file.
- Do not make claude.ai a system of record, a link target in a worker or doc, or a recurring runner. Recurring work is a
  worker cron (using qnfo-ai and D1). A decision the owner must make is made in https://fleet.qnfo.org (queue cards,
  objective decisions, the prompt panel), never by "telling a session". The dashboard refuses claude.ai and anthropic.com
  links in queue items, a D1 trigger refuses any `human_actions` card whose text routes the owner's work to Claude
  (migrations/2026-10-01-human-actions-no-claude.sql), and `cloudflare-only-host-guard.py` (deploy-gate) fails CI on a
  claude.ai link in any tracked file. Tasks sent from ChatBox, DeepChat or the dashboard become `agent_issues` rows
  (TASK-INTENT-INTAKE-1, OWNER-NOTES-ROUTE-1); an explicit `code-task: repo=<repo> path=<file>` line hands one to the code loop.
- The watchmaker index (WATCHMAKER-INDEX-1, `GET https://fleet.qnfo.org/api/watchmaker`, metric `watchmaker_index`, target 0)
  counts recurring operations that still need a person or a session, or whose Cloudflare runner is stalled. A PR that adds
  a recurring operation adds it to `WATCHMAKER_OPS` in qnfo-fleet-dashboard/worker.js with the D1 query that proves it ran.
- Recurring verification belongs to worker crons (LOOP-WATCH-1 in qnfo-fleet-control, `GET /loops`, files and self-closes
  `CHARTER-TICK-STALE-1`, `PORTFOLIO-SYNC-STALE-1` and friends), not to session check-ins or routines. A session follows
  its own in-flight PR through GitHub events while it is open; it arms no claude.ai reminder, check-in or Routine.
- Owner documents (identity, brand, CV, opportunities, their archives and edit history) live in the private D1
  `qnfo-identity`, table `owner_docs` (canonical key `identity`), bound ONLY to qnfo-fleet-dashboard (IDENTITY-STORE-1). The
  dashboard serves and edits them at fleet.qnfo.org/owner and runs IDENTITY-WEEKLY-1 from them; never bind `qnfo-identity`
  to another worker and never copy its rows into the shared `qnfo-audit` D1. Do not write `qnfo-audit.owner_docs` (no longer
  read; a write there is copied into `qnfo-identity` on the next */15 tick). A session that must change a document writes
  `qnfo-identity.owner_docs` and first keeps the current text as a `<key>--v<yyyymmddhhmmss>` row, visibility `history`. The final verbatim export of the retired Claude
  Doc (rev 46, with its five comment threads) is `personal-life.owner_documents` key `identity-brand-opportunities` (private
  plane). Never recreate an owner document on claude.ai.
- Known violations retired on 2026-10-01: the Identity doc on Claude Docs (exported, deleted); every claude.ai Routine and
  check-in (all 82 exported to `qnfo-audit.retired_claude_routines` and deleted on the owner's directive; none may be recreated); owner-ratified objective revisions with no
  Cloudflare consumer (OBJECTIVE-REVISION-APPLY-1, applied by qnfo-fleet-dashboard 1.13.0); card notes only sessions read
  and queued tasks no Cloudflare loop read (now `agent_issues` rows, OWNER-NOTES-ROUTE-1); the qnfo-ops `claude-sonnet-4.5` route (2.38.34: no Anthropic upstream anywhere in
  the fleet; a `claude-*` model id routes to the ops model).

## Standing owner grant (OWNER-STANDING-GRANT-1)
- Owner directive 2026-10-05: "I don't want the 'safest' choice. I want bold autonomous systems that think and act entirely
  on their own." It extends OWNER-QUEUE-DELEGATION-1 (docs/STRATEGY.md section 5; `pipeline_flags.owner_standing_grant`)
  and is charter decision rule 9. Without an owner card, a loop or a session may:
  - retire an idle or low-value worker: PR with a `RETIRED` marker, removal from probes and registries (`service_registry`
    state `retired`, deploy-targets.txt, registry lists), then cf-ops-actions delete-worker. Idle proof is not required; a
    dependency check is (binders, URL callers, live readers of the tables only it writes). Stop at the first real dependent
    and fold it or record it on the issue.
  - delete an unused D1 database after a verified backup (cf-ops-actions d1-backup, unbind-d1, delete-d1; D1-FOLD-1).
  - switch a worker to a cheaper model with no A/B test, when it keeps a per-request fallback to the previous model and an
    automatic revert on errors or empty replies (personal-api TWIN-FLASH-1 is the pattern), recorded on its issue.
- merge its own control-plane change (CONTROL-PLANE-SELF-MERGE-1, qnfo-fleet-control 0.7.0, PR 737; owner directive 2026-10-06
  "more flexibility and more autonomy ... proceed with all changes"): the stale-PR lane merges a green, quiet session pull request
  that changes a CM_DENY worker when `ops_config control_plane_self_merge` is `on`, the worker has a versioned `/health`
  (`CP_CANARY_WORKERS`) and the PR carries `worker.js` with its mirror. canonical-deploy.yml (deploy-code-orchestrator.yml for
  the container worker the canonical path skips, CONTROL-PLANE-CANARY-2) then canaries `/health` for the new VERSION and, when
  it does not arrive, reverts the push on main (`scripts/canary_revert.py`, one level, never a revert of a revert), dispatches
  the deploy of the revert through the workflow that owns the worker and files `CONTROL-PLANE-REVERTED-1`. The canary proves the VERSION arrived, not
  that the worker works: LOOP-WATCH-1 and the metric triggers are the next line. `off` restores CONTROL-PLANE-MANUAL-1 without a
  deploy. Workflows under `.github/` never auto-merge, and the code loop neither plans nor merges control-plane workers until
  CODE-LOOP-CONTROL-PLANE-1 (lever T1.23) has its evidence: five lane merges of control-plane session PRs with no canary revert.
- RULE-8-RETIRED-1 (owner directive 2026-10-06, verbatim: "'Rule 8' is now deleted entirely. The system needs more flexibility
  and more autonomy to decide for itself and make it's own choices ad hoc. Proceed with all changes."; PR 736 retired it from the
  qnfo-ops prompt, the trigger texts and the policy documents): caps, guards, probes and deletions are the fleet's own decisions,
  made through the canonical path and recorded with the measurement that justified them: a cap change is a `fleet_budget`
  migration with its note, a guard or probe change a migration with its rollback line, a deletion a migration that names its
  `BACKUP` table (MIGRATION-RUNNER-1 above). Still in force, because they are not autonomy limits: the shared-secrets rules (no
  key minted, rotated or committed outside the secret lock), outreach suppression and opt-out handling, the personal/research
  separation, and governance changes (this file, the charter) land by PR. A breached `fleet_budget` AI spend cap steers model
  choice and never stops work (BUDGET-SOFT-ROUTE-1 below).

## AI spend budgets steer, never stop (BUDGET-SOFT-ROUTE-1)
- Owner directive 2026-10-06: "AI spend budget should never stop any process, pipeline, or workflow, only limit/suggest
  what models may be used (there are many free and low-cost coding models available through Cloudflare and these budgets
  shall never be hard and fast limits)." It replaces the earlier reading of core prompt rule 8 that no paid model call may
  run while a cap is breached, and extends BUDGET-CAP-FREE-FALLBACK-1 (`ops_config budget_cap_free_fallback`).
- While an `ai_spend:*` cap in `fleet_budget` is breached, work continues on the cheapest capable model: a single cheap
  Workers AI model (glm-5.3-flash, qwen3-30b-a3b and peers) instead of a premium model, one leg instead of an ensemble,
  fewer items per tick instead of none. Never a refusal, a deferral queue, an HTTP 429 on spend, or a skipped run. The qnfo-ai
  router downgrades every caller at a cap (5.32.0); idea-hub scores lean (1.6.0); qnfo-ai-search answers, indexes and
  generates questions lean (2.3.0); qnfo-ops falls back to free models.
- Caps are still measured and reported, and a breach still files its metric issue; a cap changes only by a recorded
  `fleet_budget` migration (RULE-8-RETIRED-1 above), never by a silent edit; the lever at a breach is a cheaper
  model or a smaller batch, never a stop. Limits that protect an open endpoint from abuse (per-address rate limits) and
  publishing or outreach cadence caps are not spend budgets and stay.

## No loose ends (OWNER-NO-LOOSE-ENDS-1)
- Owner directive 2026-10-06: "The system shall fully execute and implement its own suggestions and enhancements across
  the fleet. You shall never leave open issues unresolved or unremediated, now or in the future, not in this thread nor
  system/fleet-wide." It binds every session and every loop.
- A suggestion is implemented, not only written down. A session that proposes a change makes it in the same PR, or files
  it as an `agent_issues` row that a doer will execute: a `code-task:` line for the code loop, or a named owning loop.
  Prose in a reply is never the only record.
- Before a session ends, every item it opened (PR, issue, owner card, work claim, migration) is closed with evidence, or
  carries an owner, the exact blocker and a closing probe that resolves it on its own: a `remediation_contracts` d1-query
  probe for an issue, or a probe that resolves a `human_actions` card (qnfo-cloud-ops OWNER-STEPS-WATCH-1, metric-refresh
  steps). A PR a session opened is followed until it merges and its deploy is verified live.
- Work another session has claimed is not dropped and not duplicated: review it, and take it over when the claim lapses
  with the work undone.
- A step only the owner can take (a permission the session was refused, a credential, a legal or publishing act) becomes
  a `human_actions` card with its default in effect and a probe that closes it when the step is done. The session states
  the blocker plainly and never works around a refusal.

## Open access (OPEN-ACCESS-1)
- Owner directive 2026-10-01: favor free, open access. The more people see the fleet's data, the more impact the owner makes.
  Do not put reads behind a token, key, login or "owner key", and do not ask the owner to set or enter one. The dashboard
  (https://fleet.qnfo.org, its JSON and its Ask panel) is open to everyone; a card or doc that tells the owner to create a
  token is a defect.
- The narrow exception is what changes the fleet or spends its money: notes and tasks that become `agent_issues` the loops act on,
  ratifying an objective, editing the private owner documents, and unbounded AI calls. Those stay off the public page (they take
  `x-loop-token`) and public AI use is capped per anonymous visitor and globally. Never open them silently: say what a stranger
  could then do, and let the owner decide. Prefer a tokenless identity (Cloudflare Access) over a secret the owner must manage.

## Measuring and improving effectiveness (METRIC-CLOSED-LOOP-1, SESSION-RECORD-1)
- Owner directive 2026-10-02: the fleet measures and improves its own internal and external effectiveness automatically
  and continuously. The loop is on Cloudflare, not in a session: `metric_registry` (measure, hourly) ->
  `v_metric_trigger_state` (judge) -> `analytics_metric_triggers` + qnfo-fleet-control evaluateMetricTriggers (act: one
  deduped `agent_issues` row per breach) -> `remedy_efficacy_30d` (learn: did the remedy move the metric?).
  `metrics_in_breach` is the headline (target 0). See migrations/2026-10-02-metric-closed-loop.sql.
- A change that registers a metric also adds its trigger (threshold, owner, concrete lever, definition of done), or names
  its exemption in the same migration. `metric_registry.state` is not a verdict; `v_metric_trigger_state.hit` is.
- A remedy that did not move its metric within 7 days is replaced, not repeated: write a different lever into
  `analytics_metric_triggers.action` (with a code-task if it needs code) or correct a wrong target with evidence.
- Filing is not fixing (ACT-BRIDGE-1, owner directive 2026-10-02). When a breach's lever is a code change in one file, end the
  trigger's action with two lines of their own: `code-task: repo=qnfo-workers path=<dir>/worker.js` and
  `code-anchor: <verbatim text that occurs exactly once in that file near the edit>` (state the edit in the prose above).
  evaluateMetricTriggers (qnfo-fleet-control 0.4.89+) carries those lines into the issue unchanged, the code loop opens the
  PR, the merge runner merges on green checks and verifies live. `breach_code_task_pct` grades how many breaches reach a
  doer; `code_task_success_rate_30d` grades the doer (migrations/2026-10-02-act-bridge-doer-metrics.sql). A loop that acts
  on its own metrics (ASK-LOOP-1 in qnfo-ai-search: measure, golden-set eval, judged A/B with revert, ASK-FIX-1 code tasks
  that close themselves on recovery) points its triggers at the digest so a breach is not filed twice.
- Guard metrics (INTEGRITY-GUARDS-1, `metric_registry.kind = 'guard'`: `issue_wontfix_share_7d`,
  `remediation_latest_pass_pct_7d`) keep the loop honest. A target metric that improves while a guard metric worsens is
  a regression: do not close issues as `wontfix` to lower `open_agent_issues`, and do not count a fix whose latest
  `remediation_verifications` row fails. See migrations/2026-10-02-integrity-guard-metrics.sql.
- Every agent session writes one `qnfo-audit.session_records` row at closeout (wbs_code, summary, decisions_made,
  handoff_notes, total_tasks, completed_tasks, execution_ratio, started_at, completed_at): what it was asked, what it
  finished, what it left and why. `session_execution_ratio_30d` and `session_records_30d` are graded from these rows.
- A closing probe makes the claim checkable: a metric issue carries a `remediation_contracts` d1-query probe on the metric
  itself, so the hourly remediation tick closes it on recovery; every "this will work after the deploy" gets such a probe
  written at the same time.
- Session lessons (SESSION-EFFECTIVENESS-1, each from a 2026-10-01 or 2026-10-02 miss): re-read `origin/main` and the open
  pull requests for the thing you are about to build, immediately before building it (a watchmaker index was built twice;
  PR 345 closed unmerged). State what is true from a read made in this session ("never proven live" was said of the code
  loop hours after it delivered a merged PR). Before treating an off-target metric as a real gap, check that it is measured
  (zenodo_versions_per_flagship read 1 while the true minimum was 3: two flagships were unmeasured, #1754). An action the
  session is refused is handed to the owner with the reason, not retried.

## Writing that outsiders read (ENSEMBLE-POLICY-1)
- Read `docs/ENSEMBLE-POLICY.md` before adding or changing a worker that writes prose for readers outside the fleet. LLM errors are
  correlated (a 9-judge, 7-family panel is worth about 2.2 votes), so layers must come from disjoint model families, stay few and
  small, keep the non-model layers (deterministic gate, reader votes, owner verdict), and record their verdicts. While a
  `fleet_budget` cap is breached the layers use the cheapest models (BUDGET-SOFT-ROUTE-1); they are not removed.

## One priority queue, no due dates (PRIORITY-QUEUE-1)
- Owner directive 2026-10-03: dates are not important, the order of priority is. D1 `qnfo-audit.v_issue_queue` is the
  master queue: every open issue with `pos`, ordered critical, high, medium, low, then oldest first. A loop that picks issues
  orders by `CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END`
  (then its own tie-break), never by id or date alone, and never filters critical out.
- Do not set or rely on `issue_triage.sla_due_at`: new issues are due on arrival (trigger `agent_issues_autotriage2_ins`) and
  the SLA views report only untriaged issues. Never write "+7 days" or another future date into it.
  See migrations/2026-10-03-priority-queue.sql (backups and rollback in its header).

## Issues and evidence
- Open work lives in D1 `qnfo-audit.agent_issues`. Close an issue only with evidence in `issue_triage.close_evidence`
  (a live measurement, not "deployed").
- GitHub `schedule` triggers fire rarely and late on this repository (95 schedule runs in total by 2026-10-02; mirror-autosync
  ran 9 times), so no periodic work may depend on one; periodic work belongs in worker crons.
