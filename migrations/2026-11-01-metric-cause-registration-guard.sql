-- METRIC-CAUSE-AT-REGISTRATION-1 (2026-11-01, charter pillar autonomy; agent_issues 1000706).
-- Live qnfo-audit read: v_breach_by_cause had 6 unmapped breaches; metric_authorship had 3 active registrations since
-- 2026-10-29 without cause rows. Their formulas and actions identify the causes below: guard failures and ask latency
-- need code-loop fixes; focus issues without doers are issue backlog; compatibility, tool-allowlist, quality and product
-- improvement gaps are structural. This maps observed metrics and detects any later uncategorized registration.
-- PREDICTION: on apply, v_breach_by_cause's unmapped count falls from 6 to 0, the registration detector reads 0, and a
-- future active metric without a cause makes its probe fail; adding the cause returns it to 0.
-- Rollback preserves the append-only decision_log row.
-- Rollback: DELETE FROM metric_breach_cause WHERE note LIKE 'METRIC-CAUSE-AT-REGISTRATION-1 2026-11-01:%'; DELETE FROM remediation_contracts WHERE class = 'fm-metric-cause-registration-missing'; DELETE FROM failure_modes WHERE fm_key = 'metric-cause-registration-missing'
-- APPLY-BY: ci
-- DB: qnfo-audit

INSERT OR IGNORE INTO metric_breach_cause (metric_key, cause_key, note) VALUES
  ('guard_rcs', 'code-loop', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-11-01: metric_registry counts non-success runs of mirror-guard, version-bump-guard, workflow-lint, deploy-gate and dup-worker-name-gate; the remediation is to fix the failed code/deploy guard, never disable it.'),
  ('ask_p95_total_ms_7d', 'code-loop', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-11-01: ask_events p95 latency; ASK-LOOP-1 assigns qnfo-ai-search retrieval changes through ASK-FIX-1 code tasks.'),
  ('program_focus_without_doer', 'issue-backlog', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-11-01: program_focus rows have no code task, active remediation contract or linked session; the missing doer is backlog ownership.'),
  ('compat_date_age_days_max', 'structure', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-11-01: worker_compat_state measures the oldest live Worker compatibility date; this is fleet configuration drift and structural debt.'),
  ('agent_tool_calls_outside_allowlist', 'structure', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-11-01: cloud_ops_events and mcp_log report tool or egress calls outside agent_tool_allowlist; the defect is missing or incorrect fleet allowlist controls.'),
  ('fleet_quality_change_7d', 'structure', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-11-01: metric_improvement_trend shows the quality index falling; the owning lever escalates the affected program and its newest breached metrics, indicating structural quality debt rather than a faulty measurement.'),
  ('plus_debt_oldest_weeks', 'structure', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-11-01: v_product_plus_debt measures products with no shipped or kept improvement; the oldest product capability debt is a structural gap.'),
  ('product_plus_rate_7d', 'structure', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-11-01: plus_ledger measures shipped or kept product improvements per product; a low rate is a structural product-capability delivery gap.'),
  ('plus_keep_rate_30d', 'structure', 'METRIC-CAUSE-AT-REGISTRATION-1 2026-11-01: plus_ledger measures whether product improvements are kept or reverted; low retention is a structural quality gap in the improvement process.');

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES (
  'metric-cause-registration-missing',
  'an active metric registration has no metric_breach_cause row',
  'metric_registry permits a metric without a cause mapping; the existing breach detector only sees the omission after that metric breaches',
  'Map the cause in the registering migration and keep migrations/metric-family-cluster-b.test.mjs as the CI registration guard; use a forward migration for already-merged registrations.',
  'CI registration-cause suite plus the hourly fm-metric-cause-registration-missing D1 probe',
  'fm-metric-cause-registration-missing',
  '2026-11-01',
  1000706,
  'an active metric_authorship row authored on or after 2026-10-29 has no metric_breach_cause row',
  'a newly registered metric enters the unmapped bucket when it breaches',
  'metric triage loses root cause, and the breach doctor cannot route remediation'
);

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES (
  'fm-metric-cause-registration-missing',
  NULL,
  'METRIC-CAUSE-AT-REGISTRATION-1',
  'failure-mode detector: every active metric registered since 2026-10-29 has a cause mapping',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM metric_authorship a JOIN metric_registry r ON r.metric = a.metric LEFT JOIN metric_breach_cause c ON c.metric_key = a.metric WHERE a.authored_at >= ''2026-10-29T00:00:00Z'' AND c.metric_key IS NULL) AS TEXT) AS observed',
  'd1-query',
  3,
  'qnfo-fleet-control',
  1,
  'active',
  'failure-mode',
  datetime('now')
);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'copilot/metric-cause-at-registration-1',
  'cause mappings are classifications of the metric formula and remediation lever, and registrations after the enforcement cutoff must carry a cause',
  'METRIC-CAUSE-AT-REGISTRATION-1 detector: map the six live unmapped breaches and three recent unmapped registrations; register an hourly detector for later active registrations',
  'Read-only qnfo-audit query on 2026-11-01: v_breach_by_cause had 6 unmapped breaches; metric_authorship had 3 active registrations since 2026-10-29 without a metric_breach_cause row; cause classifications follow each metric formula, owner and action.',
  'migration records the mappings and detector; live behavior remains subject to the issue-1000706 runtime probe',
  'qnfo-audit metric cause mappings, failure_modes and remediation_contracts',
  'Rollback line removes only this migration''s mappings and detector rows; decision_log remains append-only.',
  'future unmapped metric registrations are detected hourly, while CI rejects a new metric registration without its cause mapping',
  'v_breach_by_cause unmapped count falls from 6 to 0; the registration detector reports 0 and fails on a later unmapped registration',
  'none',
  'read-only qnfo-audit D1 queries; node:sqlite regression suite; migration checker'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'METRIC-CAUSE-AT-REGISTRATION-1 detector:%');
