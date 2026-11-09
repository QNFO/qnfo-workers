-- AI-WASTE-GOVERNOR-1 (2026-11-09, charter pillar cost, owner directive: "Anything that's wasted and doesn't go into published output or deployed code is a waste ... make it automated and built into everything").
-- WHAT WAS MEASURED (qnfo-audit, read 2026-11-09, 7-day window):
--   * Workers AI neurons spent on calls that errored: about 5.3 USD a week (research-exec revise 104k neurons, ensemble 86k, review 49k, reconcile 44k, complete 40k). qnfo-research-exec revise on glm-5.3-flash errored 128 of 520 calls
--     over 3 days (2026-11-03..06); each error paid for the call and then for the gpt-oss-120b retry.
--   * 6 purposes with 100+ calls and zero recorded tokens and neurons (chat-dynamic, factcheck, triage, goal-review ...): their spend and output cannot be attributed.
--   * Research output: 37 papers published in 7 days (5.3 a day) against 71 to 89 a day on 2026-10-19..21; research-exec spend is held near 300k neurons a day since the 2026-11-04 tick allowance, so output now equals
--     budget divided by neurons per published paper; raising the cap buys more recycling, cutting waste buys papers.
--   * 5 research_queue rows hold 97 terminal re-arms (one row 26 cycles) while not published.
--   * The code loop is NOT waste: 18 to 45 merged PRs a day at 0.06 to 0.36 USD each (v_cost_per_task_class). It is left alone.
-- WHAT THIS ADDS: two read views and four 10-minute metrics, each with a qnfo-fleet-control trigger that files a doer issue. No spend, no gate changes, no hold.
-- Targets are initial, set from the 2026-11-09 baseline, and move by migration with evidence (RULE-8-RETIRED-1).
-- PREDICTION: the four metrics read 5.33 / 6 / 5 / 5.3 at the first fleet_tick after the merge; each trigger files one issue; the metrics recover as the levers named in the trigger actions ship.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS ai_waste_governor_tick; DELETE FROM analytics_metric_triggers WHERE metric_key IN ('ai_error_waste_usd_7d','ai_unmetered_purposes_7d','research_rows_over_4_cycles','research_published_per_day_7d'); DELETE FROM metric_registry WHERE metric IN ('ai_error_waste_usd_7d','ai_unmetered_purposes_7d','research_rows_over_4_cycles','research_published_per_day_7d'); DROP VIEW IF EXISTS v_ai_waste_headline; DROP VIEW IF EXISTS v_ai_waste_by_purpose_7d; DELETE FROM decision_log WHERE action LIKE 'AI-WASTE-GOVERNOR-1:%'

CREATE VIEW IF NOT EXISTS v_ai_waste_by_purpose_7d AS
SELECT worker, purpose,
  SUM(calls) AS calls,
  SUM(errors) AS errors,
  ROUND(SUM(neurons)) AS neurons,
  ROUND(SUM(CASE WHEN calls > 0 THEN errors * 1.0 * neurons / calls ELSE 0 END)) AS error_waste_neurons,
  ROUND(SUM(CASE WHEN calls > 0 THEN errors * 1.0 * neurons / calls ELSE 0 END) / 1000.0 * 0.011, 2) AS error_waste_usd,
  CASE WHEN SUM(calls) >= 100 AND SUM(neurons) = 0 AND SUM(out_tok) = 0 THEN 1 ELSE 0 END AS unmetered
FROM ai_call_counters
WHERE day >= date('now', '-7 day')
GROUP BY worker, purpose;

CREATE VIEW IF NOT EXISTS v_ai_waste_headline AS
SELECT
  COALESCE((SELECT ROUND(SUM(error_waste_neurons) / 1000.0 * 0.011, 2) FROM v_ai_waste_by_purpose_7d), 0) AS error_waste_usd_7d,
  (SELECT COUNT(*) FROM v_ai_waste_by_purpose_7d WHERE unmetered = 1) AS unmetered_purposes_7d,
  (SELECT COUNT(*) FROM research_queue WHERE terminal_rearms >= 5 AND status NOT IN ('published', 'merged')) AS research_rows_over_4_cycles,
  ROUND((SELECT COUNT(*) FROM research_queue WHERE status = 'published' AND published_at >= date('now', '-7 day')) / 7.0, 1) AS published_per_day_7d;

INSERT OR IGNORE INTO metric_registry
  (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class)
VALUES
  ('ai_error_waste_usd_7d', 'operational', 'target',
   'USD (0.011 per 1,000 neurons) of Workers AI neurons spent on calls that errored over 7 days: SUM(errors * neurons / calls) from ai_call_counters',
   'qnfo-audit.v_ai_waste_headline.error_waste_usd_7d (AI-WASTE-GOVERNOR-1)',
   CAST((SELECT error_waste_usd_7d FROM v_ai_waste_headline) AS TEXT),
   '<= 2 USD a week (initial, from a 5.33 baseline on 2026-11-09)', 'qnfo-fleet-control',
   'analytics_metric_triggers -> evaluateMetricTriggers (qnfo-fleet-control)', '10m', '> 2', '> 4',
   CAST((SELECT error_waste_usd_7d FROM v_ai_waste_headline) AS TEXT),
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'MEASURED', 'computed'),
  ('ai_unmetered_purposes_7d', 'operational', 'target',
   'Count of worker + purpose pairs with 100 or more calls and zero recorded neurons and zero output tokens over 7 days, from ai_call_counters',
   'qnfo-audit.v_ai_waste_headline.unmetered_purposes_7d (AI-WASTE-GOVERNOR-1)',
   CAST((SELECT unmetered_purposes_7d FROM v_ai_waste_headline) AS TEXT),
   '0 (every purpose with real traffic records its tokens or neurons)', 'qnfo-fleet-control',
   'analytics_metric_triggers -> evaluateMetricTriggers (qnfo-fleet-control)', '10m', '> 0', '> 3',
   CAST((SELECT unmetered_purposes_7d FROM v_ai_waste_headline) AS TEXT),
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'MEASURED', 'computed'),
  ('research_rows_over_4_cycles', 'operational', 'target',
   'Count of research_queue rows with 5 or more terminal re-arms (terminal_rearms) that are not published or merged: full re-drafts of a paper that keeps failing review',
   'qnfo-audit.v_ai_waste_headline.research_rows_over_4_cycles (AI-WASTE-GOVERNOR-1)',
   CAST((SELECT research_rows_over_4_cycles FROM v_ai_waste_headline) AS TEXT),
   '0 (a paper that fails four full cycles stops being re-drafted until its findings or sources change)', 'qnfo-fleet-control',
   'analytics_metric_triggers -> evaluateMetricTriggers (qnfo-fleet-control)', '10m', '> 0', '> 3',
   CAST((SELECT research_rows_over_4_cycles FROM v_ai_waste_headline) AS TEXT),
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'MEASURED', 'computed'),
  ('research_published_per_day_7d', 'operational', 'target',
   'Papers with research_queue.status published and published_at in the last 7 days, divided by 7',
   'qnfo-audit.v_ai_waste_headline.published_per_day_7d (AI-WASTE-GOVERNOR-1)',
   CAST((SELECT published_per_day_7d FROM v_ai_waste_headline) AS TEXT),
   '>= 15 a day (initial; 5.3 on 2026-11-09, 71 to 89 on 2026-10-19..21; move it with evidence)', 'qnfo-fleet-control',
   'analytics_metric_triggers -> evaluateMetricTriggers (qnfo-fleet-control)', '10m', '< 15', '< 5',
   CAST((SELECT published_per_day_7d FROM v_ai_waste_headline) AS TEXT),
   strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'MEASURED', 'computed');

INSERT OR IGNORE INTO analytics_metric_triggers
  (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
VALUES
  ('ai_error_waste_usd_7d', 'Workers AI neurons are being spent on calls that error', 'registry', 'gt', 2, 7,
   'AI-WASTE-GOVERNOR-1: read v_ai_waste_by_purpose_7d ordered by error_waste_usd; the top row is the lever. For qnfo-research-exec the revise stage runs glm-5.3-flash first and errored 128 of 520 calls over 3 days (measured 2026-11-06): each error pays for the call and then for the gpt-oss-120b retry. Make reviseModelPair adaptive: when a model errors on more than 15 percent of the stage calls in the trailing 24 hours (ai_call_counters), return the other model first, and log the switch as a cloud_ops_events row of kind model-order. No publication gate changes. Done when ai_error_waste_usd_7d is at or below 2 for 24 hours.
code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js
code-anchor: function reviseModelPair() {',
   'qnfo-fleet-control', 'agent_issues', 2, 1,
   'AI-WASTE-GOVERNOR-1: the trigger is the closing probe for neurons wasted on errored calls.'),
  ('ai_unmetered_purposes_7d', 'AI purposes with real traffic record no tokens or neurons', 'registry', 'gt', 0, 7,
   'AI-WASTE-GOVERNOR-1: read v_ai_waste_by_purpose_7d where unmetered = 1 (worker, purpose, calls). For each, find where the worker writes ai_call_counters (qnfo-ai chat-dynamic, personal-companion factcheck, idea-hub triage, qnfo-fleet-control goal-review at baseline 2026-11-09) and record in_tok, out_tok and neurons from the response usage, so its cost and output can be attributed. A purpose that is a router pass-through already booked under another worker is excluded in the view by migration with the reason. Done when ai_unmetered_purposes_7d is 0.',
   'qnfo-fleet-control', 'agent_issues', 2, 1,
   'AI-WASTE-GOVERNOR-1: spend that cannot be attributed to an output cannot be cut or defended.'),
  ('research_rows_over_4_cycles', 'Research papers are being fully re-drafted again and again', 'registry', 'gt', 0, 7,
   'AI-WASTE-GOVERNOR-1: select id, status, terminal_rearms, error from research_queue where terminal_rearms >= 5 and status not in (published, merged); at baseline 2026-11-09 five rows held 97 re-arms (one row 26). A paper that failed four full cycles is not re-drafted from ground a fifth time: laneReenter re-enters it as status deferred with the reason REVIEW-HARD-EXHAUSTED-1 and an expiry of 7 days, and it returns to the lane when its findings or sources change. The review gate, the HARD-finding rule and research_max_review_cycles stay unchanged; a paper that cannot pass review is still never published. Done when research_rows_over_4_cycles is 0 and stays 0.
code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js
code-anchor: async function laneReenter(env, row, o) {',
   'qnfo-fleet-control', 'agent_issues', 2, 1,
   'AI-WASTE-GOVERNOR-1: stops full re-drafts of papers that cannot pass review; quality gates untouched.'),
  ('research_published_per_day_7d', 'Research output is below the daily publishing target', 'registry', 'lt', 15, 7,
   'AI-WASTE-GOVERNOR-1: output equals the research budget divided by neurons per published paper (research-exec spend is held near 300k neurons a day since the 2026-11-04 tick allowance; about 85k to 100k neurons per published paper at baseline against about 10k for a clean pass). Do not raise research_daily_neurons: it buys more recycling. Read ai_call_counters by purpose for qnfo-research-exec, errata-hub and qnfo-paper-reviser, split the neurons into new-paper stages and revisions of already published papers, and file one code-task for the largest stage-level loss that is not a quality gate. Done when research_published_per_day_7d is at or above 15 for 7 days at no more than the current daily neurons.',
   'qnfo-fleet-control', 'agent_issues', 2, 1,
   'AI-WASTE-GOVERNOR-1: the outcome metric the three waste metrics serve. Initial target, revised with evidence.');

INSERT OR REPLACE INTO metric_breach_cause (metric_key, cause_key) VALUES
  ('ai_error_waste_usd_7d', 'spend'),
  ('ai_unmetered_purposes_7d', 'measurement'),
  ('research_rows_over_4_cycles', 'research-execution'),
  ('research_published_per_day_7d', 'research-execution');

CREATE TRIGGER IF NOT EXISTS ai_waste_governor_tick
AFTER INSERT ON fleet_tick
WHEN COALESCE((SELECT last_refreshed FROM metric_registry WHERE metric = 'ai_error_waste_usd_7d'), '') < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-10 minutes')
BEGIN
  UPDATE metric_registry
  SET last_value = CAST((SELECT error_waste_usd_7d FROM v_ai_waste_headline) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'ai_error_waste_usd_7d';
  UPDATE metric_registry
  SET last_value = CAST((SELECT unmetered_purposes_7d FROM v_ai_waste_headline) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'ai_unmetered_purposes_7d';
  UPDATE metric_registry
  SET last_value = CAST((SELECT research_rows_over_4_cycles FROM v_ai_waste_headline) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'research_rows_over_4_cycles';
  UPDATE metric_registry
  SET last_value = CAST((SELECT published_per_day_7d FROM v_ai_waste_headline) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'research_published_per_day_7d';
END;

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'claude-session-0156nqDu',
  'Waste that reaches neither a published paper nor deployed code is found by measuring errored calls, unattributed calls and repeated full re-drafts, and the fleet already has a loop that turns a breached metric into a doer issue.',
  'AI-WASTE-GOVERNOR-1: register four 10-minute metrics (error waste, unmetered purposes, research rows over 4 cycles, papers published per day) with qnfo-fleet-control triggers and two read views.',
  'Live qnfo-audit reads 2026-11-09: error waste 5.33 USD over 7 days, 6 unmetered purposes, 5 research rows with 97 re-arms, 37 papers published in 7 days against 71 to 89 a day on 2026-10-19..21; code loop 0.06 to 0.36 USD per merged PR (left alone).',
  'Migration adds two views, four metrics, four triggers, one fleet_tick refresh trigger and this row.',
  'Two views, four metric rows, four trigger rows, one fleet_tick trigger, one decision_log row. No spend, no gate, no hold.',
  'Run the Rollback line of migrations/2026-11-09-ai-waste-governor.sql.',
  'The fleet detects and files a doer issue for AI waste every 10 minutes without a session.',
  'The metrics read 5.33 / 6 / 5 / 5.3 at the first tick and each trigger files one issue within the cooldown.',
  'Not a reach change; it protects the research and code budget that produces reach.',
  'cloudflare-api: read-only qnfo-audit ai_call_counters and research_queue; python sqlite fixture; scripts/apply_migrations.py --check'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log WHERE action LIKE 'AI-WASTE-GOVERNOR-1:%'
);
