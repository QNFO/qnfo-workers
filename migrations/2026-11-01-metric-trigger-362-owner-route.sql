-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE issue_triage SET owner = (SELECT b.owner FROM bak_20261101_metric_trigger_362_owner b WHERE b.issue_id = issue_triage.issue_id) WHERE issue_id IN (SELECT issue_id FROM bak_20261101_metric_trigger_362_owner);

CREATE TABLE IF NOT EXISTS bak_20261101_metric_trigger_362_owner AS
SELECT issue_id, owner FROM issue_triage
WHERE issue_id = 1798 AND owner = 'qnfo-kaizen';

UPDATE issue_triage SET owner = 'qnfo-fleet-control'
WHERE issue_id = 1798 AND owner = 'qnfo-kaizen'
  AND EXISTS (
    SELECT 1 FROM agent_issues
    WHERE id = 1798 AND status = 'open' AND title LIKE 'METRIC-TRIGGER-362-%'
  )
  AND EXISTS (
    SELECT 1 FROM service_registry
    WHERE service = 'qnfo-fleet-control' AND state = 'live'
  );
