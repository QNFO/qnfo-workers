-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-quality-floor-read-fails-open'; DELETE FROM failure_modes WHERE fm_key = 'quality-floor-read-fails-open';
--
-- QUALITY-FLOOR-RECORD-1 (2026-10-26, charter pillar cost; agent_issues 1000408, follow-up of COST-QUALITY-FLOOR-ENFORCE-1; companion to qnfo-ai 5.40.1 in the same pull request).
-- decision_log is append-only, so the Rollback line leaves the decision row. The two DELETE statements in the Rollback line remove rows this file inserts (failure_modes, remediation_contracts); this
-- file's body runs no DELETE or DROP, so it names no BACKUP table.
--
-- WHAT WAS WRONG (found by the independent review of qnfo-ai 5.40.0, 2026-10-26; skeptic verdict "not refuted, severity low"): the quality floor reads one row, v_output_quality_headline.worse, and while it
--   is above 0 lifts every spend downgrade. A failed read keeps the last known value, and a cold isolate whose first read fails holds the initial 0, so every downgrade proceeds. The only signals were a
--   console line and /health spend.quality_floor.error, which no loop reads. The floor could stay open for days without a ticket (5.40.0 itself shipped reading a column that does not exist, and the failure
--   was visible only in the logs of the code loop's own PRs, 4615 and 4616).
-- WHAT THIS FILE DOES: qnfo-ai 5.40.1 writes one ai_call_counters row per read of the headline (purpose quality-floor-read, errors 1 on a failed read) and per lifted downgrade (purpose
--   quality-floor-lift:<point>). This file registers the failure mode and a d1-query detector that fails when, today (UTC), at least three reads failed and failures are more than half of the reads.
--   The detector reads 0 until 5.40.1 is deployed (no rows), so it cannot fail for want of data.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('quality-floor-read-fails-open',
  'a guard that lifts a cost downgrade while quality falls reads its signal from D1 and, when the read fails, keeps its last value (initially "quality holds"), so the downgrade runs unguarded and nothing reports it',
  'qnfo-ai spendQualityBlock keeps __qualityFloor.worse across a failed read and starts it at 0 in each isolate, logging only a console line and /health spend.quality_floor.error. 5.40.0 read a column the view does not have; the read failed on every call and no loop noticed until two code-loop pull requests (4615, 4616) reported the query error',
  'QUALITY-FLOOR-RECORD-1 (qnfo-ai 5.40.1): every read of the headline is counted in ai_call_counters (purpose quality-floor-read, errors on failure) and every lifted downgrade (purpose quality-floor-lift:<point>). This detector fails when at least three reads failed today and failures outnumber the reads that succeeded',
  'the d1-query contract fm-quality-floor-read-fails-open reads ai_call_counters for today (UTC), worker qnfo-ai, purpose quality-floor-read: observed 1 when errors >= 3 and errors * 2 > calls, else 0',
  'fm-quality-floor-read-fails-open', '2026-10-26', 1000408,
  'v_output_quality_headline is missing, renamed, a column it reads changes, or qnfo-audit rejects the read for a whole day while spend downgrades continue',
  'ai_call_counters shows quality-floor-read rows with errors above half of the calls; /health spend.quality_floor.error is set',
  'qnfo-ai: spend downgrades that the quality floor exists to lift run unguarded; quality of the fleet surfaces that consume router models can fall without the lift. Cost is unaffected');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-quality-floor-read-fails-open', NULL, 'QUALITY-FLOOR-RECORD-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT CASE WHEN COALESCE(SUM(errors), 0) >= 3 AND COALESCE(SUM(errors), 0) * 2 > COALESCE(SUM(calls), 0) THEN 1 ELSE 0 END FROM ai_call_counters WHERE worker = ''qnfo-ai'' AND purpose = ''quality-floor-read'' AND day = date(''now'')) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_015kWmGuAq2fNuvzu4MrD7x3',
  'a guard that fails open needs its own alarm; counting reads in the table the fleet-cap steer already writes is cheaper and safer than a new table, and a detector that reads 0 before the deploy cannot file a false ticket',
  'QUALITY-FLOOR-RECORD-1: qnfo-ai 5.40.1 counts every floor read and every lifted downgrade in ai_call_counters; this file adds the failure mode quality-floor-read-fails-open, its d1-query detector and this row',
  'independent review of 5.40.0 (2026-10-26): the failed-read path keeps worse = 0 and was reproduced with a stub D1; ai_call_counters already carries the (day, worker, purpose, model) key that fleetSteerCount upserts into',
  'applied through the canonical path on merge: the migration runner applies this file and canonical-deploy deploys qnfo-ai 5.40.1',
  'one failure_modes row, one d1-query contract and one decision row in qnfo-audit; qnfo-ai writes at most one counter upsert per floor read (hourly per isolate) and per lifted downgrade, off the request path. No agent_issues change, no secret, no binding',
  'revert the qnfo-ai deploy to 5.40.0 and run the Rollback line of this file',
  'a floor that cannot read its signal is reported within a probe cycle, and every lift of a cost downgrade is countable',
  'ai_call_counters holds quality-floor-lift rows for the days a lift happens and the detector contract passes on a day with no failed read',
  'cost steering keeps its quality guard honest; no change for any outside audience',
  'repository read of qnfo-ai/worker.js, node:sqlite replay in migrations/quality-floor-fail-open-detector.test.mjs, d1:qnfo-audit v_output_quality_headline and ai_call_counters (SELECT only)'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'QUALITY-FLOOR-RECORD-1:') = 1);
