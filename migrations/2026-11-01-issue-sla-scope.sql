-- ISSUE-SLA-SCOPE-1 (agent_issues 99920, GitHub #2326, charter pillar autonomy).
-- The 120-minute issue metric includes only SLA-bound defects, incidents and reliability issues.
-- Monitoring tickets and issues represented by goals/objective_space are tracked by their own metrics.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_issue_sla_scope
-- Rollback: DROP TRIGGER IF EXISTS issue_sla_bound_metric_after_write; DROP VIEW IF EXISTS v_sla_over_120m; CREATE VIEW v_sla_over_120m AS SELECT vsla_s.*, vsla_k.*, vsla_x.issues_open_over_120m, vsla_x.oldest_open_issue_min, vsla_c.content_items_over_sla, vsla_q.code_tasks_queued_over_120m, vsla_r.research_claims_over_120m, vsla_p.cadence_overdue_over_120m, vsla_x.issues_open_over_120m + vsla_s.research_review_error + vsla_s.research_head_stalled + vsla_s.research_queued_180m + vsla_s.intents_pending + vsla_s.outreach_waiting + vsla_s.code_tasks_stalled + vsla_s.zenodo_exit_pending_stalled + vsla_s.research_held_over_sla + vsla_s.triage_gap - vsla_o.triage_gap_in_open_120m + vsla_s.contracts_cadence_drift + vsla_q.code_tasks_queued_over_120m - vsla_o.code_tasks_stalled_and_queued_120m + vsla_k.predictions_unscored_over_sla + vsla_k.doctrine_proposals_waiting + vsla_c.content_items_over_sla - vsla_o.research_in_content_over_sla + vsla_r.research_claims_over_120m + vsla_p.cadence_overdue_over_120m AS total_over_120m FROM v_stuck_summary vsla_s, v_stuck_summary_kernel vsla_k, v_sla_overlap_120m vsla_o, (SELECT COUNT(*) AS issues_open_over_120m, COALESCE(MAX(age_min), 0) AS oldest_open_issue_min FROM v_issue_age WHERE age_min > 120) vsla_x, (SELECT COALESCE(SUM(over_sla), 0) AS content_items_over_sla FROM v_content_pipeline) vsla_c, (SELECT COUNT(*) AS code_tasks_queued_over_120m FROM code_tasks WHERE status = 'queued' AND datetime(created_at) < datetime('now', '-120 minutes')) vsla_q, (SELECT COUNT(*) AS research_claims_over_120m FROM research_queue WHERE status = 'researching' AND claimed_at IS NOT NULL AND claimed_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) vsla_r, (SELECT COUNT(*) AS cadence_overdue_over_120m FROM v_cadence_overdue WHERE over_sla = 1) vsla_p; DROP VIEW IF EXISTS v_sla_bound_issue_age; UPDATE metric_registry SET formula = (SELECT a FROM bak_20261101_issue_sla_scope WHERE kind = 'registry' AND k = 'issues_open_over_120m'), source_of_truth = (SELECT b FROM bak_20261101_issue_sla_scope WHERE kind = 'registry' AND k = 'issues_open_over_120m'), last_value = CAST((SELECT COUNT(*) FROM v_issue_age WHERE age_min >= 120) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'issues_open_over_120m'; UPDATE analytics_metric_triggers SET title = (SELECT a FROM bak_20261101_issue_sla_scope WHERE kind = 'metric-trigger' AND k = CAST(analytics_metric_triggers.id AS TEXT)), action = (SELECT b FROM bak_20261101_issue_sla_scope WHERE kind = 'metric-trigger' AND k = CAST(analytics_metric_triggers.id AS TEXT)), notes = (SELECT c FROM bak_20261101_issue_sla_scope WHERE kind = 'metric-trigger' AND k = CAST(analytics_metric_triggers.id AS TEXT)) WHERE id IN (SELECT CAST(k AS INTEGER) FROM bak_20261101_issue_sla_scope WHERE kind = 'metric-trigger'); DELETE FROM remediation_contracts WHERE class = 'fm-issue-sla-scope'; DELETE FROM failure_modes WHERE fm_key = 'issue-sla-scope'
-- spof-review: no new worker, cron, credential, or executor; the existing 10-minute fleet tick refreshes the metric.

CREATE TABLE IF NOT EXISTS bak_20261101_issue_sla_scope AS
SELECT 'view' AS kind, name AS k, sql AS a, NULL AS b, NULL AS c
FROM sqlite_master WHERE type = 'view' AND name = 'v_sla_over_120m'
UNION ALL
SELECT 'registry', metric, formula, source_of_truth, NULL
FROM metric_registry WHERE metric = 'issues_open_over_120m'
UNION ALL
SELECT 'metric-trigger', CAST(id AS TEXT), title, action, notes
FROM analytics_metric_triggers WHERE metric_key = 'issues_open_over_120m';

CREATE VIEW IF NOT EXISTS v_sla_bound_issue_age AS
SELECT a.id, a.priority, a.title, a.age_min, i.category
FROM v_issue_age a
JOIN agent_issues i ON i.id = a.id
WHERE a.age_min >= 120
  AND lower(trim(COALESCE(i.category, ''))) IN ('defect', 'incident', 'reliability')
  AND i.title NOT LIKE 'METRIC-TRIGGER-%'
  AND NOT EXISTS (
    SELECT 1 FROM goals g
    WHERE g.source = 'agent_issues:' || i.id
       OR g.source LIKE 'agent_issues:' || i.id || ' (%'
       OR g.source = 'agent_issues ' || i.id
       OR g.source LIKE 'agent_issues ' || i.id || ' (%'
  )
  AND NOT EXISTS (
    SELECT 1 FROM objective_space o
    WHERE o.source = 'agent_issues:' || i.id
       OR o.source LIKE 'agent_issues:' || i.id || ' (%'
       OR o.source = 'agent_issues ' || i.id
       OR o.source LIKE 'agent_issues ' || i.id || ' (%'
  );

DROP VIEW IF EXISTS v_sla_over_120m;
CREATE VIEW v_sla_over_120m AS
SELECT vsla_s.*, vsla_k.*, vsla_x.issues_open_over_120m, vsla_x.oldest_open_issue_min, vsla_c.content_items_over_sla,
  vsla_q.code_tasks_queued_over_120m, vsla_r.research_claims_over_120m, vsla_p.cadence_overdue_over_120m,
  vsla_x.issues_open_over_120m + vsla_s.research_review_error + vsla_s.research_head_stalled + vsla_s.research_queued_180m + vsla_s.intents_pending
    + vsla_s.outreach_waiting + vsla_s.code_tasks_stalled + vsla_s.zenodo_exit_pending_stalled + vsla_s.research_held_over_sla
    + vsla_s.triage_gap - vsla_o.triage_gap_in_open_120m + vsla_s.contracts_cadence_drift
    + vsla_q.code_tasks_queued_over_120m - vsla_o.code_tasks_stalled_and_queued_120m
    + vsla_k.predictions_unscored_over_sla + vsla_k.doctrine_proposals_waiting
    + vsla_c.content_items_over_sla - vsla_o.research_in_content_over_sla + vsla_r.research_claims_over_120m
    + vsla_p.cadence_overdue_over_120m AS total_over_120m
FROM v_stuck_summary vsla_s, v_stuck_summary_kernel vsla_k, v_sla_overlap_120m vsla_o,
  (SELECT COUNT(*) AS issues_open_over_120m, COALESCE(MAX(age_min), 0) AS oldest_open_issue_min FROM v_sla_bound_issue_age) vsla_x,
  (SELECT COALESCE(SUM(over_sla), 0) AS content_items_over_sla FROM v_content_pipeline) vsla_c,
  (SELECT COUNT(*) AS code_tasks_queued_over_120m FROM code_tasks WHERE status = 'queued' AND datetime(created_at) < datetime('now', '-120 minutes')) vsla_q,
  (SELECT COUNT(*) AS research_claims_over_120m FROM research_queue WHERE status = 'researching' AND claimed_at IS NOT NULL
     AND claimed_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) vsla_r,
  (SELECT COUNT(*) AS cadence_overdue_over_120m FROM v_cadence_overdue WHERE over_sla = 1) vsla_p;

CREATE TRIGGER IF NOT EXISTS issue_sla_bound_metric_after_write
AFTER UPDATE OF last_value ON metric_registry
WHEN NEW.metric = 'issues_open_over_120m'
  AND NEW.last_value IS NOT CAST((SELECT COUNT(*) FROM v_sla_bound_issue_age) AS TEXT)
BEGIN
  UPDATE metric_registry
  SET last_value = CAST((SELECT COUNT(*) FROM v_sla_bound_issue_age) AS TEXT),
      state = 'MEASURED'
  WHERE metric = NEW.metric;
END;

UPDATE metric_registry
SET formula = 'open defect, incident, and reliability issues at least 120 minutes old, excluding METRIC-TRIGGER tickets and issues mapped to goals or objective_space (v_sla_bound_issue_age); refreshed every 10 minutes',
    source_of_truth = 'qnfo-audit.v_sla_bound_issue_age (ISSUE-SLA-SCOPE-1)',
    last_value = CAST((SELECT COUNT(*) FROM v_sla_bound_issue_age) AS TEXT),
    last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    state = 'MEASURED'
WHERE metric = 'issues_open_over_120m';

UPDATE analytics_metric_triggers
SET title = 'SLA breach: eligible issue work older than 120 minutes',
    action = replace(action,
      'SELECT id, priority, age_min, substr(title, 1, 80) FROM v_issue_age WHERE age_min >= 120',
      'SELECT id, priority, age_min, substr(title, 1, 80) FROM v_sla_bound_issue_age'),
    notes = CASE WHEN instr(COALESCE(notes, ''), 'ISSUE-SLA-SCOPE-1') > 0 THEN notes
      ELSE COALESCE(notes, '') || ' | ISSUE-SLA-SCOPE-1: the measured issue population is eligible defects, incidents and reliability issues, excluding monitoring tickets and goal-mapped work'
      END
WHERE metric_key = 'issues_open_over_120m';

INSERT OR IGNORE INTO failure_modes
  (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES
  ('issue-sla-scope', 'the 120-minute issue metric counts monitoring and goal-tracked backlog as SLA work',
   'the metric counted every open issue, including METRIC-TRIGGER tickets, roadmap items and goal-backed work',
   'ISSUE-SLA-SCOPE-1: measure aged defect, incident and reliability issues not represented by monitoring or goal records',
   'fm-issue-sla-scope: the bounded issue view, metric formula, trigger action and aggregate view agree',
   'fm-issue-sla-scope', '2026-11-01', 99920,
   'the issue metric drifts from its defined SLA population',
   'the monitoring backlog is included in the issue SLA breach count',
   'issues_open_over_120m and the aggregate SLA breach view');

INSERT OR IGNORE INTO remediation_contracts
  (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status)
VALUES
  ('fm-issue-sla-scope', NULL, 'ISSUE-SLA-SCOPE-1', 'failure-mode detector',
   'SELECT ''0'' AS expected, CAST(CASE WHEN (SELECT COUNT(*) FROM sqlite_master WHERE type = ''view'' AND name = ''v_sla_bound_issue_age'') = 1 AND (SELECT COUNT(*) FROM sqlite_master WHERE type = ''trigger'' AND name = ''issue_sla_bound_metric_after_write'') = 1 AND instr((SELECT formula FROM metric_registry WHERE metric = ''issues_open_over_120m''), ''v_sla_bound_issue_age'') > 0 AND instr((SELECT action FROM analytics_metric_triggers WHERE metric_key = ''issues_open_over_120m''), ''v_sla_bound_issue_age'') > 0 AND instr((SELECT sql FROM sqlite_master WHERE type = ''view'' AND name = ''v_sla_over_120m''), ''v_sla_bound_issue_age'') > 0 THEN 0 ELSE 1 END AS TEXT) AS observed',
   'd1-query', 3, 'qnfo-fleet-control', 1, 'active');

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'copilot:99920',
  'METRIC-TRIGGER records and issues represented by goal registers are not SLA-bound issue work; explicit issue-source links define goal mapping.',
  'ISSUE-SLA-SCOPE-1: scope the issue-age metric and SLA aggregate to aged defect, incident and reliability issues.',
  'Live qnfo-audit 2026-11-01: 409 issues were over 120 minutes; the issue-category, title and goal-source filters selected 162.',
  'Pending CI migration and two refreshes; no issue closure is inferred from this change.',
  'The issue-age metric, its trigger action and the issue component of v_sla_over_120m.',
  'Rollback restores the backed-up view, metric definition and trigger text; the filter view and correction trigger are removed.',
  'The 120-minute issue SLA measures actual defect, incident and reliability work without recursively counting its monitoring tickets.',
  'issues_open_over_120m falls from 409 to at most the 215 no-growth threshold without changing the metric target of zero.',
  'No direct reach claim.',
  'Live D1 category/source reads; regression test for category, metric-ticket, goal-mapping, refresh, aggregate and rollback behavior.'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'ISSUE-SLA-SCOPE-1:%');
