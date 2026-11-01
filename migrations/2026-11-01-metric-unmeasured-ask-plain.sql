-- METRIC-UNMEASURED-ASK-PLAIN-1 (2026-11-01, charter pillar autonomy; ROOT-CAUSE-1 issue 1001220).
-- qnfo-ai-search intentionally clears ask_plain_share_7d until 10 eligible answers with a plain verdict exist in the rolling 7-day window.
-- The metric was absent from the sample-floor exemption list, so management-personas filed and closed a missing-producer issue whenever
-- the rolling sample crossed that floor. Add a named exemption only while the value is absent; the enabled trigger evaluates numeric values.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_metric_unmeasured_ask_plain
-- Rollback: DELETE FROM metric_unmeasured_exemptions WHERE metric_key = 'ask_plain_share_7d' AND EXISTS (SELECT 1 FROM bak_20261101_metric_unmeasured_ask_plain WHERE metric_key = 'ask_plain_share_7d' AND existed = 0); UPDATE metric_unmeasured_exemptions SET reason = (SELECT reason FROM bak_20261101_metric_unmeasured_ask_plain WHERE metric_key = 'ask_plain_share_7d'), ends_when = (SELECT ends_when FROM bak_20261101_metric_unmeasured_ask_plain WHERE metric_key = 'ask_plain_share_7d'), doer = (SELECT doer FROM bak_20261101_metric_unmeasured_ask_plain WHERE metric_key = 'ask_plain_share_7d'), created_at = (SELECT created_at FROM bak_20261101_metric_unmeasured_ask_plain WHERE metric_key = 'ask_plain_share_7d') WHERE metric_key = 'ask_plain_share_7d' AND EXISTS (SELECT 1 FROM bak_20261101_metric_unmeasured_ask_plain WHERE metric_key = 'ask_plain_share_7d' AND existed = 1); UPDATE control_registry SET disposition = 'remove', disposition_state = 'applied', evidence = evidence || ' | METRIC-UNMEASURED-ASK-PLAIN-1 rollback: sample-floor exemption removed' WHERE control = 'metric-unmeasured-ask-plain-sample-floor' AND evidence LIKE '%METRIC-UNMEASURED-ASK-PLAIN-1%'; UPDATE control_alternate_probes SET enabled = 0 WHERE control = 'metric-unmeasured-ask-plain-sample-floor' AND window_note LIKE '%METRIC-UNMEASURED-ASK-PLAIN-1%'; DROP TABLE IF EXISTS bak_20261101_metric_unmeasured_ask_plain;

CREATE TABLE IF NOT EXISTS bak_20261101_metric_unmeasured_ask_plain (
  metric_key TEXT PRIMARY KEY,
  existed INTEGER NOT NULL,
  reason TEXT,
  ends_when TEXT,
  doer TEXT,
  created_at TEXT
);

INSERT OR IGNORE INTO bak_20261101_metric_unmeasured_ask_plain
  (metric_key, existed, reason, ends_when, doer, created_at)
SELECT 'ask_plain_share_7d',
       CASE WHEN e.metric_key IS NULL THEN 0 ELSE 1 END,
       e.reason, e.ends_when, e.doer, e.created_at
FROM (SELECT 1) seed
LEFT JOIN metric_unmeasured_exemptions e
  ON e.metric_key = 'ask_plain_share_7d';

INSERT OR IGNORE INTO metric_unmeasured_exemptions
  (metric_key, reason, ends_when, doer)
VALUES
  ('ask_plain_share_7d',
   'ASK-LOOP-1 measure() writes NULL below 10 eligible ask_events rows with a plain verdict in the rolling 7-day window; this is a valid sample floor, not a missing producer',
   'At least 10 eligible ask_events rows with a plain verdict exist in the rolling 7-day window and the producer writes a numeric value',
   'qnfo-ai-search');

INSERT OR IGNORE INTO control_registry
  (control, location, kind, guards_against, critical_path, disposition,
   disposition_state, alternate_path, evidence, issue_id)
VALUES
  ('metric-unmeasured-ask-plain-sample-floor',
   'qnfo-audit.metric_unmeasured_exemptions.ask_plain_share_7d; management-personas mi-snapshot',
   'filter',
   'false missing-producer issues while ask_plain_share_7d is below its valid sample floor',
   0,
   'keep',
   'applied',
   'ASK-LOOP-1 writes a numeric value at 10 eligible verdicts in the rolling 7-day window; the enabled metric trigger then evaluates it normally',
   'METRIC-UNMEASURED-ASK-PLAIN-1: the named exemption applies only while the value is absent. Live D1 issue 1000473 reopened 28 times for this metric; the producer requires 10 eligible verdicts, and issue 1001199 reports it unmeasured again.',
   1001220);

INSERT OR IGNORE INTO control_alternate_probes
  (control, probe_sql, window_note, enabled)
VALUES
  ('metric-unmeasured-ask-plain-sample-floor',
   'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM metric_unmeasured_exemptions WHERE metric_key = ''ask_plain_share_7d'') THEN ''named sample-floor exemption is missing'' WHEN NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = ''ask_plain_share_7d'' AND enabled = 1) THEN ''metric trigger is disabled'' WHEN NOT EXISTS (SELECT 1 FROM metric_improvement_now WHERE metric_key = ''ask_plain_share_7d'') THEN ''management snapshot is missing'' WHEN EXISTS (SELECT 1 FROM metric_improvement_now WHERE metric_key = ''ask_plain_share_7d'' AND verdict = ''unmeasured'' AND COALESCE(bp26, 0) <> 1) THEN ''empty sample is treated as a missing producer'' WHEN EXISTS (SELECT 1 FROM metric_improvement_now WHERE metric_key = ''ask_plain_share_7d'' AND val IS NOT NULL AND (COALESCE(bp26, 1) <> 0 OR verdict = ''unmeasured'')) THEN ''numeric value is exempted or unmeasured'' ELSE ''ok'' END AS observed',
   'Hourly: a NULL sample is exempt only from missing-producer filing; numeric values remain visible to the enabled trigger. METRIC-UNMEASURED-ASK-PLAIN-1.',
   1);

INSERT OR IGNORE INTO failure_modes
  (fm_key, failure_mode, root_cause, remediation, detector, probe_class,
   first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES
  ('metric-unmeasured-ask-plain-sample-flap',
   'The Ask plain-language metric is repeatedly reported as a missing producer below its sample floor',
   'qnfo-ai-search deliberately writes NULL below 10 eligible verdicts in a rolling 7-day window, but the management-personas exemption list omitted ask_plain_share_7d',
   'Add a named low-sample exemption that stops applying as soon as the producer writes a numeric value; keep the metric trigger enabled',
   'fm-metric-unmeasured-ask-plain-sample-flap: a missing exemption, an unexempted NULL snapshot, or an exempted numeric snapshot',
   'fm-metric-unmeasured-ask-plain-sample-flap',
   '2026-11-01',
   1001220,
   'ask_plain_share_7d is unmeasured without bp26=1, or has a numeric value while bp26 is not 0',
   'METRIC-UNMEASURED-1 issues for qnfo-ai-search are repeatedly closed and refiled as the rolling sample crosses 10',
   'qnfo-ai-search ask_plain_share_7d and the management-personas missing-metric audit');

INSERT OR IGNORE INTO remediation_contracts
  (class, issue_id, precondition, action, verify_probe, verify_transport,
   max_attempts, escalate_to, expected_cadence_h, status)
VALUES
  ('fm-metric-unmeasured-ask-plain-sample-flap',
   NULL,
   'management-personas has refreshed metric_improvement_now for ask_plain_share_7d',
   'Detect a missing sample-floor exemption or an exemption that masks a numeric value.',
   'SELECT ''0'' AS expected, CAST(CASE WHEN NOT EXISTS (SELECT 1 FROM metric_unmeasured_exemptions WHERE metric_key = ''ask_plain_share_7d'') THEN 1 WHEN NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = ''ask_plain_share_7d'' AND enabled = 1) THEN 1 WHEN NOT EXISTS (SELECT 1 FROM metric_improvement_now WHERE metric_key = ''ask_plain_share_7d'') THEN 1 WHEN EXISTS (SELECT 1 FROM metric_improvement_now WHERE metric_key = ''ask_plain_share_7d'' AND verdict = ''unmeasured'' AND COALESCE(bp26, 0) <> 1) THEN 1 WHEN EXISTS (SELECT 1 FROM metric_improvement_now WHERE metric_key = ''ask_plain_share_7d'' AND val IS NOT NULL AND (COALESCE(bp26, 1) <> 0 OR verdict = ''unmeasured'')) THEN 1 ELSE 0 END AS TEXT) AS observed',
   'd1-query',
   3,
   'qnfo-ai-search',
   1,
   'active');

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path,
   capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT
  'program-manager:QNFO.RSCH (METRIC-UNMEASURED-ASK-PLAIN-1)',
  'A deliberate minimum sample should remain unmeasured, not be treated as a missing producer.',
  'Add a named exemption for ask_plain_share_7d only while its rolling sample is below 10 eligible verdicts; preserve normal evaluation when a numeric value exists.',
  'D1 issue 1000473 reopened 28 times for ask_plain_share_7d; issue 1001199 reports the same metric. qnfo-ai-search measure() writes NULL below 10 eligible rows and clears stale registry values.',
  'pending migration application and a 24-hour recurrence readback',
  'The ask_plain_share_7d exemption, its manager control record, and its measured-value path',
  'Rollback line of migrations/2026-11-01-metric-unmeasured-ask-plain.sql',
  'The fleet distinguishes the producer''s valid low-sample state from a missing producer without hiding numeric results.',
  'METRIC-UNMEASURED-1 reopens attributable to ask_plain_share_7d fall to 0 over the next 7 days; the metric remains unmeasured below 10 eligible verdicts and resumes normal trigger evaluation when measured.',
  'No direct external reach gain.',
  'Live D1 issue and metric source reads; management-personas snapshot replay, sample-floor exemption, numeric trigger evaluation, and migration rollback.')
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE action LIKE 'Add a named exemption for ask_plain_share_7d only%'
);
