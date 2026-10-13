-- Q08-ANALYSIS-DEPTH-1 follow-up (2026-10-13, pillar reach). 2026-10-13-q08-analysis-pruned-failure-mode.sql (PR 1152) inserted the
-- detector contract fm-outward-prose-analysis-pruned with status 'holding' and no next_due_at, so it never ran and fm-detector-parked read
-- recurring at 16:07Z (it was the only parked fm- contract). The two failure-mode contracts filed earlier the same day are 'active'; this
-- one joins them and is due now.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = 'holding', next_due_at = NULL WHERE class = 'fm-outward-prose-analysis-pruned';
UPDATE remediation_contracts SET status = 'active', next_due_at = strftime('%Y-%m-%d %H:%M:%S', 'now') WHERE class = 'fm-outward-prose-analysis-pruned' AND status = 'holding';
