-- OUTPUT-QUALITY-ASK-OUTCOME-1 (2026-11-01, charter pillar reach; owner task 1000801).
-- Live qnfo-audit read: v_output_quality_headline reported 4 better, 0 worse and 3 flat;
-- gaps were ask, job applications and papers. Job applications and papers already have
-- outcome rows but lack adequate history/sample size. Ask had proxies only; qnfo-ai-search
-- already produces ask_helpful_rate_30d from visitor ratings, but its old history stores
-- percentages while the current producer writes a 0..1 ratio.
-- PREDICTION: ask gains one outcome measure; the Ask gap becomes unmeasured (not green)
-- until 10 ratings are available, and historical values compare in the same 0..1 units.
-- Rollback restores the backed-up ask history and removes only this outcome classification.
-- Rollback: UPDATE metric_history SET value=(SELECT b.value FROM bak_20261101_ask_helpful_history b WHERE b.metric=metric_history.metric AND b.day=metric_history.day) WHERE metric='ask_helpful_rate_30d' AND EXISTS (SELECT 1 FROM bak_20261101_ask_helpful_history b WHERE b.metric=metric_history.metric AND b.day=metric_history.day); DELETE FROM output_quality_measures WHERE metric='ask_helpful_rate_30d' AND judged_by='visitors who submit helpful/unhelpful answer ratings (qnfo-ai-search /api/feedback; minimum 10 ratings in 30d)'; DELETE FROM remediation_contracts WHERE class='fm-ask-helpful-history-unit-drift'; DELETE FROM failure_modes WHERE fm_key='ask-helpful-history-unit-drift'; DELETE FROM capability_ledger WHERE capability='ask-reader-outcome-quality-trend'
-- BACKUP: bak_20261101_ask_helpful_history
-- APPLY-BY: ci
-- DB: qnfo-audit

CREATE TABLE IF NOT EXISTS bak_20261101_ask_helpful_history (
  metric TEXT NOT NULL,
  day TEXT NOT NULL,
  value REAL,
  PRIMARY KEY (metric, day)
);

INSERT OR IGNORE INTO bak_20261101_ask_helpful_history (metric, day, value)
SELECT metric, day, value
FROM metric_history
WHERE metric = 'ask_helpful_rate_30d' AND value > 1;

UPDATE metric_history
SET value = ROUND(value / 100.0, 4)
WHERE metric = 'ask_helpful_rate_30d' AND value > 1;

INSERT OR IGNORE INTO output_quality_measures
  (metric, surface, role, polarity, tol_rel, tol_abs, judged_by, caveat)
VALUES
  ('ask_helpful_rate_30d', 'ask', 'outcome', 1, 0.1, 0.05,
   'visitors who submit helpful/unhelpful answer ratings (qnfo-ai-search /api/feedback; minimum 10 ratings in 30d)',
   'self-selected ratings; fewer than 10 ratings is unmeasured, not a pass; prior percentage history is normalized to a 0..1 ratio');

INSERT OR IGNORE INTO failure_modes
  (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES
  ('ask-helpful-history-unit-drift',
   'ask helpfulness history mixes percentage and ratio units',
   'a legacy writer recorded visitor helpfulness as a percentage while qnfo-ai-search now records a 0..1 ratio',
   'normalize backed-up historical percentage values to a ratio and keep future producer values in the 0..1 range',
   'hourly D1 remediation probe fm-ask-helpful-history-unit-drift',
   'fm-ask-helpful-history-unit-drift',
   '2026-11-01',
   1000801,
   'metric_history.value for ask_helpful_rate_30d is outside 0..1',
   'a unit change appears as a false outcome regression or improvement',
   'Ask output-quality trend');

INSERT OR IGNORE INTO remediation_contracts
  (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES
  ('fm-ask-helpful-history-unit-drift',
   1000801,
   'OUTPUT-QUALITY-ASK-OUTCOME-1 normalized the backed-up legacy percentage history',
   'failure-mode detector: keep ask_helpful_rate_30d history in the producer''s 0..1 ratio scale',
   'SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM metric_history WHERE metric = ''ask_helpful_rate_30d'' AND value IS NOT NULL AND (value < 0 OR value > 1)',
   'd1-query',
   3,
   'qnfo-fleet-control',
   1,
   'active',
   'failure-mode',
   datetime('now'));

INSERT OR IGNORE INTO capability_ledger
  (capability, provenance, prerequisites, reliability, acquired_at, evidence)
VALUES
  ('ask-reader-outcome-quality-trend',
   'OUTPUT-QUALITY-ASK-OUTCOME-1',
   'qnfo-ai-search ask_helpful_rate_30d reaches 10 ratings in 30 days',
   'measured only when the producer sample qualifies; otherwise reported unmeasured',
   '2026-11-01',
   'visitor ratings are classified as an Ask outcome and historical values use the producer''s 0..1 ratio scale');

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'copilot/owner-task-op-mvtj36x74007-fix-outputs-quality',
  'visitor helpfulness ratings are an output outcome because readers, not the answer generator, judge helpfulness; fewer than 10 ratings is unknown',
  'OUTPUT-QUALITY-ASK-OUTCOME-1: classify ask_helpful_rate_30d as an outcome and normalize its historical percentage values',
  'Read-only qnfo-audit query on 2026-11-01: v_output_quality_headline reported 4 better, 0 worse, 3 flat and gaps ask, job applications and papers; Ask had no outcome row. qnfo-ai-search already measures ask_helpful_rate_30d, requires 10 ratings, and currently emits a 0..1 ratio; metric_history held prior percentage values.',
  'Ask becomes measurable as an outcome when its sample qualifies; no producer is changed because the current outcome verdict reports zero regressions. Job-application and paper outcome registrations are retained.',
  'qnfo-audit.output_quality_measures and metric_history for ask_helpful_rate_30d',
  'Rollback restores ask metric_history from bak_20261101_ask_helpful_history and removes the Ask outcome row; the decision log is append-only.',
  'Ask visitor feedback participates in the outcome-only quality verdict without treating a small sample as success.',
  'ask_outcome_measure_count >= 1 within 24 h',
  'The Ask gap is classified as an outcome; job-application and paper outcome measures remain present, and no existing worse outcome is offset or hidden.',
  'Read-only qnfo-audit quality views; qnfo-ai-search rating producer source; node:sqlite migration regression test'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE action = 'OUTPUT-QUALITY-ASK-OUTCOME-1: classify ask_helpful_rate_30d as an outcome and normalize its historical percentage values'
);
