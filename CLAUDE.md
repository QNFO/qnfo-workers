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

## Claim before you change (WORK-CLAIMS-1)
- Before changing a file, look for in-flight work on it:
  `SELECT kind, intent, holder, pr FROM v_work_claims_active WHERE path = '<repo path>'` (D1 `qnfo-audit`; the view also
  lists the code loop's unfinished tasks). If a row describes the same defect, do not write a second fix: review that
  change, or add what is missing to it. If the rows are about something else, go ahead and expect a VERSION-line rebase.
- Then say what you are doing: `INSERT INTO work_claims (path, intent, holder, issue_id) VALUES (...)`. A claim is
  advisory and expires after two hours; renew it by inserting again. When the PR merges or closes, set `released_at`,
  `pr` and `outcome` (`merged`, `closed`, `duplicate`). See migrations/2026-10-02-work-claims.sql.

## Issues and evidence
- Open work lives in D1 `qnfo-audit.agent_issues`. Close an issue only with evidence in `issue_triage.close_evidence`
  (a live measurement, not "deployed").
- GitHub `schedule` triggers never fire on this repository; periodic work belongs in worker crons.
