-- ACT-BRIDGE-1 doer metrics (2026-10-02, pillar autonomy). Idempotent; applied live by the session that wrote it.
--
-- Owner directive 2026-10-02: "Filing an issue is not fixing it. Something still has to do the work: the fleet's code agent
-- for code changes it can handle." METRIC-CLOSED-LOOP-1 measures, judges and files; nothing measured whether a machine then
-- does the work. Measured 2026-10-02 07:00Z:
--   * 15 enabled metric triggers were in breach; 0 of the 37 enabled triggers carried a `code-task:` line, and
--     evaluateMetricTriggers could not have carried one anyway (it inlined the action after a prefix and cut it at 300
--     chars; fixed in qnfo-fleet-control 0.4.89, ACT-BRIDGE-1);
--   * the code loop (qnfo-code-orchestrator) had run 3 tasks in its life, all smoke tests or doc edits, one finished by hand.
-- Three metrics make the doer visible, computed on the hourly metric-refresh task:
--   code_tasks_30d              throughput of the code loop (report; no trigger: it is the denominator of the next one)
--   code_task_success_rate_30d  merged / finished code tasks created in 30d (n/a under 3 finished)
--   breach_code_task_pct        share of breaching triggers whose remedy is handed to the code loop (code-task line)

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('code_tasks_30d', 'operational', 'leading', 'count(code_tasks WHERE created_at >= now-30d): tasks the code loop took on (qnfo-code-orchestrator ISSUE-INTAKE-1 and POST /v1/tasks)', 'qnfo-audit.code_tasks', '3 (2026-10-02, all smoke tests)', '>= 4 (rising)', 'qnfo-code-orchestrator', 'report (ACT-BRIDGE-1); graded through code_task_success_rate_30d and breach_code_task_pct', 'hourly', '< 4', '< 1', 'UNMEASURED', 'computed'),
 ('code_task_success_rate_30d', 'operational', 'leading', 'count(status = merged) / count(status IN (merged, needs_human, closed)) over code_tasks created in the last 30d; n/a under 3 finished', 'qnfo-audit.code_tasks', '1.0 on 3 smoke tasks (2026-10-02)', '>= 0.6', 'qnfo-code-orchestrator', 'ACT-BRIDGE-1 trigger -> agent_issues (owner qnfo-code-orchestrator)', 'hourly', '< 0.6', '< 0.4', 'UNMEASURED', 'computed'),
 ('breach_code_task_pct', 'system', 'leading', '100 * breaching enabled triggers (v_metric_trigger_state.hit = 1) whose analytics_metric_triggers.action carries a code-task line / all breaching enabled triggers; n/a with none in breach', 'qnfo-audit.v_metric_trigger_state + analytics_metric_triggers', '0 of 15 (2026-10-02)', '>= 30 (every breach whose lever is code is handed to the code loop)', 'qnfo-kaizen', 'ACT-BRIDGE-1 trigger -> agent_issues (owner qnfo-kaizen)', 'hourly', '< 30', '< 10', 'UNMEASURED', 'computed');

UPDATE fleet_tasks SET definition = json_insert(definition, '$.steps[#]', json('{"type": "sql", "db": "AUDIT", "sql": "UPDATE metric_registry SET last_value = CASE metric WHEN ''code_tasks_30d'' THEN CAST((SELECT COUNT(*) FROM code_tasks WHERE created_at >= strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-30 days'')) AS TEXT) WHEN ''code_task_success_rate_30d'' THEN (SELECT CASE WHEN COUNT(*) >= 3 THEN CAST(ROUND(1.0 * SUM(CASE WHEN status = ''merged'' THEN 1 ELSE 0 END) / COUNT(*), 2) AS TEXT) ELSE ''n/a: under 3 finished code tasks in 30d'' END FROM code_tasks WHERE status IN (''merged'', ''needs_human'', ''closed'') AND created_at >= strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-30 days'')) WHEN ''breach_code_task_pct'' THEN (SELECT CASE WHEN COUNT(*) > 0 THEN CAST(ROUND(100.0 * SUM(CASE WHEN instr(t.action, ''code-task:'') > 0 THEN 1 ELSE 0 END) / COUNT(*), 1) AS TEXT) ELSE ''n/a: no trigger in breach'' END FROM v_metric_trigger_state s JOIN analytics_metric_triggers t ON t.id = s.id WHERE s.hit = 1) ELSE last_value END, last_refreshed = strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now''), state = ''MEASURED'' WHERE metric IN (''code_tasks_30d'', ''code_task_success_rate_30d'', ''breach_code_task_pct'')"}')),
  updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
WHERE id = 'metric-refresh' AND instr(definition, 'breach_code_task_pct') = 0;

WITH v(metric_key, title, operator, threshold, priority, action, owner) AS (VALUES
  ('code_task_success_rate_30d', 'Autonomy gap: the code loop finishes under half of its tasks', 'lt', 0.5, 7,
   'Pillar autonomy. Read code_tasks WHERE status = ''needs_human'' (last_error, model, attempts) for the last 30 days and fix the commonest cause in qnfo-code-orchestrator (prompt, patch-mode anchors, verifier, or the MODEL_LADDER rungs, LADDER-FRONTIER-1). Never lower the verification bar to raise the rate.', 'qnfo-code-orchestrator'),
  ('breach_code_task_pct', 'Autonomy gap: metric breaches are filed but not handed to the code loop', 'lt', 10, 7,
   'Pillar autonomy (ACT-BRIDGE-1). For each breaching trigger (SELECT s.metric_key, t.action FROM v_metric_trigger_state s JOIN analytics_metric_triggers t ON t.id = s.id WHERE s.hit = 1) whose lever is a code change in one worker, append to analytics_metric_triggers.action a line "code-task: repo=qnfo-workers path=<worker>/worker.js" and a line "code-anchor: <verbatim text that occurs once in that file near the edit>", with the edit stated in the prose. evaluateMetricTriggers then files the issue with those lines and the code loop opens the PR; the merge runner merges on green checks and verifies it live. Levers that are owner decisions stay prose.', 'qnfo-kaizen')
)
INSERT OR IGNORE INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT v.metric_key, v.title, 'registry', v.operator, v.threshold, v.priority,
       v.action || ' Definition of done: the metric is back inside its threshold in metric_registry; record the before and after values in issue_triage.close_evidence.',
       v.owner, 'agent_issues', 168, 1, 'ACT-BRIDGE-1 2026-10-02'
FROM v
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = v.metric_key AND x.enabled = 1);
