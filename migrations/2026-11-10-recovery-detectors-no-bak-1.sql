-- RECOVERY-DETECTOR-NO-BAK-1 (charter pillar: autonomy). Four 2026-11-03 failure-mode detectors joined a bak_20261103_* backup table that
-- no longer exists in qnfo-audit, so each probe errored "no such table" every run and LOOP-BREAKER-1 filed it again (issues 10136, 10146, 10147, 10153).
-- The probe now reads the live recovery marker in code_tasks.ctx and needs no backup table.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, ''0'' AS observed' WHERE class IN ('fm-web-search-stale-patch','fm-upstream-429-stale-patch','fm-ipatent-task-search-recovery','fm-trace-fold-stale-patch-snapshot');

UPDATE remediation_contracts SET verify_probe =
  'SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM code_tasks WHERE json_extract(ctx, ''$.recovery'') = ''WEB-SEARCH-TASK-RECOVERY-1'' AND status IN (''failed'', ''needs_human'', ''publish_failed'')'
WHERE class = 'fm-web-search-stale-patch';
UPDATE remediation_contracts SET verify_probe =
  'SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM code_tasks WHERE json_extract(ctx, ''$.recovery'') = ''UPSTREAM-429-TASK-RECOVERY-1'' AND status IN (''failed'', ''needs_human'', ''publish_failed'')'
WHERE class = 'fm-upstream-429-stale-patch';
UPDATE remediation_contracts SET verify_probe =
  'SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM code_tasks WHERE json_extract(ctx, ''$.recovery'') = ''IPATENT-TASK-RECOVERY-1'' AND status IN (''failed'', ''needs_human'', ''publish_failed'')'
WHERE class = 'fm-ipatent-task-search-recovery';
UPDATE remediation_contracts SET verify_probe =
  'SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM code_tasks WHERE json_extract(ctx, ''$.recovery'') = ''TRACE-FOLD-PATCH-REQUEUE-1'' AND status IN (''failed'', ''needs_human'', ''publish_failed'')'
WHERE class = 'fm-trace-fold-stale-patch-snapshot';
