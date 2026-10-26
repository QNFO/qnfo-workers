-- REM-A5-COST-GATE-1 (2026-10-26, charter pillar cost; metrics fleet_cost_bound_month_usd (trigger 10930), workers_ai_cost_30d_usd, monthly_cost_run_rate_usd, external_impact_per_dollar and the research
-- stall metrics publish_rate_ratio_24h, cadence_overdue_over_120m, content_items_over_stage_sla; issues 100622 and 100408 are the owners of the fix, this file records what the read found).
-- MEASURED 2026-10-26 19:11Z against live qnfo-audit, and the code of qnfo-research-exec/worker.js on origin/main:
--   * The research pipeline has been held since 04:32Z. researchBudget (COST-SUSTAIN-1, the hard daily spend gate) logs cloud_ops_events kind research-budget "daily budget exhausted: spent=421096
--     budget=360000 (work resumes at 00:00 UTC)": 160 such events from 04:32Z to 19:11Z. Events of kind done with status ok by qnfo-research-exec: 65, 60, 61, 69 and 40 in the hours 10-26T00 to T04 and none
--     since; the last two hours hold only model-order, repo-sync, research-budget, idea-to-publish and park-rearm-heartbeat rows. Neurons of qnfo-research-exec, errata-hub and qnfo-paper-reviser per day:
--     10-20 3.72M, 10-21 1.80M, 10-22 0.37M, 10-23 0.37M, 10-24 0.38M, 10-25 0.47M, 10-26 0.42M by 19:11Z.
--   * ops_config research_daily_neurons reads 360000 (updated 2026-10-24 14:59:20) while its note says the budget was moved from 360000 to 600000 that day: the move is not in effect, and the budget in
--     force is the code default (RESEARCH_DAILY_NEURONS_DEFAULT = 360000). v_cost_forecast reads the same value, so its bound of 329.21 USD a month (bound_daily_neurons 852612) is already computed at
--     360000 research neurons: research 360000 + q08 150000 + code loop 140 calls x about 1774 neurons + 103000 neurons a day of every other worker, 0.011 USD per 1000 neurons after 10000 free, plus
--     1.70 USD a day of gateway and plan. Staying at or under 300 USD needs about 88000 fewer bounded neurons a day; the three levers are the code loop's 140 calls (raised from 100 on 10-24),
--     q08 (about 178000 neurons a day, 1.25M in 7 days, 178303 neurons per published piece, gate pass 1.2 percent), or the research budget itself, and each one buys less work.
--   * The metrics this explains on the same day: publish_rate_ratio_24h 0.219, research_head_stalled 1 and research_queued_180m 133 (v_stuck_summary), the papers.qnfo.org producer 869 minutes past its due
--     time (cadence_overdue_over_120m), content_items_over_stage_sla in the research-queued stage, idea_to_publish_h_p50_7d, and 160 research-budget holds a day. They clear when the pipeline runs, not by a
--     lever of the cost metrics, and the cost metrics fall only if spend falls: the two pull against each other until the gate steers instead of stopping.
--   * BUDGET-SOFT-ROUTE-1 (owner directive 2026-10-06): AI spend budgets steer model choice and never stop a pipeline. The hard gate is the opposite of that, and control_registry has no row for it (24
--     research-* controls are listed there, none for this gate). The doctrine (CLAUDE.md, DOCTRINE-1) asks that a hold or cap be registered in control_registry with its disposition before it is kept or reviewed.
-- WHAT THIS DOES (a record, no behaviour change): registers the control research-daily-neuron-gate (kind cap, critical path 1, disposition replace, state planned, issue 100622, no alternate path yet: the
-- replacement is the alternate), writes one decision_log row, and appends one note to each of the two open critical issues so the doer reads the measurements. It changes no cap, no config row and no code.
-- THE REPLACEMENT (rem-a1 and the code loop own it; stated so the note is complete): at the daily budget, researchBudget stops answering ok:false and the stage runs on the cheapest model that passes
-- (the leanEnsemble and researchLeanWidth path already used for a breached ai_spend cap), with the budget as the steering target; the quality, review, verify and claim gates are not touched.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM control_registry WHERE control = 'research-daily-neuron-gate' AND evidence LIKE 'REM-A5-COST-GATE-1%'; UPDATE agent_issues SET description = (SELECT b.description FROM bak_20261026_rem_a5_cost_issues b WHERE b.id = agent_issues.id) WHERE id IN (SELECT id FROM bak_20261026_rem_a5_cost_issues)
-- spof-review: adds no cron, D1 trigger, external host or credential; one registry row, one decision row, two notes.

CREATE TABLE IF NOT EXISTS bak_20261026_rem_a5_cost_issues AS SELECT id, description FROM agent_issues WHERE id IN (100408, 100622);

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES ('research-daily-neuron-gate',
  'qnfo-research-exec researchBudget (COST-SUSTAIN-1; RESEARCH_DAILY_NEURONS_DEFAULT 360000; ops_config research_daily_neurons; a stage held at the budget logs cloud_ops_events kind research-budget)',
  'cap',
  'research spend above the daily neuron budget (COST-SUSTAIN-1: fleet cost bound under 300 USD a month all-in, owner 2026-10-21)',
  1, 'replace', 'planned', NULL, NULL,
  'REM-A5-COST-GATE-1 2026-10-26: MEASURED 19:11Z: 160 research-budget holds from 04:32Z (spent 421096 against 360000, work resumes at 00:00 UTC); qnfo-research-exec done ok events 65, 60, 61, 69 and 40 in the hours 10-26T00 to T04 and none since; ops_config research_daily_neurons reads 360000 although its note says it was moved to 600000 on 10-24 (not in effect); v_cost_forecast bound 329.21 USD a month at that value. BUDGET-SOFT-ROUTE-1 (owner 2026-10-06) says a spend budget steers model choice and never stops a pipeline, so the disposition is replace: at the budget the stage runs on the cheapest model that passes, and the review, verify and claim gates stay. Carried by issues 100622 (the gate hard-stops the pipeline) and 100408 (spend to 300 USD all-in).',
  100622);

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26 19:11Z: measured today. The gate is the cause of the stall that is still open: 160 research-budget holds from 04:32Z, spent 421096 against a budget of 360000, qnfo-research-exec done ok events 65, 60, 61, 69 and 40 in the hours 10-26T00 to T04 and none since. ops_config research_daily_neurons reads 360000 (updated 2026-10-24 14:59:20) although its note says it was moved to 600000: that move is not in effect, so the budget in force is the code default. v_cost_forecast already bounds the fleet at 329.21 USD a month at 360000 research neurons, so a larger budget cannot be the way out: the gate has to steer (run on the cheapest model that passes at the budget) and not stop (BUDGET-SOFT-ROUTE-1). control_registry now lists it as research-daily-neuron-gate, disposition replace, planned.'
WHERE id = 100622 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

UPDATE agent_issues SET description = COALESCE(description, '') || char(10) ||
  'REM-A5 2026-10-26 19:11Z: what the 329.21 USD bound is made of (v_cost_forecast, neurons a day): research 360000, q08 150000, code loop 140 calls x about 1774, every other worker about 103000, 0.011 USD per 1000 after 10000 free, plus 1.70 USD a day of gateway and plan. The fleet needs about 88000 bounded neurons a day less to sit at or under 300 USD a month; the levers are the code loop calls (moved from 100 to 140 on 10-24), q08 (about 178000 neurons a day, 1.25M in 7 days, 178303 neurons per published piece, gate pass 1.2 percent) or the research budget, and the research pipeline has been held by its budget since 04:32Z (see issue 100622), so cutting it further buys nothing until the gate steers instead of stopping.'
WHERE id = 100408 AND instr(COALESCE(description, ''), 'REM-A5 2026-10-26') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a5',
  'a hard spend gate that stops a pipeline for most of the day is a control that the doctrine (CLAUDE.md, DOCTRINE-1) wants registered in control_registry with a disposition, and the cost metrics and the research stall metrics share one cause that a record can make visible to the doers',
  'REM-A5-COST-GATE-1: control research-daily-neuron-gate registered (replace, planned, issue 100622) and the measurements appended to issues 100622 and 100408',
  'cloud_ops_events research-budget 160 rows 04:32Z to 19:11Z with spent=421096 budget=360000; kind done ok by qnfo-research-exec 65, 60, 61, 69, 40 in 10-26T00 to T04 and none since; ops_config research_daily_neurons 360000 updated 2026-10-24 14:59:20 with a note that says 600000; v_cost_forecast bound_daily_neurons 852612 and bound_30d_usd 329.21; ai_call_counters research neurons by day; control_registry has no row for the gate',
  'applied by migration', 'one control_registry row, two issue notes and one decision row; no cap, config row or code changes', 'the Rollback line deletes the control row and restores the two descriptions from bak_20261026_rem_a5_cost_issues',
  'the research gate is a registered control with a named replacement and its cost and stall effects are on the issues that carry it', 'none: a record; publish_rate_ratio_24h stays under 0.4 until the gate steers or the budget resets at 00:00Z', 'none',
  'd1:cloud_ops_events, ops_config, v_cost_forecast, ai_call_counters, control_registry; code:qnfo-research-exec researchBudget'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REM-A5-COST-GATE-1:%');
