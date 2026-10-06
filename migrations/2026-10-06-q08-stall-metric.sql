-- Q08-STALL-METRIC-1 (2026-10-06, pillar reach; ORPHAN-ISSUE-GUARD-1 next action for agent_issues 2034). q08-signal-engine
-- stallDetector files Q08-PUBLISH-STALL-AUTO-1 when three finished runs published nothing and 8h+ passed since the last
-- piece, and closes it with evidence on the next published run; but the stall itself was never a metric, so the issue had
-- no probe and no gradient. This registers q08_hours_since_last_piece; the code task on 2034 makes writeOwnMetrics write
-- it each run (every 2h), and the contract issue-2034 reads it (ok under 8h). Exempt from analytics_metric_triggers: the
-- stallDetector already files and closes the issue, a trigger would file twice. Idempotent: INSERT OR IGNORE.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM metric_registry WHERE metric = 'q08_hours_since_last_piece';

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('q08_hours_since_last_piece', 'surface', 'reliability',
  'hours since MAX(published_pieces.published_at) in the q08-signal-engine D1, rounded to 0.1, written by writeOwnMetrics on every run (code task on agent_issues 2034)',
  'q08-signal-engine D1 published_pieces; written to qnfo-audit.metric_registry by q08-signal-engine',
  '26 at 2026-10-06T08:00Z (stall Q08-PUBLISH-STALL-AUTO-1, agent_issues 2034)',
  '< 8 (the cron runs every 2h and the quality gate passes about half the runs: q08_gate_pass_rate_7d 0.526)',
  'q08-signal-engine',
  'EXEMPT from analytics_metric_triggers (migrations/2026-10-06-q08-stall-metric.sql): q08-signal-engine stallDetector files Q08-PUBLISH-STALL-AUTO-1 itself at 8h+ after three failed runs and closes it on the next published run; remediation_contracts issue-2034 reads this metric',
  'per run (every 2h)', '>= 8', '>= 24', 'MEASURED', 'worker-written');
