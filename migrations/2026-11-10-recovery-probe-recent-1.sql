-- RECOVERY-PROBE-RECENT-1 (charter pillar autonomy): review-gate on PR 10154 (Medium): the four recovery probes counted every failed code task that ever carried the
-- Closes the review-gate Medium on PR 10154; the remaining refiles are tracked in issue 10153.
-- recovery marker, so one old failure keeps the detector red forever and LOOP-BREAKER-1 refiles it. The probe now counts failures from the last 24 hours only.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = replace(verify_probe, ' AND updated_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')', '') WHERE class IN ('fm-web-search-stale-patch','fm-upstream-429-stale-patch','fm-ipatent-task-search-recovery','fm-trace-fold-stale-patch-snapshot');
UPDATE remediation_contracts
SET verify_probe = replace(verify_probe, ' AND status IN (''failed'', ''needs_human'', ''publish_failed'')', ' AND status IN (''failed'', ''needs_human'', ''publish_failed'') AND updated_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')')
WHERE class IN ('fm-web-search-stale-patch','fm-upstream-429-stale-patch','fm-ipatent-task-search-recovery','fm-trace-fold-stale-patch-snapshot')
  AND instr(verify_probe, 'updated_at >') = 0;
