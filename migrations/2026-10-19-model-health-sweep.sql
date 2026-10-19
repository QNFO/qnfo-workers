-- MODEL-HEALTH-SWEEP-1 registry rows (2026-10-19, pillar autonomy; agent_issues 100238 to 100241, 100262 and 100151 are the measured cases). qnfo-lifecycle 1.13.0 closes the
-- "[ai-cal] model probe failing: <model>" and "MODEL-DEGRADED <models>" issues on every hourly tick once no named model reads degraded or failing in ai_model_health. Before it,
-- only the daily backlog member (02:00 UTC tick) could close them, and it reads the first 40 open issues by priority and oldest updated_at, so a high-priority row filed after the
-- 40 oldest highs was never reached: at 21:5xZ the six rows had been open since 17:15Z while all six models read ok (the calibration run of 21:30Z passed 6 of 6).
--   * control_registry: the off switch ops_config model_health_sweep (kind kill-switch, off the critical path). Its alternate is the daily member's identical predicate; the row
--     states "none needed" because the sweep only closes an issue whose named models read ok, so switching it off returns to the previous behaviour, not to a gap, and the
--     detector below reports any recovered model whose issue stays open.
--   * failure mode model-health-issue-stale with the detector fm-model-health-issue-stale: open "[ai-cal] model probe failing" issues older than 120 minutes whose model reads ok and
--     has been absent from the failing and drift lists of every calibration run (every 30 minutes) for 90 minutes. Not keyed on updated_at: the escalation loop touches these rows.
--   * decision_log.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-model-health-issue-stale'; DELETE FROM failure_modes WHERE fm_key = 'model-health-issue-stale'; DELETE FROM control_registry WHERE control = 'model-health-sweep';

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES ('model-health-sweep',
  'qnfo-lifecycle/worker.js sweepModelHealthIssues (hourly tick) and ops_config model_health_sweep',
  'kill-switch',
  'closing a model-health issue while a named model still reads degraded or failing in ai_model_health',
  0, 'keep', 'applied',
  'none needed: the sweep closes an issue only when no named model is degraded or failing, so off returns to the daily backlog member (qnfo-lifecycle backlogMod, 02:00 UTC tick) with the same predicate, and fm-model-health-issue-stale reports a recovered model whose issue stays open',
  NULL,
  'Reason and expiry recorded 2026-10-19: six model-health issues (100151, 100238 to 100241, 100262) sat open for up to five hours with every named model ok because the daily member never reached them (40-row cap, oldest updated first). The switch stays until the stale-issue detector has read 0 for seven days; it is an off switch for a read-only predicate, not a limit.',
  100238);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('model-health-issue-stale',
  'an "[ai-cal] model probe failing" issue stays open after its model recovered, because the only closer reads 40 rows once a day',
  'qnfo-lifecycle backlogMod (the folded qnfo-backlog-exec) runs on the 02:00 UTC tick and reads LIMIT 40 open issues ordered by priority then oldest updated_at; with more than 40 older high-priority issues open the newest model-health rows are never in the window, and its predicate treated a failing model as recovered',
  'MODEL-HEALTH-SWEEP-1 (qnfo-lifecycle 1.13.0): the same predicate over only the two model-health title families on every hourly tick, and a failing model counts as not recovered; fm-model-health-issue-stale reports any that remain',
  'the fm-model-health-issue-stale contract counts open "[ai-cal] model probe failing" issues older than 120 minutes whose model reads ok in ai_model_health and is absent from the failing and drift lists of every calibration run of the last 90 minutes, expected 0',
  'fm-model-health-issue-stale', '2026-10-19', 100238,
  'a model fails its calibration probe, qnfo-ai-calibration files the issue, the model recovers',
  'issues_open_over_120m and v_issue_dead_end list model-health rows whose condition cleared hours ago',
  'the high-priority backlog (six rows on 2026-10-19) and the issue SLA of 120 minutes');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-model-health-issue-stale', NULL, 'MODEL-HEALTH-SWEEP-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM agent_issues a WHERE a.status = ''open'' AND a.title LIKE ''[ai-cal] model probe failing: %'' AND a.created_at < (CAST(strftime(''%s'', ''now'') AS INTEGER) - 7200) * 1000 AND EXISTS (SELECT 1 FROM ai_model_health h WHERE h.model_id = trim(substr(a.title, instr(a.title, '': '') + 2)) AND h.status = ''ok'') AND EXISTS (SELECT 1 FROM ai_calibration_runs r WHERE r.ts > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 5400) * 1000) AND NOT EXISTS (SELECT 1 FROM ai_calibration_runs r WHERE r.ts > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 5400) * 1000 AND instr(r.digest, ''"'' || trim(substr(a.title, instr(a.title, '': '') + 2)) || ''"'') > 0)) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-lifecycle', 1, 'active', 'failure-mode', datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'a model-health issue whose named models read ok is stale, and a closer that reads 40 rows once a day cannot keep the 120 minute issue SLA for rows filed after the 40 oldest',
  'MODEL-HEALTH-SWEEP-1: qnfo-lifecycle 1.13.0 runs the daily member''s model-health predicates on every hourly tick over the "[ai-cal] model probe failing" and MODEL-DEGRADED issues only, treats a failing model as not recovered, and closes with issue_triage.close_evidence naming the models; registry rows: control model-health-sweep, failure mode model-health-issue-stale and its detector',
  'qnfo-audit 2026-10-19 21:5xZ read-only: agent_issues 100151, 100238 to 100241 and 100262 open since 17:15Z to 21:15Z; ai_model_health all ok since 20:30Z; ai_calibration_runs 21:00Z and 21:30Z passed 6 of 6; backlog-exec job-run events show processed 40, rechecked 40, closed 0 on the runs of 10-16 to 10-18; migrations/model-health-sweep.test.mjs and qnfo-lifecycle/model-health-sweep.test.mjs',
  'migration merged', 'agent_issues of the two model-health title families (close only), one control_registry row, one failure mode and one detector contract; no stored model state changes',
  'revert qnfo-lifecycle to 1.12.1 or set ops_config model_health_sweep = off; the Rollback header removes the registry rows',
  'a model-health issue closes within the hour after its models recover, with the evidence in close_evidence',
  'issues_open_over_120m <= 160 within 12 h',
  'none',
  'd1:qnfo-audit read-only (ai_model_health, ai_calibration_runs, agent_issues, cloud_ops_events), the backlog member source, node:sqlite fixtures'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'MODEL-HEALTH-SWEEP-1:') = 1);
