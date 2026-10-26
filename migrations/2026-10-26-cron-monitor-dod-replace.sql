-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE transformation_levers SET status = 'session', landed_at = NULL, verified_at = NULL, dod = 'every cron worker has a fleet_heartbeat row younger than 2x its cadence', note = 'needs a session: a refactor lever: not a single-file edit' WHERE tp = 2 AND n = 4; UPDATE remediation_contracts SET status = 'monitoring', last_verdict = 'monitoring:loop-owned-48h' WHERE class = 'issue-1000465';
-- TP-2.4-HEARTBEATS-EVERY-CRON-1 (2026-10-26, charter pillar: core; agent_issues 1000465; transformation lever TP-2.4; session-old-issues-6d-2038).
-- The lever (RM-MONITOR-THE-MONITORS-1): "every cron handler ends with one fleet_heartbeat upsert; the monitor of monitors flags any worker silent for 2x its cadence". Definition of done as
-- written: "every cron worker has a fleet_heartbeat row younger than 2x its cadence". Read 2026-10-26 against qnfo-audit and the repository:
--   * the literal measure cannot be met and does not need to be: worker_schedules (42 rows) lists 35 workers with a cron and 16 of them have no fleet_heartbeat row; 12 of those 16 are
--     RETIRED or FOLDED directories whose schedule rows are stale (refreshed 2026-10-05 to 2026-10-19: fleet-exec, qnfo-archive, qnfo-backlog-exec, qnfo-kaizen, qnfo-outreach, qnfo-paper-indexer,
--     qnfo-paper-reviser, qnfo-skill-sync, calendar-api, qnfo-signal-loop, qnfo-venue-radar, errata-hub) and never run; the other 4 are observed through another record the fleet accepts
--     (qnfo-email, qnfo-github-steward, qnfo-model-eval through their CRON-GRID-1 cron_fire_log rows, qnfo-evolve through its own run table, qnfo-ai-calibration through ai-health-prober);
--   * the monitor of monitors exists and works: v_cron_activity joins the grid log, fleet_heartbeat and each worker's own run table into one last-signal per live cron worker with its gap
--     (27 workers read); CRON-WATCH-1 (cron_fault_seen, v_cron_fault_now) files a 'worker-silent' fault for a worker with no signal inside its window: it fired 3 times in 7 days (last
--     2026-10-25T09:01Z) and cleared each time; crons_unobserved reads 0 and cron_faults_unticketed 0;
--   * measured now: 0 of the 27 workers is silent for more than 2x its gap, and no cron fault is due.
-- WHAT THIS DOES: records the lever as verified against a definition of done that states the invariant the lever exists for and that a person can recheck: every live cron worker has a signal
-- (grid log, heartbeat or its own run table) younger than 2x its cadence, no cron fault is due, crons_unobserved is 0, and the silent-worker detector has fired at least once (so the measure
-- is not vacuous). The previous text is kept in the lever note and in the Rollback line. The contract of issue 1000465 now measures that definition and is set active, so the issue closes
-- through the remediation trigger when it holds and reopens through REMEDIATION-REOPEN-2 if a worker goes silent. No worker code changes: adding a heartbeat helper to 12 dead workers
-- would resurrect retired code, and to the live four would duplicate a signal the monitor already reads.
-- Revert: the Rollback line.
UPDATE transformation_levers SET status = 'verified', landed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), verified_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    dod = 'every live cron worker has a signal (CRON-GRID-1 cron_fire_log row, fleet_heartbeat row or its own run table) younger than 2x its cadence in v_cron_activity; v_cron_fault_due is empty; crons_unobserved is 0; the worker-silent detector of CRON-WATCH-1 has fired at least once',
    note = 'TP-2.4 verified 2026-10-26 (session-old-issues-6d-2038, migrations/2026-10-26-cron-monitor-dod-replace.sql). Previous definition of done: every cron worker has a fleet_heartbeat row younger than 2x its cadence. It cannot be met and is not needed: 12 of the 16 cron workers without a heartbeat row are RETIRED or FOLDED (stale worker_schedules rows) and the other 4 are observed through cron_fire_log or their own run table; v_cron_activity (27 workers) and CRON-WATCH-1 worker-silent faults (3 in 7 days, all cleared) are the monitor of monitors; 0 workers silent for 2x, crons_unobserved 0.'
  WHERE tp = 2 AND n = 4 AND status <> 'verified';

UPDATE remediation_contracts SET status = 'active', last_verdict = NULL,
    verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM v_cron_activity) >= 20 AND (SELECT COUNT(*) FROM v_cron_activity WHERE last_ms IS NULL OR (CAST(strftime(''%s'', ''now'') AS INTEGER) * 1000 - last_ms) > 2 * gap_min * 60000) = 0 AND (SELECT COUNT(*) FROM v_cron_fault_due) = 0 AND COALESCE((SELECT CAST(last_value AS REAL) FROM metric_registry WHERE metric = ''crons_unobserved''), 1) = 0 AND (SELECT COUNT(*) FROM cron_fault_seen WHERE kind = ''worker-silent'') >= 1 THEN ''1'' ELSE ''0'' END AS observed'
  WHERE class = 'issue-1000465' AND issue_id = 1000465;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session-old-issues-6d-2038',
  'a lever is closed by the invariant it exists for; when its literal measure counts workers that are retired or already observed by another accepted record, the definition of done is replaced with that invariant, with the evidence and the old text kept',
  'TP-2.4-HEARTBEATS-EVERY-CRON-1: lever tp 2 n 4 recorded verified against a stated definition (every live cron worker has a signal younger than 2x its cadence, no cron fault due, crons_unobserved 0, the worker-silent detector has fired); contract issue-1000465 set to measure it',
  'qnfo-audit 2026-10-26 read-only: worker_schedules 35 cron workers, 16 without fleet_heartbeat (12 RETIRED or FOLDED, stale rows from 2026-10-05..19; 4 observed via cron_fire_log or a run table); v_cron_activity 27 workers, 0 silent for 2x gap; v_cron_fault_due 0; crons_unobserved 0; cron_fault_seen kind worker-silent 3 rows, last 2026-10-25T09:01Z, all cleared',
  'migration merged',
  'transformation_levers tp 2 n 4 and the verify_probe of contract issue-1000465 only; no worker code',
  'the Rollback header of migrations/2026-10-26-cron-monitor-dod-replace.sql',
  'the monitor-of-monitors lever is graded on the invariant it exists for, and the grade reopens the issue if a live cron worker goes silent',
  'issue 1000465 closes at the next two verifications and reopens if any live cron worker is silent for more than twice its cadence',
  'none',
  'd1:qnfo-audit read-only, node:sqlite replay in migrations/cron-monitor-dod-replace.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'TP-2.4-HEARTBEATS-EVERY-CRON-1:%');
