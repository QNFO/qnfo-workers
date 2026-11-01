-- ACT-BRIDGE-CODE-ELIGIBILITY-1 (2026-11-01, charter pillar autonomy; issue #3819).
-- Measure code-task routing only among breached triggers explicitly classified as single-file code remedies.
-- Existing line-start code-task actions are backfilled as eligible; future eligibility is independent of task routing.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE fleet_tasks SET definition = json_set(definition, '$.steps[4].sql', replace(json_extract(definition, '$.steps[4].sql'), 'WHEN ''breach_code_task_pct'' THEN (SELECT CASE WHEN COUNT(*) > 0 THEN CAST(ROUND(100.0 * SUM(CASE WHEN instr(t.action, char(10) || ''code-task:'') > 0 OR t.action LIKE ''code-task:%'' THEN 1 ELSE 0 END) / COUNT(*), 1) AS TEXT) ELSE ''n/a: no code-remediable trigger in breach'' END FROM v_metric_trigger_state s JOIN analytics_metric_triggers t ON t.id = s.id WHERE s.hit = 1 AND instr(COALESCE(t.notes, char(0)), ''code-remedy: single-file'') > 0)', 'WHEN ''breach_code_task_pct'' THEN (SELECT CASE WHEN COUNT(*) > 0 THEN CAST(ROUND(100.0 * SUM(CASE WHEN instr(t.action, char(10) || ''code-task:'') > 0 OR t.action LIKE ''code-task:%'' THEN 1 ELSE 0 END) / COUNT(*), 1) AS TEXT) ELSE ''n/a: no trigger in breach'' END FROM v_metric_trigger_state s JOIN analytics_metric_triggers t ON t.id = s.id WHERE s.hit = 1)')) WHERE id = 'metric-refresh'; UPDATE analytics_metric_triggers SET notes = CASE WHEN trim(notes) = 'code-remedy: single-file' || char(10) || 'code-remedy-backfill: ACT-BRIDGE-CODE-ELIGIBILITY-1' THEN NULL ELSE replace(replace(notes, char(10) || 'code-remedy: single-file', ''), char(10) || 'code-remedy-backfill: ACT-BRIDGE-CODE-ELIGIBILITY-1', '') END WHERE instr(COALESCE(notes, ''), 'code-remedy-backfill: ACT-BRIDGE-CODE-ELIGIBILITY-1') > 0; UPDATE analytics_metric_triggers SET action = substr(action, 1, instr(action, char(10) || 'ACT-BRIDGE-CODE-ELIGIBILITY-1:') - 1) WHERE metric_key = 'breach_code_task_pct' AND instr(action, char(10) || 'ACT-BRIDGE-CODE-ELIGIBILITY-1:') > 0; UPDATE metric_registry SET formula = '100 * breaching enabled triggers (v_metric_trigger_state.hit = 1) whose analytics_metric_triggers.action carries a code-task line at the start of a line (the form ACT-BRIDGE-1 hands to the code loop) / all breaching enabled triggers; n/a with none in breach', last_value = NULL, last_refreshed = NULL, state = 'UNMEASURED' WHERE metric = 'breach_code_task_pct';

UPDATE analytics_metric_triggers
SET notes = CASE
  WHEN trim(COALESCE(notes, '')) = '' THEN 'code-remedy: single-file' || char(10) || 'code-remedy-backfill: ACT-BRIDGE-CODE-ELIGIBILITY-1'
  ELSE rtrim(notes) || char(10) || 'code-remedy: single-file' || char(10) || 'code-remedy-backfill: ACT-BRIDGE-CODE-ELIGIBILITY-1'
END
WHERE (instr(COALESCE(action, ''), char(10) || 'code-task:') > 0 OR action LIKE 'code-task:%')
  AND instr(COALESCE(notes, ''), 'code-remedy: single-file') = 0;

UPDATE analytics_metric_triggers
SET action = COALESCE(action, '') || char(10) ||
  'ACT-BRIDGE-CODE-ELIGIBILITY-1: classify only a genuinely single-file code remedy with a separate notes line code-remedy: single-file; then provide its code-task and code-anchor lines. Do not classify cost, policy, backlog-policy, guard, observability, verification-transport, or multi-file remedies as code.'
WHERE metric_key = 'breach_code_task_pct'
  AND instr(COALESCE(action, ''), 'ACT-BRIDGE-CODE-ELIGIBILITY-1:') = 0;

UPDATE metric_registry
SET formula = '100 * breached enabled triggers carrying a code-task line / breached enabled triggers explicitly classified by a code-remedy: single-file line in analytics_metric_triggers.notes; n/a when no classified trigger is in breach'
WHERE metric = 'breach_code_task_pct';

UPDATE fleet_tasks
SET definition = json_set(
  definition,
  '$.steps[4].sql',
  replace(
    json_extract(definition, '$.steps[4].sql'),
    'WHEN ''breach_code_task_pct'' THEN (SELECT CASE WHEN COUNT(*) > 0 THEN CAST(ROUND(100.0 * SUM(CASE WHEN instr(t.action, char(10) || ''code-task:'') > 0 OR t.action LIKE ''code-task:%'' THEN 1 ELSE 0 END) / COUNT(*), 1) AS TEXT) ELSE ''n/a: no trigger in breach'' END FROM v_metric_trigger_state s JOIN analytics_metric_triggers t ON t.id = s.id WHERE s.hit = 1)',
    'WHEN ''breach_code_task_pct'' THEN (SELECT CASE WHEN COUNT(*) > 0 THEN CAST(ROUND(100.0 * SUM(CASE WHEN instr(t.action, char(10) || ''code-task:'') > 0 OR t.action LIKE ''code-task:%'' THEN 1 ELSE 0 END) / COUNT(*), 1) AS TEXT) ELSE ''n/a: no code-remediable trigger in breach'' END FROM v_metric_trigger_state s JOIN analytics_metric_triggers t ON t.id = s.id WHERE s.hit = 1 AND instr(COALESCE(t.notes, char(0)), ''code-remedy: single-file'') > 0)'
  )
),
updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE id = 'metric-refresh'
  AND instr(definition, 'code-remedy: single-file') = 0;

UPDATE metric_registry
SET last_value = (
  SELECT CASE WHEN COUNT(*) > 0
    THEN CAST(ROUND(100.0 * SUM(CASE
      WHEN instr(t.action, char(10) || 'code-task:') > 0 OR t.action LIKE 'code-task:%' THEN 1 ELSE 0
    END) / COUNT(*), 1) AS TEXT)
    ELSE 'n/a: no code-remediable trigger in breach'
  END
  FROM v_metric_trigger_state s
  JOIN analytics_metric_triggers t ON t.id = s.id
  WHERE s.hit = 1
    AND instr(COALESCE(t.notes, char(0)), 'code-remedy: single-file') > 0
),
last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
state = 'MEASURED'
WHERE metric = 'breach_code_task_pct';

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path,
   capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'session:copilot/1000038-fix-breach-code-target',
  'The metric currently counts all breaching trigger remedies, including triggers that cannot honestly be routed as single-file code tasks.',
  'ACT-BRIDGE-CODE-ELIGIBILITY-1: measure code-task routing among explicitly classified single-file code-remedy breaches.',
  'Issue #3819 cites a live sample of 9 code-task routes among 62 breaching triggers; the other 53 are cost, policy, backlog, observability, or verification-transport remedies.',
  'Pending CI migration and metric-refresh readback.',
  'breach_code_task_pct classification, formula, and metric-refresh calculation.',
  'The migration rollback restores the all-breach denominator, removes this migration’s eligibility markers and instruction, and invalidates the cached metric for the next refresh.',
  'The code-routing metric can distinguish eligible single-file work from remedies that belong to other executors.',
  'The measured denominator contains only classified code-remedy breaches; the 30% target remains and policy/cost remedies cannot dilute or inflate it.',
  'No direct external reach gain; the change makes the autonomy handoff measure actionable without misrouting.',
  'Offline SQLite tests cover eligible and ineligible breaches, missing handoffs, migration replay, and rollback; CI applies the D1 change and the hourly metric refresh remeasures.'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE action = 'ACT-BRIDGE-CODE-ELIGIBILITY-1: measure code-task routing among explicitly classified single-file code-remedy breaches.'
);
