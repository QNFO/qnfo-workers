-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE analytics_metric_triggers SET action = substr(action, 1, instr(action, char(10) || 'ACT-BRIDGE-LEVERS-20261013') - 1) WHERE id IN (404, 409, 3687) AND instr(action, char(10) || 'ACT-BRIDGE-LEVERS-20261013') > 0
-- ACT-BRIDGE-LEVERS-20261013 (2026-10-13, pillar autonomy, metric breach_code_task_pct 5.9 against a floor of 10).
-- Of the 34 breaching triggers at 07:40 UTC only 2 carried a code-task line, while three more already have their one-file lever filed
-- as an open issue for the code loop. ACT-BRIDGE-1 (CLAUDE.md) asks the trigger's action to end with that lever's code-task and
-- code-anchor lines, so the breach names its doer:
--   404 social_engagement_rate_30d: MASTODON-PUBLIC-STATS-1 (agent_issues 2481), per-post Mastodon engagement from the public status
--       API, qnfo-social/worker.js. Buffer answers metrics null for all 270 posts, so the rate cannot rise without a second source.
--   409 fleet_ai_run_rate_30d_usd and 3687 workers_ai_run_rate_usd: RESEARCH-RERUN-COST-1 (agent_issues 2473), qnfo-research-exec
--       parks an unresolved review instead of re-running the whole paper from ground (70 full re-runs for 104 published papers).
-- evaluateMetricTriggers files a trigger's action only when it opens a new issue and never rewrites an open one, so these lines
-- create no second code task while METRIC-TRIGGER issues 2022, 1780 and 2462 stay open. When the named issue's code-probe passes,
-- the next writer of the trigger replaces the two lines with the next lever (the anchors then occur in changed code).
UPDATE analytics_metric_triggers SET action = action || char(10) || 'ACT-BRIDGE-LEVERS-20261013: the one-file lever is filed as agent_issues 2481 MASTODON-PUBLIC-STATS-1 (per-post Mastodon favourites, reblogs and replies from the public status API while Buffer answers metrics null).' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-social/worker.js' || char(10) ||
  'code-anchor:     const plan = bufferStatsPlan(nodes, svc, now, known);'
WHERE id = 404 AND instr(action, 'ACT-BRIDGE-LEVERS-20261013') = 0;
UPDATE analytics_metric_triggers SET action = action || char(10) || 'ACT-BRIDGE-LEVERS-20261013: the top neuron consumer is qnfo-research-exec re-running whole papers after a review or revise failure; the one-file lever is filed as agent_issues 2473 RESEARCH-RERUN-COST-1 (park an unresolved review instead of a full re-run).' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-research-exec/worker.js' || char(10) ||
  'code-anchor: async function markError(env, row, msg) {'
WHERE id IN (409, 3687) AND instr(action, 'ACT-BRIDGE-LEVERS-20261013') = 0;
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
 ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'a breach whose one-file lever is already filed for the code loop names that lever in its trigger (ACT-BRIDGE-1)',
  'ACT-BRIDGE-LEVERS-20261013: triggers 404, 409 and 3687 end with the code-task and code-anchor lines of agent_issues 2481 and 2473',
  'v_metric_trigger_state 07:40 UTC: 34 breaching, 2 with a code-task line (breach_code_task_pct 5.9); 2481 and 2473 carry those lines; evaluateMetricTriggers in qnfo-fleet-control/worker.js inserts a new issue and never rewrites an open one',
  'merged through the canonical path', 'three trigger actions', 'the Rollback line of this file',
  'three more breaches name a doer', 'breach_code_task_pct at or above 10 at the first hourly metric tick after the merge', 'none',
  'd1:v_metric_trigger_state, analytics_metric_triggers, agent_issues; code:qnfo-fleet-control evaluateMetricTriggers');
