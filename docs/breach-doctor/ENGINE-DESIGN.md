BREACH DOCTOR (BREACH-DOCTOR-1): ARCHITECTURE FAMILY DESIGN
Measured 2026-10-26 05:45-06:00Z on qnfo-audit and main @ 6031c00e. Companion files in the same directory:
  architecture-map.txt        every existing loop, what it detects/does/cadence, why it misses the 285 unowned issues
  breach-doctor-draft.sql     draft migration (tables, views, switches, metrics, registries, playbooks R0-R4), applied and re-applied on SQLite with fixtures
  trigger-body.txt            the breach_selfheal_tick body (evidence for finding F1)

======================================================================================================================================
0. READ THIS FIRST: THE HEARTBEAT IS DEAD, AND THE DOCTOR MUST NOT RIDE IT
======================================================================================================================================
fleet_tick (the 10-minute heartbeat that fires ~53 D1 AFTER INSERT triggers: queue_sla_tick_10m, deploy_merge_age_tick = the ISSUE-AGE-24H-1 replan, scorecard_v2_tick,
doctrine_*_tick, 40 metric refreshers) last got a row at 2026-10-26T04:32:44Z (id 2523). Since 04:42:44Z every insert fails with "D1_ERROR: out of memory: SQLITE_NOMEM", both the plain
insert and the OR IGNORE retry of FLEET-TICK-ISOLATE-1 (qnfo-code-orchestrator feedFleetTick 3739-3751): 76 cloud_ops_events kind fleet-cron-tick-error by 05:57Z, 85 minutes dark.
The only schema change between the last good tick and the first failure is migrations/2026-10-26-breach-selfheal.sql (applied 04:42:33Z, PR 4263), which adds trigger
breach_selfheal_tick (10 references to view v_breach_selfheal + 6 to v_breach_selfheal_inputs; each v_breach_selfheal macro-expands ~100 correlated subqueries, so the trigger program
is roughly a thousand expansions; its offline test ran on node:sqlite without D1's memory ceiling). The other migration of that window (cf-agents, 04:35:08Z) has no trigger.
Its five new metrics still read NULL, which is consistent with the trigger never having run to completion. Confidence: timing and sole-change evidence are strong; the exact statement
is unproven (read-only session). Consequence for this design: (1) the doctor is worker code on a worker cron, not a D1 trigger; (2) its metrics are written by that code, so a dead
heartbeat cannot hide itself (tick_completion_24h still reads 99.3 from its last refresh at 04:32Z); (3) heartbeat restore is rule R0, a second-path rule.
Immediate fix, no doctor needed: a migration that copies the trigger's sqlite_master row into a bak_ table, DROP TRIGGER IF EXISTS breach_selfheal_tick, and ports its three actions
(errata_confirm_max tuning, dead research claim requeue, five metric refreshes) into doctor playbooks SH-1..SH-3 as worker steps. Probe: SELECT MAX(ts) FROM fleet_tick newer than the apply.

======================================================================================================================================
1. PLACEMENT, CADENCE, BUDGET
======================================================================================================================================
DECISION: engine = a new block "// ---- BREACH-DOCTOR-1:BEGIN/END ----" in qnfo-fleet-control/worker.js (mirror deployed-current.worker.js identical), called from the */10 slot of
scheduledOnce (11014-11053) next to remediationContractsTick (11050): `ctx.waitUntil(breachDoctorTick(env, {budgetMs: bdInt(...)}))`, EVERY 10-minute tick (not behind onTwentyGrid, which
is true at :00/:20/:40 only). Second path = qnfo-cloud-ops jobBreachDoctorWatch added to the per-tick runs list (5496-5504), the RESEARCH-WATCHDOG-1 pattern: it reads the ledger and, when
doctor_tick_age_min > 30, runs only the playbooks flagged second_path=1 (R0 heartbeat restore, doctor-stalled). Read side = qnfo-fleet-dashboard.
Why fleet-control: (a) it has the faster rollback for a component that writes D1: the Actions canary + automatic revert outside the worker (CP_CANARY_WORKERS 5227, canary_revert.py);
qnfo-cloud-ops only has the merge runner's verify-then-revert-PR path (cmRevert 4288), which is slower;
(b) it already hosts every executor the doctor dispatches to or reads (remediationContractsTick, rt* helpers, evaluateMetricTriggers, ghAppEnv for GitHub reads, aiRunAttr 12663 for
attributed model calls, deployDriftCf); (c) the tick hook exists and is the owner-measured 10-minute slot; (d) the code loop may change it (CM_LOOP_CANARIED 3340, CODE-LOOP-CONTROL-PLANE-1).
Why not a new worker: 36 live workers against a charter cap of 30 / target 24; section 8 rule 2 net-zero says a new worker, cron, table family or binding names a same-class retirement,
and "folding beats adding". Why not cloud-ops as primary: slower rollback, and PROBE-REVIEW-1 (cloud-ops, gpt-oss-120b / deepseek-v4-flash) must stay a different worker from the probe author for
independence. Why not a D1 trigger: finding F1, plus D1 refuses agent_issues INSERTs deep in a trigger chain and triggers cannot call a model or GitHub.
NET-ZERO: no new worker, cron or binding. Table family: +3 (breach_diagnoses, breach_diagnosis_events, breach_playbooks); retires breach_selfheal_actions (0 rows) and issue_age_replans (479 rows) as writers.
PER-TICK BUDGET (ops_config, bounded by bdInt(key, default, lo, hi)): breach_doctor_max_cases 12 (1..40), breach_doctor_max_actions 6 (0..20), breach_doctor_max_ai 3 (0..10) and 60 a day,
breach_doctor_budget_ms 20000 (5000..40000; no new case after 85%), about 80 D1 statements (candidate query <= 60k rows read; do NOT read v_issue_age_ladder per tick, it reads 367k rows and
takes 1.2 s), the wall time of one waitUntil job inside an isolate shared with 11 others (remediationContractsTick runs up to 150 contracts x 3-5 statements; check Workers Logs subrequest
counts before raising any cap). Single flight: loop_lock row k='breach-doctor' (the loopLock pattern of qnfo-code-orchestrator 3244), ttl 4 minutes.
Capacity: 12 cases x 6 ticks = 72 diagnoses an hour; the 285 are diagnosed within 4 ticks (40 minutes); actions are grouped by case_key (15 TOOL-FAILURE issues of one tool = one case, one action),
so 6 actions a tick covers the realistic 40-60 distinct causes in about 2 hours.

======================================================================================================================================
2. WHAT THE CODE LOOP MAY DO ALONE (CODE-LOOP-CONTROL-PLANE-1), AND WHAT A SESSION MUST BUILD
======================================================================================================================================
The loop plans and auto-merges (cmScope 3380-3402, mirrored in qnfo-code-orchestrator mergeScopeWhy): <worker>/worker.js with mirror for every worker outside CM_DENY (fleet-control, ops,
deploy-guard, code-orchestrator, ai and gateway are in CM_LOOP_CANARIED and allowed behind canary + revert; cloud-ops and the dashboard are ordinary), docs/**.md, <dir>/README.md,
scripts/*.py|mjs outside CM_SCRIPT_DENY, migrations/*.sql (applies itself only with the APPLY-BY header), mind/**.json|toml. It cannot touch .github/workflows, wrangler.toml (so no cron or
binding), <worker>/*.test.mjs or scripts/*test.mjs / remediation / guard / gate files (so it cannot add or change a test), CLAUDE.md, secrets. One planner task = one anchored edit in one
worker.js (14 k-char snippets, ~200-line editor window): a 700-line engine cannot be authored by it, and any edit that breaks the engine's suite fails CI.
=> PR 1 (a session): migration + engine block + qnfo-fleet-control/breach-doctor.test.mjs (block replayed between the markers, as trigger-parse.test.mjs does) + migrations/breach-doctor.test.mjs
   + cloud-ops watch job + dashboard verb. Because only a session can add tests, PR 1 ships the tests for every action kind.
=> After PR 1 the loop may: edit any single function of the block, add a playbook row by migration (playbook INSERTs must be mode='measure' for 24 h, enforced in code: a row younger than 24 h
   or authored by the loop never acts), fix its own failures (doctor failures file BREACH-DOCTOR-1: issues, which the doctor never diagnoses itself; add the pair
   qnfo-fleet-control|BREACH-DOCTOR-1: to ops_config code_merge_trusted_sources, the single list both the planner (planTrustList 2926) and cmTrusted (3434) read).
=> It may NOT: add an action kind in code and use it in the same PR as a playbook (action kinds are the allowlist; a new one needs a reviewed PR), widen mode from measure to on, change
   bdTaint, add a cron/binding.

======================================================================================================================================
3. THE TICK (what breachDoctorTick does, in order)
======================================================================================================================================
1  mode = bdMode(): ops_config breach_doctor = off | measure | on (tri-state; rtFlagOff reads only "off"). off returns after writing nothing. Take the single-flight lock.
2  Write metrics first (worker code, independent of fleet_tick): fleet_tick_age_min, doctor_tick_age_min, breaches_undiagnosed_over_60m, breaches_auto_remediated_24h,
   doctor_actions_failed_24h, doctor_lease_without_progress, doctor_taint_violations_24h  (metric_registry UPDATE ... last_value, last_refreshed, state='MEASURED').
3  System playbooks (trigger_sql returns issue_id NULL): R0, R3, R4, SH-1..3. A hit first files one issue "BREACH-DOCTOR-1: <rule_id> <subject>" (source qnfo-fleet-control, deduped on open title)
   so a system-level case is still an issue (no silent drop) and gets an issue_id.
4  Select cases, in this order: unconsumed 'requested' events (dashboard Diagnose); live cases due for verification or whose lease ends within 20 minutes; new candidates:
   open agent_issues older than breach_doctor_min_age_h (8) with no doer, ordered by CASE priority critical,high,medium,low then created_at (PRIORITY-QUEUE-1), LIMIT max_cases. The doer test is
   the three-way EXISTS of v_breach_owner, not the ladder.
5  Facts per case, <= 6 reads, structured only: family (from a code table of title prefixes), plan outcome and a reason CODE (regex over plan_reason into an enum: names-no-worker, raw-read-404,
   owner-task, multi-file, data-config, model-other; the text itself is dropped), contract classes/status/module/last_verdict/attempts, code_tasks status/attempts/ids, counts of
   cloud_ops_events by kind and status in a window (never the text column), metric_registry value/target for the title's metric key, deploy_drift_cf state, fleet_heartbeat age.
6  Match: run each enabled playbook's trigger_sql once per tick (literal read-only SELECT, __RT_WRITE_KW guard, LIMIT), intersect with the selected cases. No match: classify by the model ONLY if
   breach_doctor_ai is on and < 3 calls this tick: prompt = the facts JSON + the closed enum list, reply must be {"cause_class": "<one of the list>"}; anything else = unclassified.
   Unclassified after 2 attempts: file ONE "BREACH-DOCTOR-1: playbook gap <family>" issue per family per 24 h to the code loop (roster gaps are items, doctrine section 4). Never to the owner.
7  Act (mode on and the action kind in breach_doctor_classes_on): ladder gate (section 7), caps, live-claim check (work_claims for issue:<id> or the file), take no claim of its own except
   for the duration of a code-task enqueue. Execute the allowlisted action from code, store revert_sql, create the verification contract doctor-<diagnosis id> (module breach-doctor-1, probe built by
   the rule's verify_template), set state, lease_until = now + min(120, 3 x cadence) minutes, write decision_log (real columns) and a breach_diagnosis_events row.
   In measure mode: write the diagnosis and event 'would-do' detail, nothing else.
8  Verify: for cases in applied/verifying read their contract; two consecutive passes (the AUTOCLOSE-HYSTERESIS-1 shape) = verified: the issue closes through the existing autoclose path with
   close_evidence naming "breach_diagnoses #id rule R? observed=..."; siblings sharing the case_key close the same way on their own contracts. A failed action = state failed, error_code (enum),
   attempts+1; the next playbook step (e.g. sql-fix failed -> code-task-issue) runs on the next tick; after 3 failures a BREACH-DOCTOR-1: self-issue goes to the code loop.
9  Write the 'tick' event (counts, ms used, ai calls) and release the lock.

TAINT RULE (the PLAN_TRUSTED-safe design). The doctor never copies a string out of agent_issues.description/title, cloud_ops_events.text/meta, worker_logs.exceptions_json, tool_error*, plan_reason
or any other free-text column into an issue, a probe, a code task or a prompt. Everything it writes is (a) a playbook constant, (b) a number, (c) an enum code produced by a regex over the source text, or
(d) an identifier that exists in an allowlisted registry (worker in service_registry AND deploy_drift_cf.dir, table/column in sqlite_master, metric key in metric_registry, contract class,
event kind, function name found verbatim in the file read from main). bdTaint() rejects any other string and writes a taint-drop event (metric doctor_taint_violations_24h, target 0).
Consequence: trust attaches to the authoring pipeline (source qnfo-fleet-control, title prefix BREACH-DOCTOR-1:), not to the text of the origin issue, so PLAN_TRUSTED stays exactly as it is
and an untrusted TOOL-FAILURE body can never become an instruction. The model sees only facts JSON and an enum; its reply is validated against the enum and discarded otherwise.
Action allowlist: restore-contract, requeue, supersede-contract, rearm-plan, ops-knob, quarantine-trigger, author-probe, code-task-issue, owner-card, close-on-probe. The SQL of each is a constant in code,
parameterised with ids that passed bdTaint; playbook rows name a kind and parameters, never SQL to run. A model never writes SQL that runs, except author-probe, whose output must pass the
static check of rtProbeAuthorValidSql (11877), a dry run that does not already pass, and PROBE-REVIEW-1 afterwards.

======================================================================================================================================
4. LEDGER (full DDL in breach-doctor-draft.sql, verified on SQLite)
======================================================================================================================================
breach_diagnoses(id PK, issue_id, case_key, family, rule_id, rule_version, cause_class CHECK enum, facts_json, evidence_hash, confidence, model, action_kind CHECK enum, action_ref, revert_sql,
  state CHECK (diagnosed,queued,applied,verifying,verified,failed,reverted,handed-owner,superseded), verify_class, mode CHECK (measure,on), attempts, error_code, opened_at, diagnosed_at,
  applied_at, verified_at, last_progress_at, lease_until, tick_id)
  indexes: UNIQUE uq_breach_diag_live (issue_id) WHERE state NOT IN (verified,superseded,reverted,failed)  -- one live case per issue
           idx_breach_diag_state_lease (state, lease_until)  -- lease sweeps and metrics
           idx_breach_diag_case (case_key, state)            -- one action, many issues
           idx_breach_diag_issue (issue_id, opened_at)       -- the Diagnose panel history
           idx_breach_diag_rule_ts (rule_id, state, last_progress_at)  -- per-rule daily caps
breach_diagnosis_events(id, ts, issue_id, diagnosis_id, event CHECK enum, from_state, to_state, detail <= 500 chars of constants/ids/counts, tick_id)  -- append-only, indexes (issue_id, ts), (event, ts)
breach_playbooks(rule_id PK, version, family, cause_class, trigger_sql, action_template JSON, verify_template, min_ladder, max_per_tick, max_per_day, second_path, enabled, mode, note)
views: v_breach_diagnosis_current (latest row per issue), v_breach_owner (the real-owner definition), v_breach_doctor_status (one row for the dashboard and the watch job).
The cause_class and action_kind CHECK enums are the closed vocabularies; adding a value needs a migration, which only a reviewed PR can ship because the action code must exist first.

======================================================================================================================================
5. WHAT A REAL OWNER IS (the doer problem)
======================================================================================================================================
v_issue_age_ladder.doer today = code-task line | live code task | live work claim. It ignores contracts, loops and the probe author, and it also over-counts: a "live code task" stays a doer
when it is stuck. A real owner is an ACTOR WITH A LEASE AND A MEASURABLE NEXT TRANSITION. v_breach_owner.owner_kind =
  'code-task line' | 'live code task' | 'live work claim'            (unchanged; add freshness: a code task untouched for 120 minutes is a case of cause_class stale-contract/code-task-stalled, not an owner)
  'breach doctor'   a breach_diagnoses row with mode on, state queued/applied/verifying, action_ref set, action_kind <> none, lease_until in the future AND last_progress_at within 120 minutes
  'owner card (identity-bound)'   state handed-owner with an OPEN human_actions card whose why contains the line "IDENTITY-BOUND:" (HUMAN-ITEMS-AUTOMATIC-1)
  NULL otherwise.
Anti-gaming: a lease is renewed only by a progress event (state change, a verification row, a merged/deployed task); renewal without progress expires after one extension; `diagnosed` alone is never an
owner; measure-mode rows never count; guard metric doctor_lease_without_progress (target 0). The owner-bound count is reported apart so it cannot hide inside the fleet's own number.
ROLLOUT: Phase A (the draft) creates v_breach_owner only. Phase B (after >= 48 measure-mode diagnoses and doctor_taint_violations_24h = 0) replaces v_issue_age_ladder, same columns, doer
taking the two extra branches, with the old text in a bak_ table and in the Rollback line; issues_over_24h_no_code_doer keeps the strict count. Both consumers (deploy_merge_age_tick,
issues_over_24h_no_doer) pick it up with no flip-flop because they read the view.

======================================================================================================================================
6. METRICS, SWITCHES, REGISTRIES, LOGS
======================================================================================================================================
Metrics (metric_registry rows in the draft; refreshed by the doctor tick, each with an analytics_metric_triggers row and, where the lever is one file, code-task/code-anchor lines, inserted by PR 1
because the anchor `async function breachDoctorTick(env, opts) {` exists only then):
  breaches_undiagnosed_over_60m  target 0   trigger gt 0   open, no doer, older than min_age_h+1 h, no diagnosis with diagnosed_at set
  breaches_auto_remediated_24h   target >= 12 (1.5 x the 8 unowned issues opened a day, ISSUE-THROUGHPUT-1)   trigger lt 12   rows reaching verified in 24 h
  doctor_actions_failed_24h      target 0   trigger gt 0   failed or reverted
  guards: doctor_lease_without_progress 0, doctor_taint_violations_24h 0, doctor_tick_age_min <= 15 (trigger gt 30), fleet_tick_age_min <= 15 (trigger gt 25)
ops_config: breach_doctor on|measure|off (default measure; promoted to on by PR 1's first apply once the shadow gate passes), breach_doctor_ai on|off, breach_doctor_max_cases/_max_actions/_max_ai/
  _budget_ms, breach_doctor_min_age_h, breach_doctor_rules_off (comma list), breach_doctor_classes_on (action kinds allowed to act; quarantine-trigger and ops-knob start measure until 3 verified).
  Day one `on` for the reversible, already-practised classes (restore-contract, requeue, supersede-contract, rearm-plan, author-probe, code-task-issue, owner-card): they are the actions
  RED-DRAIN-1 and rtEnsureLivePath already take.
control_registry (draft): breach-doctor-switch (kill-switch, keep, alternate = watch job + per-rule stop + revert_sql), breach-doctor-caps (cap, demote: backpressure not a stop), breach-doctor-taint-guard
  (guard, keep: doctrine section 9), breach-doctor-action-allowlist (gate, keep). spof_registry (draft): the tick, alternate = cloud-ops watch, drilled daily like remediation:evidence:B.
belief_registry (draft): belief-doctor-structured-facts-suffice (probe: share of rule-confidence cases reaching verified >= 0.6) and belief-fleet-tick-isolated (falsified today).
failure_modes + fm- detectors (draft): fleet-tick-fanout-no-bulkhead (fm-fleet-tick-fresh), breach-doctor-stalled (fm-breach-doctor-stalled).
decision_log: one row per applied action with the real columns (actor 'qnfo-fleet-control:breach-doctor', assumption = cause_class + evidence_hash, action = rule_id + kind, evidence = facts summary
  (taint-checked), outcome, blast_radius = tables touched, rollback_path = revert_sql, capability_gain = "fleet resolves <cause_class> without a session", predicted_outcome = the probe's expected
  value, surfaces_tested = tables) and outcome_matched set when the case verifies or fails (feeds prediction_miss_rate_7d).
capability_ledger: first verified case of a cause_class writes capability 'doctor:<cause_class>' (provenance = diagnosis id, reliability from 30-day outcomes).
Trust: add surface 'breach-doctor:remediate' to v_trust_ledger (ok = verified, fail = failed + reverted, 30 days), score (ok+5)/(ok+fail+10): day one 0.5 = 'delegated'; 3 verified with no failure =
  0.62 'autonomous'. Each playbook carries min_ladder (reversible SQL classes 'delegated', quarantine-trigger and ops-knob 'autonomous'); falling under 'assisted' (0.5) puts the action class back
  in measure and writes trust_transitions. Trust widens the doctor's own fleet-loop scope only, through this canonical path (kernel reading n/o/p).
Model use and spend: aiRunAttr(env, "qnfo-fleet-control", "breach-doctor", model, ...) (ai_call_counters attribution); primary @cf/zai-org/glm-5.3-flash (the planner's cheap model); at a breached
  ai_spend cap the same model with max_ai 1 (BUDGET-SOFT-ROUTE-1: steer, never stop). Independence: probes the doctor authors are judged by PROBE-REVIEW-1 (cloud-ops, disjoint families); that job must not
  exclude module breach-doctor-1 or the doctor repeats finding F4.

======================================================================================================================================
7. DASHBOARD DIAGNOSE (qnfo-fleet-dashboard) READS THE LEDGER
======================================================================================================================================
Today the Diagnose buttons (worker.js 7587 and 7863) only fill the Ask box with a question (data-fleet-fill) that goes to a model and times out (issue 100360). Replace with data-diagnose="<issue id>":
  GET /api/diagnose?issue=<id>  (open read, OPEN-ACCESS-1: structured facts only, no description text)
     { issue:{id,title,priority,age_h,family}, owner_kind (from v_breach_owner), plan:{outcome, reason_code}, diagnosis:{rule_id, cause_class, confidence, facts:{...}, opened_at},
       action:{kind, ref, state, applied_at, revertable}, verify:{class, last_verdict, last_attempt_at, passes}, history:[<=20 breach_diagnosis_events], next_check_at }
  GET /api/breaches?state=&family=&limit=  -> v_breach_doctor_status + the top unowned rows from v_breach_diagnosis_current
  POST /api/cmd {op:"diagnose", target:<id|#id|slug|title keyword>}  (owner session, deterministic verb, no model, per issue 100360 item 1 and 4): prints the panel; if the newest diagnosis is
     older than 60 minutes or absent it inserts breach_diagnosis_events(event 'requested', issue_id) which the next doctor tick selects first (<= 10 minutes).
  POST /api/cmd {op:"revert", target:<diagnosis id>}  (owner session): re-validates revert_sql against the allowed statement shapes (UPDATE remediation_contracts / ops_config / issue_plans;
     CREATE TRIGGER restored from the quarantine copy), executes it, writes event 'revert', state reverted.
  The metric-area Diagnose button (a metric, not an issue) resolves the open "METRIC-TRIGGER-<id>-<KEY>:" issue for that metric and opens its panel.
No new auth surface, no cross-worker call: the dashboard only reads the ledger and writes a request row.

======================================================================================================================================
8. RULES (trigger / diagnosis / action / safety / verification / expected clears / owner-only). Live counts from read-only runs of each trigger_sql at 05:55Z.
======================================================================================================================================
R0 HEARTBEAT-RESTORE (second_path=1; mode measure until 3 verified)
  trigger   draft playbook R0: MAX(fleet_tick.ts) older than 30 minutes AND >= 3 fleet-cron-tick-error events in 30 minutes.  LIVE: hit (28 errors in 30 minutes, error_code d1-nomem).
  diagnosis cause_class heartbeat-insert-failing; facts: last_tick, errors_30m, error_code in {d1-nomem, d1-unique, d1-trigger-depth, other}, suspect trigger names = triggers on fleet_tick named by a
            migration file applied after the last good tick (migration_runs joined to the file on main, regex over CREATE TRIGGER ... ON fleet_tick; today: breach_selfheal_tick only).
  action    quarantine-trigger: store the trigger's sqlite_master.sql in revert_sql and in a bak_ row, DROP TRIGGER <name>. Max 1 per 30 minutes, newest suspect first.
  safety    only a trigger a migration created after the last good tick; never a trigger created before it; never when no suspect exists (then file BREACH-DOCTOR-1: with the error_code for the code loop);
            ladder 'autonomous'; reversible by re-running revert_sql; record in control_registry/failure_modes.
  verify    probe tick-newer-than: MAX(fleet_tick.ts) > the quarantine time (reads 'pending: no fleet_tick since quarantine' until the next */10 insert), two passes.
  clears    0 issues directly; restores the 53-trigger fan-out (ISSUE-AGE replans 12/tick, queue_sla fixes, 40 metric refreshes, scorecard). Highest value rule in the family.
  owner     none.
R1 PLANNER-NAME-RESOLUTION
  trigger   open issues whose issue_plans.path = 'qnfo-workers/worker.js' and outcome not-code.  LIVE: 7 (2805, 100524, 100579, 100582, 100594, 100596, 1000015; 2 critical).
  diagnosis cause_class planner-name-resolution; facts: plan_outcome, reason_code raw-read-404, path. Cause: service_registry lists the repository 'qnfo-workers' as a live worker; planWorkers (2968)
            takes the first name found in the text ("repo=qnfo-workers"); planIssues builds names at 3169-3171 with a pattern check and PLAN_DENY_WORKERS only.
  action    code-task-issue, one for the case_key (title "BREACH-DOCTOR-1: R1 planner"; lines: code-task: repo=qnfo-workers path=qnfo-code-orchestrator/worker.js; code-anchor: the line at 3170,
            `.map(function (r) { return String(r.service || ""); }).filter(function (n) { return /^[a-z0-9][a-z0-9-]{1,60}$/.test(n) && PLAN_DENY_WORKERS.indexOf(n) < 0; });`, count on main = 1, verified by the
            doctor by reading the file from main before filing; edit sentence = constant: keep only names that are a worker directory in deploy_drift_cf). Then rearm-plan for every issue of the case_key
            once the task is deployed (UPDATE issue_plans SET planned_at = '2000-01-01T00:00:00Z' WHERE issue_id IN (...); revert = old planned_at stored).
  safety    anchor uniqueness; path in cmScope; no live claim on file:qnfo-code-orchestrator/worker.js (work_claims); one task per case_key; at most 2 a day.
  verify    task-merged-deployed (code_tasks.deployed_at set) then row-count-zero: re-planned rows with path 'qnfo-workers/worker.js' = 0.
  clears    7 get a correct plan; expect 2-3 to become code tasks, the rest re-enter as owner-task cases.   owner: none.
R2 PROBE-LANE-CONFLICT (second_path=1)
  trigger   PROBE-NEEDED-1 issues whose own contract (module reopen-live-path) is status probe-review-refused.  LIVE: 17 (5 of them with a target that is already closed).
  diagnosis cause_class probe-lane-conflict; facts: contract, module, status, target id. Cause: PROBE_REVIEW_SELECT (cloud-ops 3816-3824) excludes probe-template*, orphan-issue-guard-1, METRIC-TRIGGER-,
            failure-mode, fm-, belief- but not reopen-live-path, so the probe that rtLivePathProbe writes is judged self-confirming and parked where neither executor reads it.
  action    restore-contract (UPDATE remediation_contracts SET status='active', last_verdict=NULL, next_due_at=datetime('now') WHERE class=? AND status='probe-review-refused'; revert = status
            probe-review-refused), then code-task-issue for qnfo-cloud-ops/worker.js (code-anchor: the line at 3818 `"AND COALESCE(c.module, '') NOT LIKE 'probe-template%' AND COALESCE(c.module, '') <> 'orphan-issue-guard-1' AND a.title NOT LIKE 'METRIC-TRIGGER-%' " +`,
            count 1; edit = add AND COALESCE(c.module, '') <> 'reopen-live-path').  Until the task deploys, PROBE-REVIEW-1 would refuse again within a tick: the case verifies only after the deploy.
  safety    only module reopen-live-path on an open PROBE-NEEDED-1 issue; max 6 restores a tick; claim check on file:qnfo-cloud-ops/worker.js.
  verify    contract-verdict-pass: refused reopen-live-path contracts = 0 two ticks in a row; the 5 closed-target issues close through autoclose within ~30 minutes.
  clears    5 immediately, 12 return to their intended state (active, deferred while the target is open), recurrence removed.   owner: none.
R3 PROBE-AUTHOR-REVIVAL
  trigger   >= 3 remediation.probe-needed-filed events in 24 h and no remediation.probe-authored event in 72 h.  LIVE: hit (77 filed in 7 days, 0 authored ever).
  diagnosis cause_class probe-author-dead; three defects: the call site 11539 `await rtEnsureLivePath(db, out);` passes no env; 11906 reads env["qnfo-ai"] || env.qnfo_ai (the bindings are env.AI and
            env.SVC_QNFO_AI); 11939 INSERT INTO decision_log (ts, decision, reason) uses columns the table does not have.
  action    code-task-issue on qnfo-fleet-control/worker.js (anchor `await rtEnsureLivePath(db, out);`, count 1): pass env; call aiRunAttr(env, "qnfo-fleet-control", "probe-author", RT_PROBE_AUTHOR_MODEL, ...)
            with env.AI; write decision_log with its real columns; make RT_LIVEPATH_MAX_PER_DAY an ops_config bound (default 12, doctor may raise to 48 under the ladder).
  safety    existing static check + dry run + not-vacuous + PROBE-REVIEW-1; the model prompt must not carry the orphan's title (taint rule): facts only.
  verify    task-merged-deployed, then an event remediation.probe-authored newer than the deploy.
  clears    PROBE-NEEDED-1: 43 unowned rows (53 open). At 12 a day and a 60% survival through PROBE-REVIEW-1, about 25 within 3 days; with the cap at 48 about 25 within 24 hours.
  owner     none.
R4 REPLAN-NO-EFFECT
  trigger   >= 50 issue_age_replans in 7 days and a queued share < 5%.  LIVE: hit (479 re-arms of 132 issues, 1 queued, 466 still not-code).
  diagnosis cause_class replan-no-effect: the re-plan re-asks a prompt (PLAN_SYS 3122) whose only positive answer is a one-file code edit, so a not-code verdict is re-rolled, not re-decided; it spends
            the 48-a-day planner cap (71 model calls in 24 h, 0 queued) that fresh trusted issues need.
  action    ops-knob issue_age_replan = off (existing ISSUE-AGE-24H-1 switch; revert = on), and rearm-plan only when an input changed (file blob sha of the planned worker, or a new facts hash);
            control_registry disposition 'replace' by the doctor classification.  Starts measure.
  verify    row-count-zero of re-arms in the following 24 h and planner capacity: model calls spent on previously not-code issues = 0.
  clears    0 issues directly; frees roughly half of the planner's daily calls.   owner: none.
R5 UNTRUSTED-STRUCTURED LANE (the mechanism every family rule plugs into)
  trigger   plan_outcome untrusted or not-code and doer NULL, family in the structured-provenance set (PROBE-NEEDED-1, CODE-MERGE-REFUSED-1, CODE-LOOP-EXHAUSTED-1, TOOL-FAILURE, SELF-AUDIT-TOOLERR,
            CHAOS-DRILL-FAILED-1, FLEET-JOURNEY-FAILED-1, PAPER-LEARN-1, PORTFOLIO-GAP, METRIC-*).  LIVE: 125 untrusted + 124 not-code rows.
  diagnosis by the family's playbook (other families' rules); cause_class unclassified goes to the playbook-gap issue, not to the owner.
  action    the playbook's allowlisted action; when the lever is one file: code-task-issue under qnfo-fleet-control|BREACH-DOCTOR-1:, anchor read from main, never copied text.
  clears    capacity: all 285 diagnosed in 40 minutes; actions grouped by case_key.  This rule has no count of its own.
R6 OWNER-BOUND ROUTING (the only thing that stays with the owner)
  trigger   issue category in the planner's deny list (security|governance|outreach|legal|finance|identity) or a hard marker of default_approve_markers (money, legal/signing, owner accounts, credentials,
            mailbox, destroying data, one-time codes, privacy, consent) in the STRUCTURED fields (category, family), never in prose.  LIVE: 3 by category (2 security, 1 governance) + about 5 owner approvals
            (UIA-SOURCE-FIDELITY-1 authorise-the-seven-fixes 100577/100580, 100488) = about 8 of 285.
  action    owner-card: a human_actions row whose why carries a line "IDENTITY-BOUND: <enum reason>" (the AUTONOMY-FIRST-REROUTE-1 gate keeps only cards that carry it), default in effect, and a closing probe
            that resolves when the card resolves (the OWNER-STEPS-WATCH-1 shape).  state handed-owner, owner_kind 'owner card (identity-bound)'.
  verify    SELECT status FROM human_actions card resolved.   Everything else stays with the fleet: a technical, credential-lookup, operational or code blocker is never the owner's.
R7 STALE-OWNER (lease expiry)
  trigger   a case in queued/applied/verifying whose lease_until passed.  LIVE: 0 (no doctor yet).  action: next step of the playbook (different executor), or a BREACH-DOCTOR-1: self-issue after 3 failures.
SH-1..SH-3 (BREACH-SELFHEAL-1 ported): errata_confirm_max tuning, dead research claim requeue, five metric refreshes, as worker steps with the same thresholds; v_breach_selfheal* kept as inputs.

======================================================================================================================================
9. HONEST LIMITS OF THE DESIGN (what it does not clear)
======================================================================================================================================
- Open-ended investigation/audit owner tasks. 54 unowned issues come from qnfo-fleet-dashboard:owner-request (37 not-code, 17 no verdict), 15 from owner-chat. They are text the owner wrote
  ("Investigate...", "Audit...", "Prepare a draft...") and have no executor class in the roster: the planner can only edit one worker.js, the doctor's lane is structured facts and allowlisted actions,
  qnfo-agents' write scope is owner-code gated (README "Who may do what") and "never writes a code task under its own name". Phase 3, a roster-gap item: an investigator executor
  (a cloud-ops job: read-only SQL + repo reads through qnfo-agents READ scope, caller allowlist change in qnfo-agents) whose output is a stored report plus proposals that pass bdTaint, the anchor check and an
  independent model review before they are filed under BREACH-DOCTOR-1:, never under owner-request provenance.  Until then these stay unowned by design; the design does not pretend otherwise.
- Rules R1-R4 clear about 35-40 of 285 directly; the other families depend on their own playbooks (other analyses).  The engine's job is that none of them needs a session to be diagnosed.
- Model-authored probes (R3) can be judged self-confirming; the survival rate is a guess (60%) and is measured by belief-doctor-structured-facts-suffice and probe_review_refused_share_7d.
- No count here comes from running an action: the session is read-only; every LIVE figure is a read-only SELECT of the rule's own trigger_sql.

======================================================================================================================================
10. ROLLOUT (reversible at every step; none waits for the owner)
======================================================================================================================================
0  Now (a session, minutes): migration dropping breach_selfheal_tick with BACKUP, ports SH-1..SH-3 later. Probe: fleet_tick newer than the apply. Then re-run the dead-tick metrics.
1  PR 1 (a session): migration (draft) + engine + tests + cloud-ops watch + metric triggers + trust surface + the trusted pair for BREACH-DOCTOR-1:. breach_doctor = measure for the first 6 ticks,
   then classes_on takes over (reversible classes act from the first on-tick; quarantine-trigger/ops-knob wait for 3 verified).
2  Code loop (by the doctor's own issues): R1, R2, R3 code tasks; the loop maintains the block.
3  Phase B (second migration): v_issue_age_ladder takes v_breach_owner.
4  Phase 3: investigator executor.
Record: decision_log row per phase with capability_gain, control_registry/spof_registry rows from the draft, one session_records row at closeout.
