-- FM-DETECTOR-ACCURACY-1 (2026-10-28, charter pillar autonomy; owner directive 2026-10-28: audit and remediate all failure modes and their root causes).
-- Evidence (read-only audit of the 49 recurring failure modes, 2026-10-28 ~17:00Z): four detectors measure something other than their defect.
--  fm-code-task-claim-held-unstarted: compares code_tasks.created_at (space format, e.g. '2026-10-28 14:36:48') to an ISO 'T' string; a space sorts before T, so every same-day row counts as old. Observed 5, truly over 3 h: 1.
--  fm-code-refusal-not-repaired: counts tasks that DID get a repair attempt (repair_round 1) and then ended with NO-PROGRESS-CEILING-1 after 2 failed attempts; the defect is "ended without a second attempt".
--  fm-research-exec-stalled: counts a daily-budget hold (cloud_ops_events kind research-budget, COST-SUSTAIN-1) as a stall; qnfo-cloud-ops already treats it as not a stall (RESEARCH-WATCHDOG-HELD-1).
--  fm-q08-prune-floor-revision-loop: counts deferred engine runs as finished runs; the revision loop it guards is gate-failed runs, not deferrals.
-- Each probe still fails on its real defect. No row is deleted and no threshold is raised. Prediction: the first three read 0 at the next probe (claim-held 1 stays red until ct_im1000647 starts); read status in v_failure_mode_status.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261028_fm_detector_accuracy
-- Rollback: UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261028_fm_detector_accuracy b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261028_fm_detector_accuracy);

CREATE TABLE IF NOT EXISTS bak_20261028_fm_detector_accuracy AS
SELECT class, verify_probe FROM remediation_contracts
WHERE class IN ('fm-code-task-claim-held-unstarted','fm-code-refusal-not-repaired','fm-research-exec-stalled','fm-q08-prune-floor-revision-loop');

UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE status = ''queued'' AND COALESCE(attempts, 0) = 0 AND replace(replace(created_at, ''T'', '' ''), ''Z'', '''') < datetime(''now'', ''-3 hours'')) AS TEXT) AS observed'
WHERE class = 'fm-code-task-claim-held-unstarted';

UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE status = ''failed'' AND created_at > ''2026-10-12T13:07:00Z'' AND (COALESCE(last_error, '''') LIKE ''%goal review (%'' OR COALESCE(last_error, '''') LIKE ''%required check(s) failed%'') AND COALESCE(last_error, '''') NOT LIKE ''NO-PROGRESS-CEILING-1%'' AND COALESCE(json_extract(ctx, ''$.repair_round''), 0) < 2 AND attempts < 8) AS TEXT) AS observed'
WHERE class = 'fm-code-refusal-not-repaired';

UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM research_queue WHERE status IN (''queued'', ''researching'')) AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''done'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'')) AND NOT EXISTS (SELECT 1 FROM cloud_ops_events WHERE job = ''qnfo-research-exec'' AND kind = ''research-budget'' AND ts > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'')) THEN ''1'' ELSE ''0'' END AS observed'
WHERE class = 'fm-research-exec-stalled';

UPDATE remediation_contracts SET verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM engine_runs WHERE ran_at > datetime(''now'', ''-24 hours'') AND status NOT IN (''deferred'', ''skipped'')) < 12 OR (SELECT COUNT(*) FROM published_pieces WHERE published_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) > 0 THEN ''1'' ELSE ''0'' END AS observed'
WHERE class = 'fm-q08-prune-floor-revision-loop';
