-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = 'holding', next_due_at = NULL WHERE class IN ('fm-write-200-only', 'fm-watchdog-action-blind') AND status = 'active'
-- DETECTORS-ACTIVE-20261013 (pillar autonomy; failure modes detector-parked recurring at 12:46 UTC, write-200-only and
-- watchdog-action-blind unprobed). migrations/2026-10-13-ci-action-identity.sql (PR 1080) inserted its two code-read detectors with
-- status 'holding'. A standing detector is never parked (DETECTOR-NEVER-PARKS-2): the remediation consumer runs a holding contract only
-- for runner-https, so neither detector has ever run, and fm-detector-parked reads failing. Both are made active and due now; their
-- probes, cadence and owner are unchanged.
UPDATE remediation_contracts SET status = 'active', next_due_at = datetime('now')
WHERE class IN ('fm-write-200-only', 'fm-watchdog-action-blind') AND status = 'holding';
