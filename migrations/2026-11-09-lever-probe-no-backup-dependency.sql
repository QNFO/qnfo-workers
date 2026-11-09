-- LOOP-BREAKER-1 (issues 9285, 9649; agent_issues 1002596, 1002661; pillar autonomy).
-- The fm-metric-lever-nonactionable contract read its request watermark from the backup table
-- bak_20261102_metric_lever_validation. That table was removed by the backup sweep, so every probe run
-- failed with "no such table" and the loop breaker re-filed the same failure. A probe must not depend on a
-- backup table that retention can drop: the watermark is now the literal id (first cf_agent_requests row of 2026-11-02).
-- Prediction: the signature (class=fm-metric-lever-nonactionable, "no such table") has no new occurrence for 6 hours after apply.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = replace(verify_probe, '(SELECT 1082)', 'COALESCE((SELECT request_watermark FROM bak_20261102_metric_lever_validation WHERE id = ''management-personas''), 0)') WHERE class = 'fm-metric-lever-nonactionable';

UPDATE remediation_contracts
SET verify_probe = replace(
  verify_probe,
  'COALESCE((SELECT request_watermark FROM bak_20261102_metric_lever_validation WHERE id = ''management-personas''), 0)',
  '(SELECT 1082)')
WHERE class = 'fm-metric-lever-nonactionable'
  AND instr(verify_probe, 'bak_20261102_metric_lever_validation') > 0;
