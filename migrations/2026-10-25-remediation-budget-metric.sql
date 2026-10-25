-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE metric_registry SET formula=(SELECT formula FROM bak_20261025_remediation_budget_metric WHERE metric='remediation_contracts_over_budget'), source_of_truth=(SELECT source_of_truth FROM bak_20261025_remediation_budget_metric WHERE metric='remediation_contracts_over_budget'), last_value=(SELECT last_value FROM bak_20261025_remediation_budget_metric WHERE metric='remediation_contracts_over_budget'), last_refreshed=(SELECT last_refreshed FROM bak_20261025_remediation_budget_metric WHERE metric='remediation_contracts_over_budget'), state=(SELECT state FROM bak_20261025_remediation_budget_metric WHERE metric='remediation_contracts_over_budget') WHERE metric='remediation_contracts_over_budget'; UPDATE analytics_metric_triggers SET notes=(SELECT notes FROM bak_20261025_remediation_budget_metric_trigger WHERE metric_key='remediation_contracts_over_budget') WHERE metric_key='remediation_contracts_over_budget' AND EXISTS (SELECT 1 FROM bak_20261025_remediation_budget_metric_trigger WHERE metric_key='remediation_contracts_over_budget')
-- BACKUP: bak_20261025_remediation_budget_metric
-- REMEDIATION-OVER-BUDGET-METRIC-1 (2026-10-25, pillar autonomy, issue 1000187).
-- The old value counted cumulative attempts across all contract states. RED-DRAIN v6 step 2 only escalates an active/holding
-- failed contract after 5x max_attempts, with exclusions for detectors, beliefs, in-flight code tasks, and sole probes of
-- open non-metric issues. Keep the existing trigger operator and threshold unchanged; the hourly worker writes this exact set.
-- The detector and decision rows are durable audit records and intentionally remain if the metric metadata is rolled back.

CREATE TABLE IF NOT EXISTS bak_20261025_remediation_budget_metric AS
  SELECT metric, formula, source_of_truth, last_value, last_refreshed, state
  FROM metric_registry WHERE metric = 'remediation_contracts_over_budget';
CREATE TABLE IF NOT EXISTS bak_20261025_remediation_budget_metric_trigger AS
  SELECT metric_key, notes
  FROM analytics_metric_triggers WHERE metric_key = 'remediation_contracts_over_budget';

UPDATE metric_registry
SET formula = 'COUNT remediation_contracts in active/holding with last_verdict=fail and attempts > 5*COALESCE(max_attempts,3), excluding fm-/belief- detectors, in-flight code tasks, and sole live probes of open non-METRIC-TRIGGER issues; exact RED-DRAIN v6 step 2 eligibility set, refreshed hourly by qnfo-fleet-control',
    source_of_truth = 'qnfo-audit.remediation_contracts + qnfo-audit.code_tasks + qnfo-audit.agent_issues; RED-DRAIN v6 step 2; qnfo-fleet-control hourly refresh'
WHERE metric = 'remediation_contracts_over_budget';

UPDATE analytics_metric_triggers
SET notes = 'REMEDIATION-OVER-BUDGET-METRIC-1: measured from the exact RED-DRAIN v6 step 2 eligibility set; existing operator and threshold are unchanged.'
WHERE metric_key = 'remediation_contracts_over_budget';

INSERT OR IGNORE INTO failure_modes
  (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES
  ('remediation-over-budget-metric-lifetime-count',
   'remediation_contracts_over_budget counts cumulative attempts instead of RED-DRAIN-eligible contracts',
   'The metric treated attempts > max_attempts as a current backlog even though attempts is cumulative and ignores RED-DRAIN v6 step 2 status, failure, multiplier, and exclusion rules.',
   'REMEDIATION-OVER-BUDGET-METRIC-1: qnfo-fleet-control 0.47.0 refreshes the metric using the exact RED-DRAIN v6 step 2 predicate; the detector checks value equality and freshness.',
   'fm-remediation-over-budget-metric-lifetime-count compares the registry value with RED-DRAIN-eligible contracts and requires a refresh within 120 minutes.',
   'fm-remediation-over-budget-metric-lifetime-count', '2026-10-25', 1000187,
   'The metric value differs from the RED-DRAIN-eligible contract count or its refresh is over 120 minutes old.',
   'The stored value remains above the trigger threshold although only a few contracts are eligible for escalation.',
   'Issue 1000187 remains falsely breached and the remediation backlog metric cannot guide triage.');

INSERT OR IGNORE INTO remediation_contracts
  (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES
  ('fm-remediation-over-budget-metric-lifetime-count', NULL,
   'SELECT ''0'' AS expected, CAST(CASE WHEN EXISTS (SELECT 1 FROM metric_registry m WHERE m.metric = ''remediation_contracts_over_budget'' AND CAST(m.last_value AS INTEGER) = (SELECT COUNT(*) FROM remediation_contracts r WHERE r.status IN (''active'',''holding'') AND r.last_verdict=''fail'' AND r.attempts > 5*COALESCE(r.max_attempts,3) AND substr(r.class,1,3) <> ''fm-'' AND substr(r.class,1,7) <> ''belief-'' AND NOT EXISTS (SELECT 1 FROM code_tasks ct WHERE ct.status NOT IN (''closed'',''superseded'') AND ct.goal LIKE ''%#'' || r.issue_id || '' %'') AND NOT (r.issue_id IS NOT NULL AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id=r.issue_id AND a.status=''open'' AND a.title NOT LIKE ''METRIC-TRIGGER-%'') AND NOT EXISTS (SELECT 1 FROM remediation_contracts c2 WHERE c2.issue_id=r.issue_id AND c2.class<>r.class AND c2.status IN (''active'',''holding'')))) AND m.last_refreshed >= strftime(''%Y-%m-%dT%H:%M:%SZ'',''now'',''-120 minutes'')) THEN 0 ELSE 1 END AS TEXT) AS observed',
   'd1-query', 3, 1, 'active', 'REMEDIATION-OVER-BUDGET-METRIC-1', 'failure-mode detector: metric value equals RED-DRAIN eligibility and is fresh', 'qnfo-fleet-control');

INSERT OR IGNORE INTO capability_ledger
  (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES
  ('remediation-over-budget-metric-measured', 'qnfo-fleet-control 0.47.0 REMEDIATION-OVER-BUDGET-METRIC-1',
   'AUDIT D1 binding and the hourly qnfo-fleet-control tick', 'measured by the fm-remediation-over-budget-metric-lifetime-count contract',
   strftime('%Y-%m-%dT%H:%M:%SZ','now'), NULL,
   'The registry metric is refreshed from the exact RED-DRAIN v6 step 2 eligibility predicate.');

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_76eb6189-affa-44de-942f-c24aaa53dcfd',
  'The remediation-contract over-budget metric should measure current RED-DRAIN escalation candidates, not lifetime probe attempts.',
  'REMEDIATION-OVER-BUDGET-METRIC-1: measure RED-DRAIN-eligible failed contracts',
  'The stored metric was 2154 with a stale refresh; a fresh lifetime-attempt count was 2176 while only 3 contracts matched the exact RED-DRAIN v6 step 2 eligibility rule.',
  'Corrected metric source and hourly refresh implemented; awaiting live probe evidence.',
  'The remediation_contracts_over_budget metric and its issue trigger only; trigger threshold and RED-DRAIN behavior are unchanged.',
  'Revert qnfo-fleet-control worker.js and deployed-current.worker.js through the canonical path; the migration rollback restores metric formula, source, value, refresh time, state, and trigger notes. The detector and append-only ledger rows remain.',
  'The fleet can measure the actionable RED-DRAIN remediation backlog accurately.',
  'remediation_contracts_over_budget <= 50 within 2 h',
  'none',
  'qnfo-audit remediation_contracts, code_tasks, agent_issues, metric_registry, analytics_metric_triggers; qnfo-fleet-control source/mirror and regression suite'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action = 'REMEDIATION-OVER-BUDGET-METRIC-1: measure RED-DRAIN-eligible failed contracts');
