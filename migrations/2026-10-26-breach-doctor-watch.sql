-- BREACH-DOCTOR-WATCH-1 (2026-10-26, pillar autonomy; agent_issues 1000266 BREACH-DOCTOR-1, ANTIFRAGILE-1: a single executor on a critical path ships with its second path). Companion of
-- qnfo-cloud-ops 1.39.0 (jobBreachDoctorWatch, qnfo-cloud-ops/breach-doctor-watch.test.mjs).
-- The breach doctor (migrations/2026-10-26-breach-doctor.sql, qnfo-fleet-control breachDoctorTick) is worker code on the */10 slot and writes its own metrics, so a stalled fleet-control tick or a stalled
-- doctor block would stop the doctor and the numbers that report it together. Measured 2026-10-26 (SELECT only): breach_diagnosis_events does not exist on qnfo-audit yet (the doctor migration is in
-- review), metric_registry holds no doctor_tick_age_min row, spof_registry holds no doctor row. The second path is qnfo-cloud-ops: on every 10-minute tick of a different worker and a different cron it
-- reads the newest 'tick' event of the doctor, writes doctor_tick_age_min from it, and when the age passes 30 minutes files one deduped issue "BREACH-DOCTOR-1: doctor stalled (watch)" (at most one per 120
-- minutes) whose d1-query contract closes it when the tick is 15 minutes old or less. A missing ledger table or ops_config breach_doctor = off makes it skip without writing, so the job and this file may
-- land before the doctor does, in either order.
-- What this file does (INSERT OR IGNORE and guarded UPDATE only, nothing deleted, alternate_tested_at never written):
--   * spof_registry: the doctor tick row (the same component text the doctor migration uses) gets the watch as its alternate_path. The row is inserted when absent, and a 'planned:' alternate_path written by
--     the doctor migration is replaced by what was built (the watch notices and reports a stall; it runs no playbook). Both migration orders end in the same row. alternate_tested_at stays NULL until a drill passes.
--   * spof_alternate_probes: one read-only expected/observed probe the chaos drill (every 360 minutes) judges and, on a pass, stamps spof_registry.alternate_tested_at (qnfo-fleet-control chaosDrill, unchanged). It passes
--     only when the doctor ledger exists, a breach-doctor-watch event answered inside 30 minutes and doctor_tick_age_min reads 30 or less (the closing probe of the package), and it fails with the reason on each
--     missing piece, including the world before the doctor exists: no pass by absence. A drill that runs before the doctor and the worker are both live files one CHAOS-DRILL-FAILED-1 issue that its next pass closes.
--   * failure mode breach-doctor-watch-silent with its fm- detector contract: the doctor ledger exists, breach_doctor is not off, the switch row is older than 30 minutes and no breach-doctor-watch event is 30 minutes old.
--   * a capability_ledger row and a decision_log row.
-- Not in this file (the doctor migration owns them): the doctor's tables, metrics, triggers and its issue BREACH-DOCTOR-WATCH-1. That issue's text describes a larger job than this one (it also runs the
-- playbooks) and its closing probe reads cloud_ops_events kind 'job-run', while this job writes kind 'breach-doctor-watch': the issue is closed by a probe on that kind, not by a hand stamp.
-- spof-review: no new cron, worker or binding; the watch rides qnfo-cloud-ops's existing */10 tick (CRON-SINGLE-TRIGGER-1) and reads qnfo-audit through the AUDIT binding it already has.
-- charter-pillar: autonomy. No new table family.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM spof_alternate_probes WHERE component = 'breach doctor tick (qnfo-fleet-control */10)' AND window_note LIKE '30 minutes for the watch heartbeat%'; UPDATE spof_registry SET alternate_path = 'planned: qnfo-cloud-ops jobBreachDoctorWatch (BREACH-DOCTOR-WATCH-1) reads doctor_tick_age_min; rolled back', alternate_tested_at = NULL WHERE component = 'breach doctor tick (qnfo-fleet-control */10)' AND alternate_path LIKE 'qnfo-cloud-ops jobBreachDoctorWatch%'; DELETE FROM remediation_contracts WHERE class = 'fm-breach-doctor-watch-silent'; DELETE FROM failure_modes WHERE fm_key = 'breach-doctor-watch-silent'; DELETE FROM capability_ledger WHERE capability = 'breach-doctor:second-path-watch'
-- Rollback note: the decision_log row stays (append-only); an alternate_tested_at a passing drill stamped stays (it was earned); the worker change reverts with the canonical deploy canary.

INSERT OR IGNORE INTO spof_registry (component, critical_path, alternate_path, alternate_tested_at, evidence) VALUES
 ('breach doctor tick (qnfo-fleet-control */10)', 'unowned breach -> diagnosis -> allowlisted action -> verified close',
  'qnfo-cloud-ops jobBreachDoctorWatch (BREACH-DOCTOR-WATCH-1, qnfo-cloud-ops 1.39.0): on every 10-minute tick of a different worker and a different cron it reads the newest breach_diagnosis_events tick, writes metric doctor_tick_age_min from it (a stalled doctor cannot hide behind its own metric) and, when the age passes 30 minutes, files one deduped issue "BREACH-DOCTOR-1: doctor stalled (watch)" (at most one per 120 minutes) whose d1-query contract closes it once the tick is 15 minutes old or less; every run writes a cloud_ops_events row of kind breach-doctor-watch. It makes no model call and runs no playbook: it notices and reports the stall, the diagnosis path itself keeps one runner.',
  NULL,
  'new 2026-10-26 (BREACH-DOCTOR-1, agent_issues 1000266): the doctor is worker code on the existing */10 slot of qnfo-fleet-control, no new cron, worker or binding; this row is written by the watch migration so the second path is on record whichever of the two migrations applies first');

UPDATE spof_registry SET alternate_path = 'qnfo-cloud-ops jobBreachDoctorWatch (BREACH-DOCTOR-WATCH-1, qnfo-cloud-ops 1.39.0): on every 10-minute tick of a different worker and a different cron it reads the newest breach_diagnosis_events tick, writes metric doctor_tick_age_min from it (a stalled doctor cannot hide behind its own metric) and, when the age passes 30 minutes, files one deduped issue "BREACH-DOCTOR-1: doctor stalled (watch)" (at most one per 120 minutes) whose d1-query contract closes it once the tick is 15 minutes old or less; every run writes a cloud_ops_events row of kind breach-doctor-watch. It makes no model call and runs no playbook: it notices and reports the stall, the diagnosis path itself keeps one runner.',
  evidence = evidence || ' | BREACH-DOCTOR-WATCH-1 2026-10-26 (agent_issues 1000266): alternate_path recorded with the job that implements it, replacing the planned text (the built job notices and reports a stall and runs no playbook); alternate_tested_at is stamped only by a passing chaos drill on the spof_alternate_probes row of this component, which reads a breach-doctor-watch event inside 30 minutes and doctor_tick_age_min at 30 or below'
WHERE component = 'breach doctor tick (qnfo-fleet-control */10)' AND alternate_path LIKE 'planned:%';

INSERT OR IGNORE INTO spof_alternate_probes (component, probe_sql, exercise, window_note, enabled) VALUES
 ('breach doctor tick (qnfo-fleet-control */10)',
  'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''table'' AND name = ''breach_diagnosis_events'') THEN ''the doctor ledger breach_diagnosis_events does not exist, so there is no doctor tick to watch yet'' WHEN NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''breach-doctor-watch'' AND status = ''ok'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 minutes'')) THEN ''no breach-doctor-watch event answered in 30 minutes, so the second path of the breach doctor has not run'' WHEN (SELECT last_value FROM metric_registry WHERE metric = ''doctor_tick_age_min'') IS NULL THEN ''doctor_tick_age_min has no value'' WHEN CAST((SELECT last_value FROM metric_registry WHERE metric = ''doctor_tick_age_min'') AS REAL) > 30 THEN ''doctor_tick_age_min reads '' || (SELECT last_value FROM metric_registry WHERE metric = ''doctor_tick_age_min'') || '' minutes, above the limit of 30'' ELSE ''ok'' END AS observed',
  NULL,
  '30 minutes for the watch heartbeat (qnfo-cloud-ops writes one breach-doctor-watch event on every 10-minute tick, three ticks of margin) and 30 minutes for the doctor tick age (doctor_tick_age_min, written by the watch from the doctor''s own tick events); the watch is the exercise: it runs on every tick, so the alternate is run, not declared',
  1);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('breach-doctor-watch-silent', 'the second path of the breach doctor writes no heartbeat, so a stalled doctor has no independent reader',
  'qnfo-cloud-ops jobBreachDoctorWatch rides the */10 tick of qnfo-cloud-ops; a thrown step earlier in that tick, a failed deploy of qnfo-cloud-ops or an unreadable AUDIT binding stops it, and the watch itself has no watcher',
  'fm-breach-doctor-watch-silent reads the heartbeat rows (cloud_ops_events kind breach-doctor-watch) every 60 minutes; the chaos drill probe of the doctor tick row reads the same rows every 360 minutes',
  'fm-breach-doctor-watch-silent: the doctor ledger exists, breach_doctor is not off, and a breach-doctor-watch event is at most 30 minutes old',
  'fm-breach-doctor-watch-silent', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 1000266,
  'breach_diagnosis_events exists, ops_config breach_doctor is not off, the switch row is older than 30 minutes and cloud_ops_events has no row of kind breach-doctor-watch inside 30 minutes',
  'doctor_tick_age_min stops being refreshed by qnfo-cloud-ops; a stalled doctor is seen only by its own metrics',
  'the second path of the breach doctor (the first path is unaffected)');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-breach-doctor-watch-silent', NULL, 'BREACH-DOCTOR-WATCH-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''table'' AND name = ''breach_diagnosis_events'') AND lower(trim(COALESCE((SELECT value FROM ops_config WHERE key = ''breach_doctor''), ''''))) NOT IN (''off'', ''0'', ''false'', ''no'', ''disabled'') AND COALESCE((SELECT updated_at FROM ops_config WHERE key = ''breach_doctor''), ''9999'') < datetime(''now'', ''-30 minutes'') AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE kind = ''breach-doctor-watch'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 minutes'')) THEN ''1'' ELSE ''0'' END AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', datetime('now'));

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence) VALUES
 ('breach-doctor:second-path-watch', 'BREACH-DOCTOR-WATCH-1 (qnfo-cloud-ops 1.39.0 jobBreachDoctorWatch, migrations/2026-10-26-breach-doctor-watch.sql)',
  'qnfo-cloud-ops */10 tick, breach_diagnosis_events (migrations/2026-10-26-breach-doctor.sql), ops_config breach_doctor not off', 'unmeasured until the first chaos drill that reads the spof_alternate_probes row of the doctor tick component', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'a stalled breach doctor is measured (doctor_tick_age_min) and reported (one deduped issue with a d1-query contract) by a second worker, without a session');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'a single executor on the path from an unowned breach to a verified close is a single point of failure even while it is healthy (ANTIFRAGILE-1), an independent reader on a different worker and cron is the cheapest second path, and an alternate counts only after a drill has read it',
  'BREACH-DOCTOR-WATCH-1: qnfo-cloud-ops 1.39.0 jobBreachDoctorWatch reads the breach doctor''s newest tick event on every 10-minute tick, writes metric doctor_tick_age_min, files one deduped issue "BREACH-DOCTOR-1: doctor stalled (watch)" (at most one per 120 minutes) with a d1-query contract when the age passes 30 minutes, and records a cloud_ops_events row of kind breach-doctor-watch; spof_registry records it as the alternate path of the doctor tick and spof_alternate_probes drills it',
  'qnfo-audit 2026-10-26 (SELECT only): breach_diagnosis_events does not exist yet (the doctor migration is in review), metric_registry holds no doctor_tick_age_min row, spof_registry holds no doctor row; the job ran in qnfo-cloud-ops/breach-doctor-watch.test.mjs on node:sqlite over fixtures with the live column lists, the live unique open-title index and the live birth-contract and refile-reopen triggers of agent_issues',
  'migration merged and qnfo-cloud-ops 1.39.0 deployed through the canonical path',
  'one spof_registry row, one spof_alternate_probes row, one failure mode with its detector contract and one capability row; the job writes metric_registry doctor_tick_age_min and cloud_ops_events and, on a stall and at most once in 120 minutes, one agent_issues row with its remediation contract; it reads breach_diagnosis_events and writes nothing while that table is missing or ops_config breach_doctor is off',
  'the Rollback header of migrations/2026-10-26-breach-doctor-watch.sql; the worker change reverts with the canonical deploy canary',
  'a stalled breach doctor is measured and reported by a second worker without a session',
  'once the doctor ledger exists: metric doctor_tick_age_min is MEASURED by qnfo-cloud-ops within 20 minutes of the deploy and a cloud_ops_events row of kind breach-doctor-watch is under 30 minutes old',
  'none',
  'd1:qnfo-audit read-only, node:sqlite fixtures in qnfo-cloud-ops/breach-doctor-watch.test.mjs and migrations/breach-doctor-watch.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'BREACH-DOCTOR-WATCH-1:%');
