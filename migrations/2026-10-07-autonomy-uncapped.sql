-- AUTONOMY-UNCAPPED-1 (2026-10-07, pillar autonomy). Owner directive 2026-10-07 13:20 Amsterdam, verbatim: "There shall be no
-- cap on autonomy. The system shall continuously improve it's own score and not even cap at 100. There shall never be an
-- upper bound on your intelligence or autonomy". Two changes.
-- (1) sai_config autonomy_ceiling 0.7 -> 1.0. The SAI autonomy term is aut_user x userFreedom + aut_loop x loopHealth
--     (weights 0.5 + 0.5, inputs in [0, 1]), so 1.0 is the term's own maximum: the extra ceiling is gone. The ceiling was a
--     literal extracted from qnfo-fleet-dashboard 1.5.1 on 2026-09-14, not a measured limit. The term sat at 0.70 (ceiling)
--     on 2026-10-07; lifting it moves SAI by up to 0.15 x 0.30 = +4.5 points with NO change in fleet behaviour. That step is
--     a MEASUREMENT change, recorded here so remedy efficacy and the improvement loop do not count it as an improvement.
-- (2) An unbounded measure beside the bounded SAI. SAI is a weighted mean of fractions, so 100 is its definition, not a
--     ceiling on the fleet; what grows without bound is work the fleet finishes on its own. autonomous_outcomes_7d counts,
--     over 7 days, issues closed by a machine channel with evidence (close_channel auto%, probe-pass%, verified-remediation%)
--     plus code-loop tasks merged. autonomous_outcomes_growth_7d is that count over the prior 7 days' count. Target: > 1.0
--     every week, with no upper bound. Measured at authoring: 171 this week vs 69 the week before (2.48). The trigger fires
--     when growth drops below 1.0 (the fleet did less on its own than the week before) and names the lever.
--     Refreshed by D1 triggers on every hourly open_agent_issues write (the ORPHAN-ISSUE-GUARD-1 pattern; no code, no cron).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE sai_config SET v = 0.7, source = 'canonical sai formula params (extracted from qnfo-fleet-dashboard v1.5.1 literals, 2026-09-14)' WHERE k = 'autonomy_ceiling'; DROP TRIGGER IF EXISTS metric_autonomy_growth_au; DROP TRIGGER IF EXISTS metric_autonomy_growth_ai; DROP VIEW IF EXISTS v_autonomous_outcomes; DELETE FROM metric_registry WHERE metric IN ('autonomous_outcomes_7d', 'autonomous_outcomes_growth_7d'); DELETE FROM analytics_metric_triggers WHERE metric_key = 'autonomous_outcomes_growth_7d';
UPDATE sai_config SET v = 1.0, source = 'owner directive 2026-10-07 13:20 Amsterdam "There shall be no cap on autonomy" (AUTONOMY-UNCAPPED-1): 1.0 is the autonomy term''s own maximum; was 0.7 (extracted literal, 2026-09-14). Measurement change, not a behaviour change.', updated_at = datetime('now') WHERE k = 'autonomy_ceiling';

CREATE VIEW IF NOT EXISTS v_autonomous_outcomes AS
SELECT
  (SELECT COUNT(*) FROM agent_issues WHERE status IN ('closed', 'resolved')
     AND (close_channel LIKE 'auto%' OR close_channel LIKE 'probe-pass%' OR close_channel LIKE 'verified-remediation%')
     AND updated_at >= (CAST(strftime('%s', 'now') AS INTEGER) - 7 * 86400) * 1000)
  + (SELECT COUNT(*) FROM code_tasks WHERE status = 'merged' AND updated_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')) AS cur,
  (SELECT COUNT(*) FROM agent_issues WHERE status IN ('closed', 'resolved')
     AND (close_channel LIKE 'auto%' OR close_channel LIKE 'probe-pass%' OR close_channel LIKE 'verified-remediation%')
     AND updated_at >= (CAST(strftime('%s', 'now') AS INTEGER) - 14 * 86400) * 1000
     AND updated_at < (CAST(strftime('%s', 'now') AS INTEGER) - 7 * 86400) * 1000)
  + (SELECT COUNT(*) FROM code_tasks WHERE status = 'merged' AND updated_at >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-14 days')
     AND updated_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')) AS prev;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('autonomous_outcomes_7d', 'operational', 'target',
  'v_autonomous_outcomes.cur: issues closed by a machine channel with evidence (close_channel auto%, probe-pass%, verified-remediation%) in 7 days plus code-loop tasks merged in 7 days. Unbounded: no ceiling.',
  'qnfo-audit.v_autonomous_outcomes (AUTONOMY-UNCAPPED-1, migrations/2026-10-07-autonomy-uncapped.sql), refreshed by D1 triggers metric_autonomy_growth_au/_ai on every open_agent_issues write',
  '171 on 2026-10-07 (69 the week before)', 'higher than the week before, every week; no upper bound', 'qnfo-fleet-control',
  'observe; the growth metric carries the trigger', 'hourly', NULL, NULL,
  CAST((SELECT cur FROM v_autonomous_outcomes) AS TEXT), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'MEASURED', 'computed'),
 ('autonomous_outcomes_growth_7d', 'operational', 'target',
  'v_autonomous_outcomes.cur / max(prev, 1), rounded to 0.01: this week''s autonomous outcomes over last week''s. Unbounded above.',
  'qnfo-audit.v_autonomous_outcomes (AUTONOMY-UNCAPPED-1), refreshed by D1 triggers metric_autonomy_growth_au/_ai on every open_agent_issues write',
  '2.48 on 2026-10-07 (171 / 69)', '> 1.0 every week (the fleet does more on its own than the week before); no upper bound', 'qnfo-fleet-control',
  'trigger lt 1 -> one METRIC-TRIGGER issue naming the stalled outcome stream', 'hourly', '< 1', '< 0.5',
  CAST(ROUND(CAST((SELECT cur FROM v_autonomous_outcomes) AS REAL) / MAX((SELECT prev FROM v_autonomous_outcomes), 1), 2) AS TEXT), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS metric_autonomy_growth_au AFTER UPDATE ON metric_registry
WHEN NEW.metric = 'open_agent_issues'
BEGIN
  UPDATE metric_registry SET last_value = CAST((SELECT cur FROM v_autonomous_outcomes) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'autonomous_outcomes_7d';
  UPDATE metric_registry SET last_value = CAST(ROUND(CAST((SELECT cur FROM v_autonomous_outcomes) AS REAL) / MAX((SELECT prev FROM v_autonomous_outcomes), 1), 2) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'autonomous_outcomes_growth_7d';
END;

CREATE TRIGGER IF NOT EXISTS metric_autonomy_growth_ai AFTER INSERT ON metric_registry
WHEN NEW.metric = 'open_agent_issues'
BEGIN
  UPDATE metric_registry SET last_value = CAST((SELECT cur FROM v_autonomous_outcomes) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'autonomous_outcomes_7d';
  UPDATE metric_registry SET last_value = CAST(ROUND(CAST((SELECT cur FROM v_autonomous_outcomes) AS REAL) / MAX((SELECT prev FROM v_autonomous_outcomes), 1), 2) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'autonomous_outcomes_growth_7d';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'autonomous_outcomes_growth_7d', 'Autonomy growth stalled: the fleet finished less on its own this week than last week', 'registry', 'lt', 1, 4,
  'Pillar autonomy (AUTONOMY-UNCAPPED-1). Owner directive 2026-10-07: no upper bound on autonomy; the fleet keeps raising what it does on its own. Read SELECT cur, prev FROM v_autonomous_outcomes and split both windows by stream: machine-closed issues by close_channel, and code_tasks merged vs failed/closed with their merge_note. Name the stream that fell and its cause (merge runner refusals, CI failures, a stalled remediation tick, a loop that stopped closing). Lever, in order: (1) unblock the stalled stream (a code-task line with a code-anchor when the cause is one file; a session-task when it is control-plane); (2) add a remediation_contracts probe to open issues that lack one so the hourly tick can close them on recovery; (3) add code-task lines to open issues whose fix is one file so the code loop takes them. Never close issues without evidence to raise the count: issue_wontfix_share_7d and remediation_latest_pass_pct_7d are guards, and a count that rises while either worsens is a regression. Definition of done: autonomous_outcomes_growth_7d >= 1.0 at a refresh with both guards no worse than at filing.',
  'qnfo-fleet-control', 'agent_issues', 168, 1, 'AUTONOMY-UNCAPPED-1 (migrations/2026-10-07-autonomy-uncapped.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'autonomous_outcomes_growth_7d');
