# Quniverse transformation program (TRANSFORMATION-PROGRAM-1)

Version 1.3.1 (2026-10-06): 1.3.1 marks lever 18 done (CONTROL-PLANE-SELF-MERGE-1, PR 737) and names
PERSONAL-RESEARCH-SEPARATION-1 in the fold-kit line; 1.3 replaces "Guards that never move" (section 5) after the owner deleted core prompt rule 8
(RULE-8-RETIRED-1); 1.0 written from a live read of D1 `qnfo-audit`, the Cloudflare account and this repository;
1.1 adds a second read (section 1.10), where each autonomy-score point is lost (1.11), and T9 (a deploy path that cannot
lock itself out), each measured 2026-10-06 06:30-07:15Z; 1.2 adds a third read of the engine itself after its first tick
(section 1.12, 07:40-08:10Z): the program was dispatching work its own merge lane must refuse and counting the refusals
against the metric its first wave waits on, a fold had lifted the guard on the autonomy scorer, T1 lever 8 contradicted an
applied owner decision, and the footprint stood at 31 live workers (29 with PR 674). It replaces T1.8 and adds T1.13 and T1.15-T1.19,
T3.10-T3.15 and T5.11; T1.14, T4.7, T5.10, T7.11 and T7.13 were registered the same morning by another session from its own
assessment and are listed with their rows.
Owner directive 2026-10-06: *audit the systemwide backlog and roadmap for fleet improvements, optimisations and
enhancements; not patches and bugfixes but a continuing program of active transformational change, systemwide, fully
automatic and 100% autonomous; everything is in scope, including complete refactors, overhauls and teardown/rebuild.*

**Where this document sits.** `docs/QUNIVERSE-CHARTER.md` is the charter and wins on architecture, MVP, footprint,
roadmap order and decision rules; `docs/STRATEGY.md` wins on identity, audiences, channels and KPIs. This program is an
input to both: it names the transformations, the order, the levers, the executor loop of each one and the measurement
that closes it. Its rows live where the fleet acts: `roadmap_implementation` (items `RM-TP-*`) and `agent_issues`
(epics `TP-*`). The scoreboard is the existing `metric_registry` (1.1 adds one, T9.4, with its trigger). Hand edits land by PR
with a version bump; the measured section is re-read, never remembered.

---

## 1. The audit (measured 2026-10-06, 05:40-06:30Z)

### 1.1 Footprint against the charter

| Node class | Now | Cap | Target | End state (charter s6) | Source |
|---|---|---|---|---|---|
| Live workers | 42 | 30 | 24 | 20 to 24 (MVP 18 + at most 6 earned) | `fleet_budget`, `service_registry` |
| Cron schedules (registered) | 49 | 50 | 50 | <= 48, one dispatcher | `fleet_budget`; 47 expressions across 35 workers in `wrangler.toml` |
| D1 databases | 10 | 10 | 8 | 8 | account: qnfo-audit 286 MB, personal-life 51 MB, living-paper 44 MB, qnfo-graph 8 MB, q08-signal 2.5 MB, ipatent-db 1.1 MB, qnfo-identity 0.4 MB, portfolio-state 0.4 MB, qnfo-outreach 0.3 MB, qnfo-cms 0.2 MB |
| `qnfo-audit` objects | 410 tables, 57 views, 109 triggers, 338 indexes | n/a | retention policy | families, snapshots pruned | `sqlite_master` |
| R2 buckets | 19 | 20 | 16 | 16 | account |
| KV namespaces | 4 | 5 | 4 | 4 | account |
| Repository worker dirs | 114 (42 live, 35 RETIRED, 16 FOLDED, 12 with no wrangler.toml, 1 root duplicate) | n/a | live dirs only | `archive/` with a manifest | repo |
| GitHub workflows | 80, of which 35 are one-shot `apply-*` patch appliers and 5 `restore-container-config*` | n/a | n/a | about 25: gate, guards, deploy, actions | `.github/workflows` |
| deploy-gate steps / offline suites / migrations / scripts | 108 / 154 / 69 / 166 | n/a | n/a | one suite runner, migrations applied by a loop | repo |
| AI spend, 30d (list) | $224.55 account; fleet run-rate $61.67 | $150 unified | $110 (charter), $60 gateway (strategy) | <= $60, 100% attributed | `fleet_budget`, `fleet_ai_run_rate_30d_usd` |
| Open agent issues | 71 (2 critical, 41 high) | n/a | <= 10 | <= 10, each with a machine probe | `agent_issues` |
| Metrics in breach | 19 of 95 (92 fresh within 26h) | 0 | 0 | 0 | `v_metric_trigger_state` |
| Watchmaker index | 3 | 0 | 0 | 0 | `GET fleet.qnfo.org/api/watchmaker` |

### 1.2 Where the invocations go: the fleet watches itself

`worker_usage_daily` (Cloudflare GraphQL, 2026-10-06) shows a floor of about 240 to 460 requests a day on almost every
worker, including workers with no public surface and no cron (qnfo-paper-reviser 264, qnfo-tools-mcp 254,
qnfo-agent-orchestrator 246, qnfo-outreach 258, qnfo-subscribers 259). That floor is the fleet probing itself: the
dashboard every 15 minutes, qnfo-lifecycle hourly pings, qnfo-deploy-guard every 20 minutes, the self-audit on every
push, qnfo-ops `registryRefresh`, ai-health-prober and qnfo-ai-calibration every 20 and 30 minutes. Roughly 40 workers
times 300 requests is about 12,000 self-observation requests a day. Real traffic sits on five workers: qnfo-gateway
9,346/day (qnfo.org, papers.qnfo.org), q08-signal-engine 3,128, qnfo-ai 1,726, qnfo-deploy-guard 1,519 (locks and
claims, mostly sessions), qnfo-ops 1,316. Eleven workers run fleet governance or reporting on the same database
(qnfo-ops, qnfo-cloud-ops, qnfo-fleet-control, qnfo-kaizen, qnfo-deploy-guard, qnfo-backlog-exec, qnfo-observability,
qnfo-autonomy-scorer, qnfo-fleet-dashboard, fleet-exec, qnfo-lifecycle), and four of them compute fleet health views.

### 1.3 Where the money goes

- The fleet's own AI run-rate is **$61.67 per 30 days** (`fleet_ai_run_rate_30d_usd`). The account reads $224.55 against
  the $150 unified cap and $453.87 all-in (`cost_usd_30d`). The difference is agent sessions (gpt-5.5 through the
  gateway) and the owner's desktop client on the BYOK DeepSeek key: about 85% of AI spend is the labour of building the
  fleet, not the fleet. `ai_spend:openai` reads $197.78 against a $60 cap with no fleet worker on OpenAI.
- Workers AI reads $59.58 against a $25 cap. By call count the top caller is qnfo-ai-calibration (11,678 calls in 7
  days, $0.81): a canary that costs little per call but holds the 30-minute slot and replays through the AI Gateway
  cache; the research pipeline is the top caller by cost ($1.43 in 7 days, 341 calls across 8 models).
- `cache_read_tokens` is 0 everywhere (RM-COST-PREFIX-CACHE-1): no prefix caching on any paid path.
- Sessions: 52 `session_records` in 30 days, 697 tasks, mean execution ratio 0.72; 250 commits to main in 7 days, of
  which 169 came from sessions, 65 from the self-heal bot and 16 from the fleet's own bots. Session labour is the
  largest cost line and the one the mission says should narrow to policy and exceptions.

### 1.4 The autonomy engine

- **Code loop.** 56 `code_tasks` all-time: 16 merged (7 verified live), 40 closed. Success rate 0.29 against a target
  of 0.6. The closures name the engine's walls: control-plane workers (qnfo-ai, qnfo-fleet-control) are never
  auto-merged (CONTROL-PLANE-MANUAL-1); "stale base" when main moved; "anchor occurs 0 times"; "patch does not apply";
  "file larger than 60000 chars needs an anchor"; "no single var VERSION line"; "source issue came from a chat session".
  The code agent edits one anchor in one file; it does not run the 154 offline suites before opening a PR. Read from
  the source: the orchestrator stores a verified patch and `.github/workflows/code-task-publish.yml` pushes the branch
  after the next main push (measured 2026-10-06: 30 runs in 23 minutes, ready to `branch_pushed` in 24 s, so publish
  is not the wait); qnfo-fleet-control opens the PR only inside the hourly merge tick, so ready to `pr_opened_at` is
  40 to 50 minutes on every task with a PR and 5 hours overnight (ready 01:00Z, opened 06:00Z on 2026-10-03), and the
  runner merges at most `code_merge_max_merges_per_tick` (3) per hourly tick; the planner trusts `REACH-IDEA-*` issues that the merge runner's trusted-origin list refuses, so every
  reach-idea task is built and then refused; nine workers are on the `CM_DENY` list; a PR touching more than one file
  is refused; `needs_human` is a terminal state for an anchor that occurs 0 or 2 times, a file over 60,000 characters
  without an anchor, or a JavaScript verifier that is not "enforced"; 19 of 153 suites are referenced by no workflow.
  Issue to verified-live takes roughly 3 to 5 hours when nothing refuses it.
- **Evolve loop.** 120 `evolve_candidates`: 93 `rejected-parse`, 16 applied, 3 auto-reverted, 1 verified. Three of
  four proposals never parse.
- **Measurement to action.** 95 metrics, 78 enabled triggers, **9** with a `code-task:` line; `breach_code_task_pct`
  reads 0 against a target of 30. 118 active `remediation_contracts`, **91** of them `needs-machine-probe` (an issue
  that can only be closed by a session). 142 `guard_registry` rows.
- **Sessions as the engine.** The fleet's loops observe, file and verify; sessions build. Every item in this audit
  that needed code in the last 24 hours (PRs 625, 626, 630, 633, 639, 644, 648, 654, 657) was a session's.

### 1.5 The data plane

`qnfo-audit` holds 410 tables (the charter counted 296 on 2026-10-01), five parallel work ledgers (`agent_issues`,
`roadmap_implementation`, `kaizen_candidates`, `evolve_candidates`, legacy `tasks`), date-stamped snapshot tables and
`bak_*` copies, and grows about 10 MB a day. Three small databases (qnfo-cms 0.2 MB, qnfo-outreach 0.3 MB,
portfolio-state 0.4 MB) are separate D1s for historical reasons; `qnfo-identity` is separate by design (IDENTITY-STORE-1).
Eight workers each hold their own `send_email` binding while six route through qnfo-email. qnfo-ai and qnfo-infra bind
the same seven Vectorize indexes. qnfo-ops binds 8 D1 databases, 14 services, 6 Vectorize indexes, 4 R2 buckets, a
queue, a workflow and a loader: the deploy path and the ops agent share one blast radius.

### 1.6 The repository and CI

Pillars are declared in `wrangler.toml` on 2 of 42 live workers (charter rule 1 is enforced only for new directories).
fleet-exec carries two VERSION constants. errata-hub is 21,900 lines of three embedded minified bundles; qnfo-pdf is
15,146 lines with KaTeX inlined. The 35 one-shot `apply-*` workflows and 5 `restore-container-config*` workflows are
spent: they encode past patches as CI and are the "applier rot" the ledger already names (#1673). deploy-gate runs 108
steps per push, one per suite, so every new fix adds a step. Main has no GitHub branch protection; the merge lane
refuses control-plane PRs by policy because the gates are not enforced by the platform.

### 1.7 Reach and the review gate

1 confirmed subscriber, 0 credibility events, 6,580 pageviews in 30 days, 134 posts, 30 publications. The review gate on
2026-12-31 (credibility >= 2 or subscribers >= 50 or funding, and spend inside the cap) decides whether the research
layer continues. The subscribe box exists on qnfo.org and papers.qnfo.org (qnfo-gateway `ld-sub-form`, posting to
`/api/subscribe`) although `RM-SUBSCRIBE-CTA-1` still reads `not-built`: the register is behind the code. ideas.qnfo.org
gets its box in #2001; q08.org has its own list. `citation_pdf_url` is emitted only when the paper record carries a
PDF (`paper._pdf`), so Scholar coverage equals PDF coverage and is not measured; the funnel monitor is not built.
Research output is the one pillar at health 1.0; attention is the one the gate grades.

### 1.8 Security

qnfo-memory-mcp now fails closed on `MCP_TOKEN` (2.0.5: 401 without a bearer, 503 when unset), so #1678 is a
verification, not a build. qnfo-containers-pilot exposes a shell behind one static token (#1677), Secrets Store and
scripted rotation are not built (RM-SECRETS-STORE-1), admin routes rely on bearer tokens rather than Cloudflare Access,
and there are no WAF or rate limits on public endpoints (RM-WAF-RATE-LIMIT-1). The `security` pillar reads health 1.0
because its only metric counts open `SEC-*` issues, and those are filed under other names.

### 1.9 What works and is protected

The canonical deploy path (3,117 deploys in 7 days, 3,076 ok, merge to live in about 2 minutes); the metric closed loop
(hourly measure, judge, file, auto-close on recovery with evidence); remediation contracts that close issues on a
passing probe and reopen them on relapse; work claims and secret locks that let several sessions work at once; mirror,
version and charter guards; the charter and portfolio loops that rewrite their own documents daily; 18 of 18 MVP
components serving. None of these is torn down by this program; several are the executors of it.

### 1.10 Second read: corrections (measured 2026-10-06, 06:30-07:15Z)

A second session re-read the numbers this program rests on before acting on them (SESSION-EFFECTIVENESS-1: check that a
gap is measured before treating it as a gap). Four of them do not hold as written:

- **Contracts that need a session.** Of the 92 `remediation_contracts` rows in `needs-machine-probe`, 82 belong to issues
  that are already closed and 1 to a wontfix; **9** belong to open issues. The open-issue number is the session dependence
  (an open issue only a session can close); the closed-issue rows are missing relapse detection, a smaller and different
  gap. T5 lever 2 and the scoreboard are split accordingly.
- **Subscribe boxes.** ipatent.qnfo.org already serves an email input (2 on the home page), as do qnfo.org,
  papers.qnfo.org, ideas.qnfo.org (PR 655, live 05:52Z) and q08.org. The one public surface without a box was
  ask.qwav.tech (qnfo-ai-search 2.2.6, PR 669, posting cross-origin to the qnfo.org double opt-in that already allows the
  origin).
- **Freshness is part stale and part frozen.** `freshness_guard` reads 13 fresh of 17, which is the OODA observe stage
  (3.8, the weakest stage, so it also caps `ooda_closure`) and half of `s2_coordination`. Of the 4 stale rows, `kaizen`
  monitors a worker retired in PR 657, `version_queue` is graded as a heartbeat although version requests arrive as events,
  and `amh_coverage` reads 24 of 42 models never probed after the prober fold. Two rows (`handoffs`, `vault_notes_index`)
  are no longer in the checker's signal list, so nothing re-checks them: `handoffs` still reads fresh at a checked_at of
  2026-09-29 while its newest row is 2026-09-28. A frozen row is counted as if it were measured.
- **The undecided issues are mostly decisions already made.** `ooda_decide` counts 6 open issues with no next action.
  Three (1750, 1901, 1903) are owner or third-party decisions with the default recorded on the issue (owner dismissed the
  eligibility card for 1901 on 2026-10-04); 2002 closes itself on q08's next published piece; 1898's state lives in the
  personal-life D1, which a `qnfo-audit` probe cannot read (the personal/research plane separation, by design). A probe
  that can never pass would raise the score and measure nothing, so none was written; T5 lever 6 gives such issues a
  state of their own instead.

### 1.11 Autonomy scores: where each point is lost

`autonomy_scores` on 2026-10-06 (composite 4.3 unweighted, SAI 3.39 of 5). The table names, for each dimension below
5, the term that binds it and the lever in this program that moves it. Scores are only raised by changing what they
measure, never by changing the formula to read higher (rule 1 of the core prompt; the guard metrics hold).

| Dimension | Score | Binding term (formula) | Lever |
|---|---|---|---|
| `s5_policy` | 1.4 | `impact_thresholds` MET 2 of 7 (business gates: subscribers, credibility, funding) | T7; owner-held items stay on the owner list |
| `issue_flow` | 3.3 | close rate 96.1% x pressure 0.685 (73 open vs ceiling 50) | closures with evidence (7 probes due to pass on 2026-10-06), T5.2, fewer duplicate filings |
| `sai_weighted` | 3.39 | largest shortfall `self_improv` 0.434 = kaizen x (1 - step x open issues) + closure + heal | open issues again; the same closures move it |
| `ooda_observe`, `ooda_closure` | 3.8 | `freshness_guard` 13 of 17 fresh | T5 lever 7 (retired-producer and frozen rows) |
| `s2_coordination` | 4.4 | live==repo 40/40 and freshness 13/17 | T5 lever 7 |
| `ooda_decide` | 4.5 | 66 of 73 open issues with a next action | T5 lever 6 (blocked-external state; recorded for 5 issues 2026-10-06, epics 2025-2027 filed with probes) |
| `overall` | 4.3 | mean of 17, with `watchmaker_inverted` a hand score of 4.8 from 2026-09-24, past its next date | T5 lever 8: measure it from `watchmaker_index` (expected to read lower: 3 counted ops today) |
| SAI `thinking` | 0.6 | `report_card_inputs.arc_agi_10task_pass_rate` = 0.2 | a model benchmark; not moved by this program while spend caps are breached |

Two of these are measurement corrections that will lower a reading before they raise one (`watchmaker_inverted`, the
frozen `handoffs` row). That is the intended direction: a score that reads high because nothing re-measures it is the
failure mode the guard metrics exist to catch.

### 1.12 Third read: the engine after its first tick (measured 2026-10-06, 07:40-08:10Z)

TRANSFORMATION-LOOP-1 (qnfo-fleet-control 0.4.132, live 07:43:45Z) ran its first tick at 08:01:00Z: wave W0, 13 levers
landed, 38 pending, 8 session, 1 dispatched. A read of what it found, and of the code loop it depends on:

| Read | Value | Source |
|---|---|---|
| Live workers | 31 at 07:33Z (42 at 05:40Z); 29 once PR 674 deletes errata-hub and qnfo-agent-orchestrator | Cloudflare `workers/scripts` |
| `worker_count` metric | 38 at 07:01Z, 32 at 08:01Z: it counts `service_registry`, which trails the deletes by up to an hour | `metric_registry` |
| W0 exit | `worker_count <= 38` met; `code_task_success_rate_30d >= 0.45` unmet (0.28 at 07:01Z, 0.26 at 08:01Z) | `transformation_runs` 1 |
| Code tasks, 30 days | 64 created; 16 merged; `code_task_superseded_share_30d` 0.40 | `code_tasks`, `metric_registry` |
| Metrics in breach | 22 of 95 at 08:01Z (21 at 07:01Z) | `v_metric_trigger_state` |
| Open agent issues | 77 at 08:01Z | `metric_registry` |
| `freshness_guard` | 16 rows, 3 stale (`kaizen`, `version_queue`, `amh_coverage`), 1 idle | `freshness_guard` 07:40Z |

Five findings, each with its fix or lever:

- **The program fed its own wall.** Issues carrying `code-task:` lines on control-plane paths (2005 on qnfo-fleet-control,
  2023 on qnfo-gateway, 2013 on qnfo-fleet-control) became code tasks. The merge runner refuses those paths before it opens a
  pull request (`cmScope`, CM_DENY), so ct_u4ih8uzgsfxzvm and ct_rwqd5kegl1awi4 spent their model calls and ended `failed`,
  and ct_y50fywmld0qa5k was `ready_to_publish` on the same road. Every such refusal lowers `code_task_success_rate_30d`, the
  one unmet exit of W0, which every later wave waits on. Fixed by T1.15 (MERGE-SCOPE-INTAKE-1, qnfo-code-orchestrator
  0.3.19): the orchestrator refuses a control-plane task before any model call and turns the issue's `code-task:` line into
  a `session-task:` line with the reason.
- **A fold lifted a guard.** qnfo-autonomy-scorer is on the never-auto-merge list so that no loop merges a change to the
  formula that grades the fleet. SCORER-FOLD-1 (PR 668) moved its code into qnfo-observability, which no list named: from
  then on the planner could plan, and the merge runner could merge, a change to the scoring formula. Fixed by T3.15
  (SCORER-HOST-DENY-1, qnfo-fleet-control 0.4.133, and FOLD-GUARD-PARITY-1, a deploy-gate suite that reads every FOLDED
  marker, fails when a denied guest's host is not denied, and holds CM_DENY, TP_CONTROL_PLANE and PLAN_DENY_WORKERS equal).
- **T1 lever 8 contradicted an applied owner decision.** human_actions 21 (resolved 2026-10-02 as option (a), under rule 8)
  keeps the verifier workers (qnfo-fleet-control, qnfo-deploy-guard, qnfo-ops, the code loop) manual and allows staged
  automatic changes to qnfo-ai and qnfo-gateway only after a staged-rollout path passes a live test. Branch protection does
  not change that: the merge runner already merges only on green required checks, so a required-check rule adds nothing to
  its own merges; what the verifier workers lack is a revert path that does not run through themselves. And
  TRANSFORMATION-LOOP-1 opens the whole control plane to code dispatch the moment lever (1, 8) lands
  (`TP_CONTROL_PLANE_LEVER`). Lever 8 is superseded by T1.17 (staged rollout for qnfo-ai and qnfo-gateway, which then leave
  the three lists together) and T1.18 (the verifier workers stay manual: an owner-held row, never dispatched).
- **The verifier turned fixable proposals into `needs_human`.** The Dynamic Workers sandbox passes only `err.message`, so a
  parse error can arrive as "Unexpected identifier '__name'" with no `SyntaxError` class (ct_lc6has32addg0m, 07:41Z, the
  code task for #2028), which the verifier read as "could not confirm the syntax" and ended the task. Fixed by T1.19
  (JS-VERIFY-PARSE-SHAPE-1): V8 parse wording is a failed proposal the next rung retries with the error. T1.4's
  deterministic half (ANCHOR-REPAIR-1, an anchor that no longer occurs is repaired without a model call) lands with it.
- **A writer re-created what a migration deleted.** PR 677 deleted the dead `kaizen`, `vault_notes_index` and `handoffs`
  rows at 07:10Z; the prober (qnfo-ai-calibration) still listed `kaizen` and re-wrote it at 07:40Z. The writer side of #2028
  (qnfo-ai-calibration 1.3.2: no `kaizen` signal, `version_queue` an event register with a 336 h window, `amh_coverage`
  graded over the probe roster) lands with this version. The 24 never-probed external ids sit in `ai_model_health` because
  the prober's roster prune has never run: `_del.bind.apply(_del.bind, [null].concat(_roster))` calls `bind` with the wrong
  receiver and the error is swallowed (T5.11).

The wave design itself has a weakness this read exposes: W0 exits on a 30-day trailing ratio, and the 42 tasks closed between
2026-10-02 and 10-05 stay in its window until 11-01 to 11-05 whatever the loop does now. T1.16 gives W0 a leading exit.

---

## 2. Diagnosis: five structural causes

1. **Sessions are the engine; the loops are the audience.** The loops measure, file and verify, but the change itself
   (code, schema, retirement) is made by agent sessions, which are the largest cost line, leave 28% of their tasks
   undone and depend on continued Claude usage (NO-CLAUDE-RUNTIME-DEPENDENCY-1). The code loop that should replace
   them lands 29% of its tasks and is barred from the control plane.
2. **The fleet watches itself more than it works.** About 12,000 requests a day are self-observation; eleven workers
   govern and four report. Observation is cheap per request and expensive in nodes, crons and attention.
3. **Growth by addition.** Every fix added a worker, a table, a workflow, a suite or a migration, and the net-zero rule
   only binds new worker directories. Consolidation has been planned since September (7 merges queued 2026-09-27,
   due 10-04) and is landing one worker at a time by session (PR 657 today).
4. **Measurement without actuation.** 95 metrics and 78 triggers, but 9 triggers hand their breach to a doer and 91 of
   118 contracts have no machine probe. A breach becomes an issue; an issue waits for a session.
5. **Cost outside the fleet's control.** The fleet spends $62; the account spends $225 to $454. The unmetered part is
   the building, not the running, and the cap system cannot see it.

---

## 3. The program: nine transformations

Each transformation names its end state, the measured start, the levers in order, the loop that executes it, the
metric and probe that close it, and what is torn down. Levers marked **(code)** are single-file changes a code task can
land today; **(refactor)** needs the T1 engine or a session; **(retire)** is covered by OWNER-STANDING-GRANT-1.

### T1. Autonomy engine: the code loop becomes the builder, sessions the exception

**End state.** issue -> code task -> branch -> edit (multi-file) -> offline suites run in the container -> PR ->
gated self-merge on every worker including the control plane -> canonical deploy -> live probe -> issue closed with
evidence. A session is called only when a task fails twice. `code_task_success_rate_30d` >= 0.6,
`breach_code_task_pct` >= 30, `session_records_30d` falling month over month.

**Measured start.** 0.29 success; 9 of 78 triggers with `code-task:`; control-plane PRs never auto-merged; evolve
93 of 120 proposals unparseable; no suite run before PR; main unprotected.

**Levers, in order.**
1. **(code)** Trusted-origin parity: the merge runner's trusted list equals the planner's (`REACH-IDEA-*` and
   `METRIC-TRIGGER-*` included) so a task the planner builds is never refused for provenance.
   `qnfo-fleet-control/worker.js`.
2. **(code)** PR-open on the 20-minute tick (TP-1b2, `agent_issues` 2017): fleet-control's `*/20` cron also runs
   `codeMergeTick` in an open-only mode, so a pushed branch has its PR (and its CI) within 20 minutes instead of at
   the next hour; merges stay hourly. `qnfo-fleet-control/worker.js`. (The first form of this lever, the orchestrator
   pushing through the Contents API, was refuted by measurement on 2026-10-06 and closed as issue 2006: the push
   already takes under a minute, and the orchestrator holds no GitHub credential by design.)
3. **(code)** Rebase-before-publish: re-anchor against current main immediately before the push and retry once on
   "stale base" or "patch does not apply" (7 closures named these). `qnfo-code-orchestrator/worker.js`.
4. **(code)** Anchor repair instead of `needs_human`: when the anchor occurs 0 or 2 times, ask the model for a new
   anchor from the current file; when the file is over 60,000 characters, derive an anchor from the planned edit
   point. `needs_human` remains only for "proposed no change".
5. **(code)** The JavaScript verifier runs in the PyContainer on every task (node syntax check, the worker's own
   `*.test.mjs` suites, `scripts/deploy_gate.py --check <worker>`); a failing suite is a retry with the failure text
   in the prompt, not a PR and not `no-verifier`.
6. **(config, done)** `code_merge_max_merges_per_tick` reads 3 in `ops_config` (72 merges a day); raise to 5 only
   when the queue holds green PRs at tick time.
7. **(code)** Evolve parse gate: a candidate that does not parse is re-asked once with the parse error; a second
   failure records the model and prompt version so the prompt is fixed, and `evolve_parse_pass_pct_7d` is graded.
8. **(superseded 1.2 by levers 17 and 18; section 1.12)** ~~GitHub branch protection on main~~ with `gate`, `guard`, `mirror-guard`, `comparator`, `charter` and `test` as
   required checks (one-time, through the repository's token in cf-ops-actions or a session), then **(code)** drop
   CONTROL-PLANE-MANUAL-1 and shrink `CM_DENY` for PRs whose head passes every required check: the platform, not the
   policy, is the gate. Control-plane changes still carry the stricter test set (T5.4).
9. **(code)** Every enabled trigger gets a `code-task:` and `code-anchor:` line where its lever is a single-file change
   (ACT-BRIDGE-1); the 69 triggers without one are reviewed in `analytics_metric_triggers.action` by one migration.
10. **(repo)** The 19 suites no workflow references join the gate (through the one suite runner of T3.8).
11. **(refactor)** Multi-file tasks: the task carries a file list and the agent edits a branch checkout in the
    container (clone the branch, edit, test, push); the "more than 1 file" refusal becomes "more than the task's
    file list".
12. **(code, done 0.4.132)** Session fallback: a task that fails twice files `CODE-TASK-NEEDS-SESSION-1` with the failure text; the
    watchmaker index counts those rows, so session dependence is measured as it falls.

13. **(code, done)** No-op proposal gate (NOOP-PROPOSAL-GATE-1, issue 2018): a proposal whose non-VERSION diff only
    rewords string literals or comments is refused and fed back to the next rung.
14. **(code, control plane)** The code orchestrator takes the work claim on a file before it proposes, so sessions see the
    task and review instead of duplicating it (registered 08:40Z by another session's assessment; row (1, 14)).
15. **(code, done 1.2)** Merge-scope intake (MERGE-SCOPE-INTAKE-1, 0.3.19): a task on a CM_DENY worker is refused before
    any model call and its issue's `code-task:` line becomes a `session-task:` line with the reason (section 1.12).
16. **(code, done 0.4.134)** A leading W0 exit (W0-LEADING-EXIT-1): `code_task_success_rate_30d` keeps its scoreboard
    row and trigger, and W0 exits on `code_task_success_rate_engine`, the same formula over code tasks created after lever
    15 landed, unmeasured until 8 have finished, so the wave measures the engine as it is, not the 42 closures of
    2026-10-02 to 10-05 that stay in a 30-day window until November. `qnfo-fleet-control/worker.js` (`TP_WAVES`,
    `tpValues`).
17. **(refactor, W1)** Staged rollout for qnfo-ai and qnfo-gateway, the scope human_actions 21 allows: the canonical deploy
    uploads a version, deploys it to a fraction of traffic, probes it and promotes or rolls back without running through
    the changed worker; after a passing live test the two workers leave CM_DENY, PLAN_DENY_WORKERS and TP_CONTROL_PLANE in
    one change (FOLD-GUARD-PARITY-1 keeps the three lists equal). qnfo-gateway carries the public site and the reach
    pillar's surface (`paper_render_defect_pages` 68 is its breach), so this lever opens the reach work to the code loop.
18. **(done 1.3, CONTROL-PLANE-SELF-MERGE-1)** The verifier workers (qnfo-fleet-control, qnfo-deploy-guard, qnfo-ops, the
    code loop) were manual under human_actions 21, option (a), rule 8. Since 2026-10-06 (owner directive, rule 8 deleted;
    qnfo-fleet-control 0.7.0, PR 737) the stale-PR lane merges a green, quiet session pull request to a control-plane
    worker with a /health canary, and canonical-deploy.yml reverts and redeploys a push whose VERSION never arrives
    (scripts/canary_revert.py, one level). The code loop still neither plans nor merges them (PLAN_DENY).
19. **(code, done 1.2)** Parse-shape verifier (JS-VERIFY-PARSE-SHAPE-1, qnfo-code-orchestrator 0.3.19, live 08:41Z): V8
    parse wording without its class name is a failed proposal, retried with the error; JSON.parse wording is excluded.
    (Numbered 19 in the register because (1, 14) was taken.)

**Executor.** qnfo-code-orchestrator (levers 2 to 5, 7, 11, 12, 14, 15, 19), qnfo-fleet-control merge lane (1, 16, 17), `ops_config`
(6), one migration (9), the repo (10).
**Probe.** `code_task_success_rate_30d` >= 0.6 for 14 days and at least 10 merged control-plane PRs by the loop.
**Rollback.** Each lever is a version; the merge lane keeps `stale_pr_merge_enabled` and CONTROL-PLANE-MANUAL-1 as
kill switches until the probe holds.
**Torn down.** The expectation that sessions build; `code-task-publish.yml` once the container publishes directly.

### T2. One kernel, one dispatcher, heartbeats instead of probes

**End state.** Governance is qnfo-fleet-control (kernel), fleet-exec (dispatcher and task engine) and
qnfo-fleet-dashboard (the owner surface); qnfo-deploy-guard stays as the lock service. Observation is one probe pass per
cycle written to one table; cron-only workers write `fleet_heartbeat` instead of being polled. Self-observation falls
from about 12,000 to under 3,000 requests a day; governance workers from 11 to 4.

**Measured start.** 11 governance workers, 4 health computations, 7 heartbeat rows, probes from 5 places.

**Levers.**
1. **(retire)** qnfo-kaizen and qnfo-skill-sync (PR 657, in flight), then qnfo-backlog-exec (its daily sweep is
   `v_issue_queue` plus the remediation tick), qnfo-observability (Logpush ingest moves to a Tail Worker or to
   fleet-control's hourly tick), qnfo-autonomy-scorer (its daily scoring joins fleet-control's daily cron; the
   dashboard parity test keeps the formula), qnfo-lifecycle (its 5-entry CRON_TABLE becomes `fleet_crons` rows under
   fleet-exec; RM-CONSOLIDATION-WAVE-B-1), qnfo-ai-calibration into ai-health-prober (one prober, hourly, 1-token
   pings; #1682).
2. **(code)** One probe pass: fleet-control's `*/20` tick probes every live worker once and writes `worker_live_audit`;
   the dashboard, lifecycle and deploy-guard read that table instead of probing (RM-PROBE-VERIFIED-COVERAGE-1 content
   assertions ride the same pass).
3. **(code)** Heartbeats: every cron handler ends with one `fleet_heartbeat` upsert (a 3-line helper); the monitor of
   monitors flags any worker silent for 2x its cadence (RM-MONITOR-THE-MONITORS-1).
4. **(code)** fleet-exec `*/10` becomes the single dispatcher for every schedule finer than hourly; workers keep at most
   one platform cron each (C5 convergence, #1691).

**Executor.** fleet-control merge lane for retirements (standing grant), code tasks for 2 to 4.
**Probe.** `worker_count` <= 34 after this theme alone; self-observation requests (a new column in the daily
`worker_usage_daily` read: requests on workers with no public route) under 3,000; `watchmaker_index` unchanged or lower.
**Rollback.** RETIRED markers are reversible by redeploy; the probe table keeps the old writers' columns.
**Torn down.** 7 workers, about 12 crons, three health computations.

### T3. Footprint teardown: 42 -> 24 workers, 10 -> 8 databases, 80 -> 25 workflows

**End state.** The MVP 18 plus at most 6 earned extras; one MCP; one email transport; one orchestrator; radars inside
the research worker; `archive/` holding every dead directory with a manifest; about 25 workflows; qnfo-audit under a
retention policy with table families and no snapshot tables older than 30 days.

**Measured start.** Section 1.1 and 1.5.

**Levers.**
1. **(retire)** T2's seven, plus qnfo-outreach (PR 657), qnfo-email-orchestrator (its reply drafting folds into
   qnfo-email; the blocker recorded 2026-10-02 is that fold), qnfo-agent-orchestrator (idea-hub's binding moves to
   qnfo-intent-orchestrator or qnfo-ai), qnfo-archive (handoff search joins qnfo-memory-mcp), qnfo-skill-sync.
2. **(refactor)** MCP 2 -> 1: qnfo-memory-mcp's tools join qnfo-tools-mcp behind one authenticated endpoint
   (T8.1 fixes the missing auth at the same time).
3. **(refactor)** Radars: radar-hub's seven modules move into qnfo-research-exec's scheduled handler as stages
   (the Workflow binding JOB_MARKET_WATCH retires with job-market-watch, already retired); conference and events
   radars keep writing their tables.
4. **(refactor)** errata-hub de-minified or retired: 21,900 lines of embedded bundles with 287 self-probe requests a
   day and 15 real requests a month; the errata path is also written by qnfo-paper-reviser. Decision rule: if
   `errata_queue` gains no external row in 30 days, retire with a RETIRED marker and leave the public errata pages to
   qnfo-gateway.
5. **(code)** Email: the 8 private `send_email` bindings route through qnfo-email's `/send` (one audit trail, one
   kill switch, one suppression list).
6. **(migration)** D1 10 -> 8: qnfo-cms and portfolio-state fold into qnfo-audit after verified copies (D1-FOLD-1);
   qnfo-outreach stays until the outreach engine consolidation lands, then folds. qnfo-identity stays by design.
7. **(migration)** qnfo-audit retention: drop `bak_*` tables older than 30 days after an R2 dump, name every table's
   family in a `table_registry` row (writer, reader, retention days), and let the lifecycle tick enforce retention.
8. **(repo)** Move the 51 RETIRED/FOLDED directories, the 12 toml-less directories and the root duplicate under
   `archive/` with `archive/MANIFEST.md`; delete the 35 `apply-*` and 5 `restore-container-config*` workflows after
   confirming each marker is on main (the appliers are idempotent, so a deleted applier whose patch is live changes
   nothing). Fold the 108 gate steps into one `scripts/run-suites.mjs` that runs every `*.test.mjs` of the changed
   workers (new suites then need no workflow edit).
9. **(code)** `charter-guard.py` requires `# charter-pillar:` on every live `wrangler.toml` (today 2 of 42), with the
   42 declarations landed in the same PR.

10. **(refactor, W2)** calendar-api folds by the kit (lever 14). It serves the qnfo, personal and host calendars from
    qnfo-audit and is bound by personal-api, qnfo-intent-orchestrator and radar-hub (cron `17 * * * *`). A trial on
    2026-10-06 folded it into personal-companion (hourly) with a least-privilege member env (its own `CAL_DB`, `ICS_R2`,
    `VAULT`, `CAL_TOKEN`, never the host's `PERSONAL`): the generated suite and every personal-companion suite passed and
    the three binders were re-pointed. radar-hub, the other natural host, is refused by the kit until its three top-level
    VERSION lines become one. personal-companion and personal-api themselves stay separate until the companion-generation
    Workflow or the PersonalTwinAgent Durable Object can move with its state (the kit refuses both).
11. **(refactor, W2)** qnfo-intent-orchestrator: its downstream (qnfo-agent-orchestrator) is retired with PR 674 and seven
    promoted candidates wait on a dispatch that fails (epic 2010); fold its intake into idea-hub and route promotions to
    qnfo-research-exec. Four binders (qnfo-ai, qnfo-fleet-control, qnfo-ops, qnfo-tools-mcp), three on the control plane,
    so a session.
12. **(refactor, W2)** qnfo-observability into qnfo-ai-calibration: both measure; the calibration's `*/30` tick carries
    observability's hourly ingest at :00 and the scorer at 05:00 (the host already awaits a member). The scorer's
    protection moves with it (FOLD-GUARD-PARITY-1 fails CI otherwise).
13. **(refactor, W2)** qnfo-subscribers into qnfo-email (one list, one transport, one suppression list): its URL callers
    (idea-hub, qnfo-gateway, qnfo-ipatent) re-point to the host route first; qnfo-gateway is control plane, so a session.
14. **(repo, built 1.2)** Fold kit: `scripts/fold_worker.py <guest> <host>` replaces the hand-written builders of waves 1
    to 3. The guest runs unchanged in an IIFE; the host's default export is wrapped (`__foldWrap`), never edited; the member
    env is least privilege (the guest's bindings, vars and the env names its code reads), where the hand folds passed the
    whole host env; bindings merge from the parsed tomls; binders and the host's own binding are re-pointed with
    `props.member`; a parity, routing and schedule suite is generated. It refuses a guest exporting a Durable Object or
    Workflow class, a fold that hands research code a personal-plane binding or moves personal resources into a research
    worker (PERSONAL-RESEARCH-SEPARATION-1), and a host with more than one top-level VERSION line. `scripts/fold_worker_selftest.py` (14) runs in
    deploy-gate. Done when the next production fold is produced by it.
15. **(code, done 1.2)** Fold-guard parity (SCORER-HOST-DENY-1, FOLD-GUARD-PARITY-1, section 1.12).

T3.2 (MCP 2 -> 1) carries a dependency the repository cannot show: the owner's desktop clients reach qnfo-memory-mcp by URL
(`owner_client_keys`, 3 rows). The fold re-points those clients first or keeps the old hostname as a route of the host.

**Executor.** Retirements by the merge lane under the standing grant; refactors by T1 lever 7 or a session; migrations
by the lifecycle tick once T5.3 lands.
**Probe.** `worker_count` <= 24, `d1_databases` <= 8, workflow count <= 25 (counted by `scripts/charter-guard.py`),
`qnfo-audit` size not growing week over week.
**Rollback.** Everything retired stays in git; D1 folds happen after verified copies and an R2 dump.
**Torn down.** 18 workers, 2 databases, 55 workflows, 60-odd directories from the live tree, about 80 gate steps.

### T4. Cost: the fleet runs on <= $40 and the building is metered

**End state.** Fleet run-rate <= $40 per 30 days, 100% attributed; every paid path has a verifier and prefix caching;
session and owner-client spend is visible as its own line and never counted as fleet spend; every provider class inside
its cap.

**Measured start.** Fleet $61.67; account $224.55; Workers AI $59.58 vs $25; cache reads 0; attribution 100% today
(day-to-date, 0.4.127).

**Levers.**
1. **(code)** Separate the lines: `unified_cost_usd_30d` splits into `fleet_ai_run_rate_30d_usd` (already measured),
   `session_ai_spend_30d_usd` (gateway metadata `session:*` callers) and `owner_client_spend_30d_usd` (BYOK, declared);
   the cap check reads the fleet line, the other two are shown and throttled (RM-COST-UNIFIED-SPEND-1).
2. **(code)** Prefix caching on the three paid paths (research ensemble system prompts, q08 compose, ops agent): the
   stable prefix goes first and `cache_read_tokens` is written to `ai_spend_ledger` (RM-COST-PREFIX-CACHE-1).
3. **(code)** Draft-verify ladder on every paid path: free draft, cheap verify, paid repair only on FAIL
   (RM-COST-L6-DRAFT-VERIFY-1); the ensemble validator budget (5.31.5) and family-disjoint pool (5.31.4) are the
   first instance.
4. **(retire)** Canary and prober cost: one prober, hourly, 1-token non-reasoning pings (T2.1).
5. **(code)** Cheaper-model switches with per-request fallback and automatic revert (TWIN-FLASH-1 pattern) on q08 compose
   and the research reviewer, recorded on their issues.
6. **(code)** Sessions through the governor: the qnfo-ai `/spend` governor caps session callers at a separate budget,
   so a session cannot push the fleet over its cap.
7. **(code, control plane)** A daily reconciliation of `ai_spend_ledger` against the AI Gateway cost per provider, with
   `cost_attribution_gap_pct` and its trigger (registered 08:40Z by another session; the ledger attributes $4.52 in its
   whole history while `fleet_budget` reads $224.55).

**Executor.** code tasks; fleet-control PERF_LEVERS for the model switches.
**Probe.** `fleet_ai_run_rate_30d_usd` <= 40 for 14 days; `workers_ai_cost_30d_usd` <= 25; `cache_read_tokens` > 0 on
each paid path.
**Rollback.** Model switches revert automatically; caching is a prompt-order change.

### T5. Measurement to actuation: every breach reaches a doer, every contract has a probe

**End state.** `breach_code_task_pct` >= 30; `contracts_needing_probe` = 0; every guard in `guard_registry` is wired
into a gate that runs (lesson G4); a probe generator turns an issue's definition of done into a `d1-query` contract
where the DoD names a table and a count.

**Levers.**
1. **(code)** `code-task:` lines on every trigger whose lever is one file (T1.6).
2. **(code)** Probe generator in fleet-control: for a `needs-machine-probe` contract whose issue text names a metric
   (`metric_registry.<x>`) or a table and threshold, write the `d1-query` probe automatically and mark it
   `generated`; the 91 open ones are the first batch.
3. **(code)** Retention and migration runner: the lifecycle tick applies `migrations/*.sql` whose header carries
   `-- APPLY-BY: lifecycle` and a rollback block, records `migration_runs`, and never applies a file without one.
4. **(code)** Control-plane test set: the gate runs the full suite set for qnfo-ops, qnfo-ai, qnfo-fleet-control,
   qnfo-deploy-guard and qnfo-code-orchestrator and the changed worker's set otherwise (so T1.5 can open the control
   plane to the loop).
5. **(code)** `security_open_issues` counts every issue whose title starts with `SEC-` **or** whose category is
   `security` **or** that names an unauthenticated route, so the security pillar is graded, not asserted.

6. **(data, done 2026-10-06 for 5 issues)** A blocked-external state: an open issue whose next step is an owner decision,
   a third party or another worker's self-closing loop records that disposition in `issue_triage.remediation`
   (`blocked-external: <who> <what>; default in effect: <x>; reopen trigger: <y>` or `self-closing: <worker> <condition>`).
   The scorer already counts a triage remediation as a next action, so this needs no code, only the honest record the
   issue text already carried: 1750, 1898, 1901, 1903 (blocked-external) and 2002 (self-closing). **(code, later)** the
   dashboard lists blocked-external rows under the owner's queue with their default.
7. **(code)** Freshness that measures: `freshness_guard` drops signals whose producer is RETIRED or FOLDED (`kaizen`),
   grades event-driven tables as events (`version_queue`), and the scorer counts only rows re-checked within 48 hours,
   reporting the rest as unmeasured (`handoffs`, `vault_notes_index`). `qnfo-ai-calibration` (the checker since
   PROBER-FOLD-1) and the scorer's host after FOLD-WAVE-1.
8. **(code)** `watchmaker_inverted` measured from `watchmaker_index` (5 x (1 - counted / ops measured)) in the daily
   scoring, replacing the hand score; the two other judgement rows (`independent_decision`, `novelty`) get the same
   treatment when a measured input exists, and stay judgement rows, dated, until then.

10. **(code, control plane)** One worker census (the Cloudflare scripts list) feeds `fleet_budget.workers`,
    `metric_registry.worker_count` and the transformation scoreboard, with a trigger on disagreement (registered 08:40Z by
    another session: at 08:35Z the three read 31, 32 and 38).
11. **(session)** Roster prune that runs: the prober's prune of `ai_model_health` rows outside its roster calls
    `_del.bind.apply(_del.bind, ...)` and has never deleted a row (section 1.12). Back up the table, fix the receiver,
    prune only ids outside the roster with no gateway failure in 7 days, and canonicalise the roster ids as `runProbe`
    writes them, so the prune cannot delete the rows the probe just wrote.

**Executor.** fleet-control code tasks; lever 7 in qnfo-ai-calibration and the scorer host; lever 11 a session.
**Probe.** `breach_code_task_pct` >= 30; `needs-machine-probe` contracts on **open** issues = 0 (9 on 2026-10-06; the 82 on
closed issues get relapse probes where the issue names a metric, 11 of them); `ooda_observe` >= 4.5 with every counted
row re-checked within 48 hours.

### T6. Durable execution: Workflows and Queues replace polling and tool budgets

**End state.** Research publish, ops agent runs, code tasks and outreach chain producer to consumer on Queues and
Workflows; a tool budget ending mid-task is a checkpoint, not a failure (`ops_tool_budget_bail` 28 in 7 days today);
crons are heartbeats and dispatchers only.

**Levers.**
1. **(refactor)** The ops agent promotes a run that exceeds its interactive budget to a Workflow with checkpointed
   continuation (RM-DURABLE-AGENT-EXECUTION-1; #1680).
2. **(refactor)** The research pipeline's stages (ground, draft, review, revise, publish, PDF, graph, related links)
   become one Workflow per version request; the `*/15` drain remains as the dispatcher.
3. **(refactor)** Code tasks run as a Workflow (fetch, edit, test, publish, merge, verify) so a failed step resumes.
4. **(code)** `events` from the metric loop (breach, recovery) publish to a Queue the dashboards and the code loop
   consume, replacing the hourly re-reads.

**Executor.** T1 engine (multi-file) or sessions until it lands.
**Probe.** `ops_tool_budget_bail` 0 in 7 days; `cron_schedules` <= 40; `s2_coordination` autonomy dimension rising.

### T7. Reach that survives the review gate

**End state.** A subscribe path on every public page, Scholar-indexable paper pages, a funnel monitor from publication
to subscription, the selected works and iPatent as the only headline items; 50 confirmed subscribers or 2 credibility
events by 2026-12-31 (STRATEGY-1 s9).

**Levers.**
1. **(code)** Subscribe box on every public surface: live on qnfo.org and papers.qnfo.org, in flight on ideas.qnfo.org
   (#2001), missing on ipatent.qnfo.org and ask.qwav.tech; each posts to the double opt-in with `source=<surface>`,
   and `RM-SUBSCRIBE-CTA-1` is marked `built` with the surfaces as evidence.
2. **(code)** `citation_pdf_url` on every paper page: measure PDF coverage (`papers` rows with a PDF over published
   rows) as `scholar_pdf_coverage_pct`, and have research-exec render the missing PDFs (STRATEGY-1 s4).
3. **(code)** Funnel monitor (RM-FUNNEL-E2E-MONITOR-1): one daily row per stage (publication, deposit, page views, posts,
   post engagement, subscriptions) in `reach_signals`, graded as `funnel_conversion_30d`.
4. **(code)** Monthly research note to subscribers from the selected works (replaces the weekly auto-digest once 10+
   subscribers); LinkedIn document-post series through Buffer inside the cadence caps.
5. **(owner-held, recorded)** arXiv endorsement for works 1, 2, 4; ORCID; these stay on the owner list and are never
   on the critical path.

6. **(code, done)** Ask finds papers the vector index lacks: BM25 over the published catalog inside `retrieve()`, no model
   call (qnfo-ai-search 2.2.7, PR 675, #2029). The AI Search instance had no feeder since 2026-08-11 and 0 of 22 golden
   papers were indexed; live-replay golden MRR went 0.231 -> 0.955, inflated because the questions are written from
   abstracts.
7. **(code, done)** The Ask vector index is fed again: an hourly budget-gated upload of published papers it lacks (ledger
   `ask_corpus_sync`), and golden questions must be complete (qnfo-ai-search 2.2.8, PR 676, #2029).
8. **(code, control plane)** Paper pages typeset the plain-text math the render guard counts (MATH-RESIDUE-2, qnfo-gateway
   3.9.8, #2023), with a committed full-corpus KaTeX check (`scripts/math-corpus-check.mjs`); offline 68 -> 48 defect
   pages, 0 KaTeX failures.
9. **(code, control plane)** UTM click ledger: the public pages record bot-filtered loads that carry `utm_source` /
   `utm_campaign` (RUM carries no query string), so a post or a digest joins to the visits it caused.
   `qnfo-gateway/worker.js`.
10. **(code)** Subscriber digest links carry `utm_source=digest&utm_medium=email&utm_campaign=<slug>`, so a digest joins to
   the reads it caused. `qnfo-subscribers/worker.js`.

11. **(code)** A human inbound message gets a plain-text first response within 24 hours from its drafted reply, behind the
   owner-voice gate (`inbound_first_response_h_median_30d` 72.6 against 48). `qnfo-cloud-ops/worker.js`.
13. **(code)** The distribution learner carries channel (bluesky, linkedin, mastodon, x) as an arm dimension, so the
   attention loop's shift is an experiment the learner credits, not a pause. `qnfo-social/worker.js`.

Levers 6 to 11 and 13 were added on 2026-10-06 by the sessions that built or assessed them (the rows came first; this list
follows them).

**Executor.** code tasks; qnfo-social and qnfo-subscribers loops.
**Probe.** `subscribers_growth_monthly` >= 10; `credibility_events_90d` >= 2; the review gate reads MET.

### T8. The trust boundary

**End state.** Cloudflare Access on every admin route, Secrets Store with scripted rotation, WAF and rate limits on
public endpoints, no unauthenticated write surface, a Tail Worker for unsampled exceptions.

**Levers.**
1. **(verify)** qnfo-memory-mcp's `MCP_TOKEN` gate (live in 2.0.5) proven by an unauthenticated probe suite and
   #1678 closed with that evidence (then folded, T3.2).
2. **(code)** qnfo-containers-pilot `/exec` behind Access service tokens or a rate limit; token rotation scripted.
3. **(platform, one-time)** Access applications for `/ops/*`, `/run`, `/work-lock/*`, dashboard write routes; WAF
   rate-limit rules on the idea form, email command route and ask endpoints.
4. **(platform)** Secrets Store adoption with a rotation runbook executed by cf-ops-actions.
5. **(code)** Tail Worker writing unsampled exceptions to `worker_logs` (RM-TAIL-WORKERS-1).

**Probe.** `security_open_issues` 0; unauthenticated probes of every write route return 401 or 403 (a suite).

---

### T9. A deploy path that cannot lock itself out

**End state.** Retiring or deleting a worker can never make another worker undeployable, and a broken qnfo-ops can always
be replaced: the deploy of the deployer has a path that does not run through its own live code.

**Measured start (2026-10-06).** PR 657 deleted qnfo-kaizen and qnfo-skill-sync while three live service bindings still
pointed at them (qnfo-ops `KAIZEN`, `SKILLSYNC`; qnfo-fleet-dashboard `SVC_QNFO_KAIZEN`). The canonical deploy re-declares
every live binding, so Cloudflare refused both workers (error 10143) from 06:11Z; DANGLING-BINDING-PRUNE-1 only knew 10144.
qnfo-ops deploys itself through its own live code, so its fix could not ship until the bindings were removed out of band
(PR 661 unbind-service, PR 663 Durable Object exports, cf-ops-actions runs 06:20-06:25Z); both deploys were green at
06:26-06:27Z (GitHub #660). A code-only bootstrap (`deploy-qnfo-ops.yml`, `scripts/raw_put.py`) exists but is not a fallback
any loop takes.

**Levers.**
1. **(script)** Delete after unbind (DELETE-AFTER-UNBIND-1): cf-ops-actions `delete-worker` reads every live script's
   bindings first and refuses while any service binding targets the worker, naming the binders; the retirement PR removes
   the declarations, `unbind-service` removes the live ones, then the delete runs. `scripts/cf_ops_actions.py`.
2. **(done, 2.38.43)** The deploy prune accepts 10143 as well as 10144.
3. **(script)** Deployer fallback: when `/ops/deploy` fails for `qnfo-ops` itself, `canonical-deploy.yml` runs the
   code-only bootstrap once (`deploy-qnfo-ops.yml` path) and records which path landed in `fleet_deploys`.
4. **(probe)** A daily census of dangling service bindings (every script's `/settings`, the read used on 2026-10-06) written
   to `worker_live_audit` and registered as `dangling_bindings` with its trigger in the same migration (METRIC-CLOSED-LOOP-1),
   so a broken reference is found before a deploy needs it.

**Executor.** sessions or the code loop for the two script levers; fleet-control's daily tick for the census.
**Rows.** `roadmap_implementation` RM-TP-9-DEPLOY-NO-LOCKOUT; epic `agent_issues` 2025 with its `issue-2025` probe. T5 levers 7
and 8 are `agent_issues` 2026 and 2027, each with a machine probe.
**Probe.** 0 canonical-deploy failures with error 10143 or 10144 over 30 days; `dangling_bindings` 0.
**Torn down.** The order "delete, then find the binders" that wave 2 followed.

## 4. Sequencing: waves gated by metrics, not dates

| Wave | Entry | Content | Exit |
|---|---|---|---|
| W0 (now) | this document on main | T1.1-T1.7 and T1.9 (the engine's walls), T2.1 first retirements (PR 657), T7.1 subscribe boxes, T8.1 memory-mcp auth, T3.8 archive and applier deletion, T9.1 and T9.4, T5.6-T5.8 | `code_task_success_rate_engine` >= 0.45 (code tasks created after T1.15 landed, at least 8 finished; T1.16); `worker_count` <= 38 |
| W1 | W0 exit | T1.8 branch protection and control-plane merging, T1.10, T2.2-T2.4 one probe pass and heartbeats, T5.2 probe generator, T4.1-T4.2 cost lines and prefix cache, T3.5 one email transport, T7.2-T7.3 | `breach_code_task_pct` >= 30; `contracts_needing_probe` = 0; `worker_count` <= 32 |
| W2 | W1 exit | T3.1-T3.4 folds and retirements, T3.6-T3.7 D1 folds and retention, T4.3-T4.6, T6.1 durable ops agent, T8.2-T8.3 | `worker_count` <= 26; `fleet_ai_run_rate_30d_usd` <= 40; `cron_schedules` <= 44 |
| W3 | W2 exit | T6.2-T6.4 research and code loop on Workflows, T1.11 multi-file engine, T8.4-T8.5, research products (Ask QWAV public, living paper) only if the review gate reads MET | `worker_count` <= 24; `cron_schedules` <= 40; `watchmaker_index` 0; sessions used only for `CODE-TASK-NEEDS-SESSION-1` rows |

A wave does not wait for a calendar; it waits for its exit metrics, read hourly by the same loop that grades the
charter. A wave whose exit metric has not moved in 14 days is re-planned: the lever is replaced, not repeated
(METRIC-CLOSED-LOOP-1).

---

## 5. How the program runs itself

- **Rows, not prose.** Each transformation is a `roadmap_implementation` row `RM-TP-<n>` (artifact type by pillar) and
  an `agent_issues` epic `TP-<n>` carrying the levers as a checklist, the probe as a `remediation_contracts` row and
  `code-task:` lines for every lever marked (code). The epic closes when its probe passes; a relapse reopens it
  (REMEDIATION-REOPEN-1).
- **Executors.** The code loop lands (code) levers; the merge lane merges green PRs and retires workers under the standing
  grant; the lifecycle tick applies migrations with rollback blocks (T5.3); PERF_LEVERS moves knobs (two levers exist
  today, both on q08; T4.5 adds the model-switch levers); sessions take only (refactor) levers until T1.11 lands, and
  every session writes `session_records`.
- **What the engine decides for itself (RULE-8-RETIRED-1, owner directive 2026-10-06; it replaced "Guards that never
  move").** Spend caps, guard metrics, verification probes and deletions are the fleet's own decisions, each recorded
  with its reason and a live measurement and changed under core rule 7 (a probe the changer did not write, a revert
  path). What holds: owner-voice gates, email suppression and opt-out, the outreach consent gate and cadence caps, the
  personal/research separation, ENSEMBLE-POLICY-1 for any new model layer, and the human as an override.
- **Re-audit.** `charterTick` (daily) renders this program's scoreboard (section 6) into the charter's live block under a
  `TRANSFORMATION` heading once T5 adds it (one (code) lever on `qnfo-fleet-control/worker.js`); until then
  `GET /charter?facts=1` carries the same metrics. The hand-written sections of this document are re-audited by PR when
  a wave exits, with a version bump.

---

## 6. Scoreboard (existing metrics and autonomy dimensions; T9.4 adds one, with its trigger)

| Metric | 2026-10-06 | W1 exit | W3 exit (end state) |
|---|---|---|---|
| `worker_count` | 42 | <= 32 | <= 24 |
| `cron_schedules` (fleet_budget) | 49 | <= 46 | <= 40 |
| `d1_databases` | 10 | 10 | 8 |
| `code_task_success_rate_30d` | 0.29 | >= 0.6 | >= 0.6 |
| `code_task_success_rate_engine` (T1.16; tasks after T1.15) | unmeasured | >= 0.6 | >= 0.6 |
| `breach_code_task_pct` | 0 | >= 30 | >= 50 |
| contracts `needs-machine-probe` on open issues (1.10) | 9 | 0 | 0 |
| contracts `needs-machine-probe` on closed issues (relapse probes) | 82 | <= 71 | metric-named ones probed |
| `open_agent_issues` | 71 | <= 40 | <= 10 |
| `metrics_in_breach` | 19 | <= 10 | 0 |
| `fleet_ai_run_rate_30d_usd` | 61.67 | <= 50 | <= 40 |
| `workers_ai_cost_30d_usd` | 59.58 | <= 40 | <= 25 |
| `watchmaker_index` | 3 | <= 2 | 0 |
| `session_records_30d` | 52 | falling | exceptions only |
| `subscribers_growth_monthly` | 0 | >= 5 | >= 10 |
| `credibility_events_90d` | 0 | >= 1 | >= 2 |
| `security_open_issues` (graded per T5.5) | n/a | measured | 0 |
| autonomy `ooda_observe` (1.11) | 3.8 | >= 4.5 | 5 |
| autonomy `issue_flow` | 3.3 | >= 4.0 | 5 |
| SAI (`sai_weighted`) | 3.39 | >= 3.6 | >= 4.0 |
| `dangling_bindings` (T9.4; registered with its trigger when the census is built) | 0 at 06:28Z (read once) | 0 | 0 |

Read again at 08:01Z (section 1.12): `worker_count` 32 (31 scripts live, 29 with PR 674), `code_task_success_rate_30d`
0.26, `metrics_in_breach` 22, `open_agent_issues` 77, `transformation_levers_landed_14d` 13.

---

## 7. Adversarial notes: the strongest arguments against this program, and the answer

- **"Opening the control plane to the code loop is the fastest way to break the deploy path."** True if policy is the
  only gate. T1.5 makes the platform the gate (required checks, including the full control-plane suite set, T5.4) before
  CONTROL-PLANE-MANUAL-1 is dropped, and the merge lane's kill switch stays. The current state is not safer: sessions
  with shared credentials merge control-plane PRs by hand today.
- **"Teardown loses function the fleet relies on but nobody declared."** The standing grant's dependency check (binders,
  URL callers, live readers of tables only the worker writes) stops at the first dependent; PR 657's table is the
  template. RETIRED code stays in git. The one irreversible class, data, moves only after verified copies and an R2 dump.
- **"The review gate is about reach, and this program is mostly about plumbing."** Correct, and the order reflects it:
  T7.1 (subscribe boxes) is in W0, and W3's research products are gated on the review gate reading MET. The plumbing
  is what makes the reach work land without a session.
- **"Fewer probes means slower detection."** One probe pass every 20 minutes plus heartbeats on every cron handler is
  more coverage than today's five uncoordinated pollers, at a quarter of the requests; the monitor of monitors is the
  detector the fleet lacks now.
- **"The code loop will spend what sessions spend."** It runs on the ladder (free draft, cheap verify, paid repair) with
  the governor, under the fleet cap, and is attributed; sessions are neither capped nor attributed today.
- **"Refusing control-plane tasks at intake flatters the success rate."** It removes tasks that could not succeed: the
  merge runner refuses them before it opens a pull request. The past refusals stay in the 30-day window, the metric's
  formula is unchanged, and the work is not dropped: the issue keeps its target as a `session-task:` line. The guard
  metrics (`issue_wontfix_share_7d`, `remediation_latest_pass_pct_7d`) are untouched.
- **"A leading W0 exit (T1.16) lets the program declare victory early."** It needs at least 8 finished tasks after the
  engine fixes, and the 30-day metric stays on the scoreboard and in its trigger; a leading exit that later relapses shows
  as the 30-day number not following, which TP-WAVE-EXIT-STALLED-1 already files.
- **Unknowns.** Whether Workers AI latencies (55 to 60 s for large models) allow a code agent to run suites inside the
  container budget; whether GitHub branch protection can be set through the repository token the fleet holds (it may be
  an owner step, recorded if so); whether errata-hub has an external reader (decided by its 30-day rule, not assumed).
