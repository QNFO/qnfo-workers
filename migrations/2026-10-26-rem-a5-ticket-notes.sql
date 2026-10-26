-- REM-A5-TICKET-NOTES-1 (2026-10-26, charter pillar autonomy; session rem-a5, the METRIC-TRIGGER cluster). Follow-up to REM-A5-METRIC-TRIGGERS-1 (PR 4828): the notes on the thirteen tickets whose
-- metric is a roll-up, a window or a structural floor that the read measured, so the doer who opens the ticket reads the composition and the dated expectation and not only the trigger text.
-- Every figure was read from live qnfo-audit, origin/main or GitHub on 2026-10-26 between 18:40Z and 19:30Z (each note names its source and time). The notes change no cap, target, probe or contract,
-- carry no probe or code-task marker line, and use none of the phrases that v_blocker_claims counts or that the code orchestrator refuses (the suite checks both). 99923 records the worker retirement
-- and the ranked candidates; the others record what is a window, what is fixed, and what is another cluster's lever.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET description = (SELECT b.description FROM bak_20261026_rem_a5_notes b WHERE b.id = agent_issues.id) WHERE id IN (SELECT id FROM bak_20261026_rem_a5_notes)
-- spof-review: adds no cron, D1 trigger, external host or credential; thirteen issue notes and one wording correction on 99909.

CREATE TABLE IF NOT EXISTS bak_20261026_rem_a5_notes AS SELECT id, description FROM agent_issues WHERE id IN (2447, 2522, 2971, 99906, 99909, 99923, 99933, 99935, 99938, 99943, 99950, 100226, 100464, 1000155);

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26 19:30Z: qnfo-artifacts is retired (marker and probe binding in PR 4800, cf-ops-actions unbind-service run 40383849057 and delete-worker run 40384144124, registry half PR 4833): worker_count reads 36 until the next hourly census (35 expected). Not retirable now: qnfo-workers (the Workers Builds git trigger recreates that stub on every push that is not skip-ci, issue 1000156; removing the trigger changes the owner Cloudflare integration) and voice-stt (no repository directory, a bearer token held by the owner, clients unknown). Candidates from a read-only investigation, not re-checked here: fold qnfo-evolve into qnfo-cloud-ops and qnfo-model-eval into qnfo-ai-calibration with scripts/fold_worker.py (both are D1-only loops). Eight scripts created since 2026-10-17 (github-steward, evolve, model-eval, artifacts, voice-stt, q08-mind, qnfo-workers, qnfo-agents) account for the growth. Each retirement needs its own fleet-graph impact check.'
WHERE id = 99923 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26 19:00Z: the 30-day run rate is workers_ai 660.09 + owner_gateway 321.89 (the owner''s own desktop clients on the gateway) + direct_providers_external 450 (owner-stated, unverified) + ai_gateway deepseek 29.86 + plan 5 = 1466.84 (v_cost_run_rate). 777 of it (owner clients, direct providers, plan) is outside any fleet change, so the 650 target cannot be met while that floor stands. The Workers AI part is a 7-day window that still holds the 10-19 to 10-21 burst (5.45M, 4.22M and 2.13M neurons; 0.67M to 1.13M a day since) and falls to about 300 by 10-29 at the present burn (decision REM-A5-COST-WINDOW-1). No target or cap was changed.'
WHERE id = 99938 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

-- Correction to the note PR 4828 put on 99909: the nine closed rows are code-loop tasks closed with a session or by-PR note (the watchmaker query reads merge_note and last_error), not rows closed by a person.
UPDATE agent_issues SET description = replace(description, 'closed by a person 9', 'closed with a session or by-PR note 9')
WHERE id = 99909 AND instr(COALESCE(description, ''), 'closed by a person 9') > 0;

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26 19:20Z: workers_ai_cost_30d_usd sums 30 days of neurons (27.56M at 17:01Z). The 10-18 to 10-21 burst alone is 16.45M neurons, about 180 USD, so the 95 threshold cannot be met before about 11-17 even at zero spend; at the present 0.7M to 1.1M neurons a day the 30-day figure settles between 230 and 360 USD. Spend is also held by the research daily budget since 04:32Z (control research-daily-neuron-gate, issue 100622). No target or cap was changed.'
WHERE id = 100226 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26 19:20Z: v_cost_forecast bounds the fleet at 329.21 USD a month at research_daily_neurons 360000: ops_config reads 360000 (the move to 600000 in its note is not in effect). Parts, neurons a day: research 360000, q08 150000, code loop 140 calls x about 1774, every other worker about 103000. Reaching 300 USD needs about 88000 fewer bounded neurons a day; the levers are the code loop calls (140), q08 or the research budget, and the research pipeline is held by its budget since 04:32Z. Nothing was changed (decision REM-A5-COST-GATE-1, issues 100622 and 100408).'
WHERE id = 1000155 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26 19:20Z: 46737 neurons a publication over 7 days against 20000. The window holds the 10-19 to 10-21 burst, and the research pipeline has run no stage since about 04:32Z (daily budget hold, issue 100622), so the ratio does not fall while that hold stands. The lever the trigger carries is REVISE-NOOP-BOUND-1 (task ct_rvnp3b02c956c0, queued).'
WHERE id = 100464 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26 18:42Z: 169 open issues had no remediation_verifications row in 60 minutes (v_stuck_summary). 67 METRIC-TRIGGER and 22 METRIC-REGRESSION or METRIC-FIX-RELAPSED tickets are parked as monitoring, which neither prober reads by design (TRIGGER-RECOVERY-1 closes them); 35 of the 67 also hold an active deferred BACKFILL-1 contract. They count as unprobed while the metric evaluator is their closing owner. A definition that counts a monitoring ticket as probed while its metric is fresh would remove 89 from the count; v_stuck_summary is redefined by many migrations and its suites replay them, so that change is left to the probe-family owners.'
WHERE id = 2522 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26 19:00Z: stuck_items_over_sla is research_review_error + research_head_stalled + research_queued_180m + intents_pending + outreach_waiting + code_tasks_stalled + issues_without_doer_3h (trigger queue_sla_tick_10m): 0 + 1 + 133 + 0 + 0 + 0 + 61 = 195. The 133 research-queued rows are held by the research daily budget since 04:32Z (issue 100622); the 61 are the issue backlog.'
WHERE id = 2971 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26 19:00Z: sla_breaches_over_120m is the sum of five distinct item sets (v_sla_over_120m): issues_open_over_120m 290 + content_items_over_sla 1034 + code_tasks_queued_over_120m 2 + cadence_overdue_over_120m 3 + research_head_stalled 1 = 1330 (2799 at 17:55Z). No item is counted twice. It falls with the issue backlog and with the research-queued, errata and revision stages, which are other clusters'' loops.'
WHERE id = 99950 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26 19:25Z: mttr_h_7d is the mean hours from creation to close of the issues closed in the last 7 days (46.3 at 17:55Z, 47.8 at 19:21Z, against 2). Closing old issues raises it: the oldest open issue is 35163 minutes old (v_sla_over_120m, 19:00Z), so while the backlog drains it rises, and it falls only after the old issues are gone and new ones close inside 120 minutes. Its lever is the backlog family, not a change here.'
WHERE id = 99935 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26 19:25Z: what the reads named (cloud_ops_events kind drift-total-detail, one row for each non-zero read): 2026-10-26 19:01Z repo_live idea-hub:DRIFT, 17:01Z repo_live qnfo-fleet-control:DRIFT, 2026-10-25 06:00Z unregistered qnfo-workers, 2026-10-21 16:00Z to 18:00Z repo_live personal-companion:DRIFT. A repo_live read is a worker whose main version or sha differs from live at the hourly read, which is a deploy still in flight when merges land every few minutes. Code task ct_im99906 is in flight for this ticket.'
WHERE id = 99906 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26 19:25Z: the metric SQL (trigger tick_driver_roster_tick) already leaves out the worker: placeholders, so 178 to 179 are named capabilities with exactly one healthy executor. The ratchet of 157 was set on 2026-10-18; each new worker with a capability list adds its capabilities. A reduction needs a second executor for a capability or fewer single-worker capabilities; nothing is changed here.'
WHERE id = 2447 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26 19:25Z: spofs_total counts every row of spof_registry, tested alternate or not: 15 (CRON-WATCH-1 runner, GitHub Actions deploy row, GitHub Actions CI and migration and probe row, GitHub token, canonical deploy path, breach doctor tick, code_tasks ctx guard, cron execution, ensemble-catchup, fleet-graph build, personal calendar input, qnfo-agents cron, qnfo-evolve cron, research-exec single executor, research publication validation). A row with a tested alternate stays counted, so 0 is reachable only by removing a single point itself. alternate_tested_at is empty for five: the CI and migration and probe row (no alternate), fleet-graph build, qnfo-agents cron, qnfo-evolve cron and research publication validation.'
WHERE id = 99933 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26 19:25Z: the trigger threshold 120 predates ops_config research_deferred_max 400 (set 2026-10-24 14:26Z by the ops session, whose note says the pool is a park and not a loss). The pool read 267 on 10-19, 249 at 17:55Z and 171 at 18:57Z, falling as parked rows re-arm. Not changed here: moving the threshold to the cap would turn a breach green without moving the pool; the ticket closes when the pool is at or under 120 at the evaluator''s read.'
WHERE id = 99943 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;
