-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = replace(verify_probe, ' AND ran_at >= datetime(''now'', ''-24 hours'')', '') WHERE class IN ('fm-q08-analysis-marker-rejected', 'fm-q08-verdict-line-missing', 'fm-writer-reasoning-models-excluded'); UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT sla_min FROM queue_sla WHERE stuck_type = ''outreach-needs-email'') = 4380 AND (SELECT sql FROM sqlite_master WHERE name = ''v_stuck_summary'') LIKE ''%-4380 minutes%'' THEN ''1'' ELSE ''0'' END AS observed' WHERE class = 'fm-stuck-view-sla-drift'; DELETE FROM decision_log WHERE instr(action, 'DETECTOR-ROLLING-1:') = 1
-- DETECTOR-ROLLING-1 (2026-10-14, pillar autonomy; metric failure_modes_recurring). Two failure-mode detectors read "recurring" for a reason that
-- is not a recurrence:
-- 1. Three q08 detectors count engine_runs errors from their fix date for ever, so one occurrence latches the detector red with no way back:
--    fm-q08-analysis-marker-rejected has read 1 since run 390 (2026-10-13 21:04) and will read 1 for good. These count events (run errors), not
--    live state, so they get the fleet's existing pattern (fm-code-window-long-line, fm-hourly-fanout-double): the fix date AND a rolling
--    window, here 24 hours. A recurrence still reads red for a day. Detectors that count live published content keep their fixed start,
--    because a defective piece stays live until it is fixed.
-- 2. fm-stuck-view-sla-drift asserted the outreach SLA was 4380 minutes. The owner directive of 2026-10-14 (no SLA over 120 minutes, SLA-120M-3)
--    set it to 120 and the view to match, so the detector failed while the defect it guards (the view disagreeing with queue_sla) was absent.
--    It now checks parity: the view's outreach window equals the queue_sla minutes, whatever they are.
-- Data only: no trigger is created or dropped. remediation_probe_edit_rerun re-runs each edited probe at once.
UPDATE remediation_contracts SET verify_probe = replace(verify_probe, 'ran_at >= ''2026-10-13 16:20:00''', 'ran_at >= ''2026-10-13 16:20:00'' AND ran_at >= datetime(''now'', ''-24 hours'')')
WHERE class = 'fm-q08-analysis-marker-rejected' AND instr(verify_probe, '-24 hours') = 0;
UPDATE remediation_contracts SET verify_probe = replace(verify_probe, 'ran_at >= ''2026-10-13 17:15:00''', 'ran_at >= ''2026-10-13 17:15:00'' AND ran_at >= datetime(''now'', ''-24 hours'')')
WHERE class = 'fm-q08-verdict-line-missing' AND instr(verify_probe, '-24 hours') = 0;
UPDATE remediation_contracts SET verify_probe = replace(verify_probe, 'ran_at >= ''2026-10-13 19:00:00''', 'ran_at >= ''2026-10-13 19:00:00'' AND ran_at >= datetime(''now'', ''-24 hours'')')
WHERE class = 'fm-writer-reasoning-models-excluded' AND instr(verify_probe, '-24 hours') = 0;
UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN instr((SELECT sql FROM sqlite_master WHERE name = ''v_stuck_summary''), ''outreach_queue WHERE status IN'') > 0 AND instr((SELECT sql FROM sqlite_master WHERE name = ''v_stuck_summary''), ''< datetime(''''now'''', ''''-'' || (SELECT sla_min FROM queue_sla WHERE stuck_type = ''outreach-needs-email'') || '' minutes'''') OR COALESCE(attempts, 0) >= 3'') > 0 THEN ''1'' ELSE ''0'' END AS observed'
WHERE class = 'fm-stuck-view-sla-drift';
UPDATE failure_modes SET detector = 'v_stuck_summary.outreach_waiting uses the same minutes as queue_sla outreach-needs-email (parity, whatever the SLA is)'
WHERE fm_key = 'stuck-view-sla-drift';
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a detector reads red only while its failure mode is present: an event detector counts a recent window, and a parity detector checks the parity, not one value of it',
  'DETECTOR-ROLLING-1: three q08 engine_runs detectors count their fix date and the last 24 hours; fm-stuck-view-sla-drift checks queue_sla and view parity',
  'fm-q08-analysis-marker-rejected latched at 1 by run 390 (2026-10-13 21:04); fm-stuck-view-sla-drift failed after SLA-120M-3 set outreach-needs-email to 120 minutes with the view at 120',
  'applied by apply-migrations', 'four detector contracts', 'see the Rollback header',
  'failure_modes_recurring counts only failure modes that are present now',
  'fm-q08-analysis-marker-rejected and fm-stuck-view-sla-drift read pass within 30 minutes of the apply', 'none', 'd1:qnfo-audit remediation_contracts, queue_sla, v_stuck_summary; d1:q08-signal engine_runs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'DETECTOR-ROLLING-1:') = 1);
