-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_invest_decision_duplicate
-- Rollback: UPDATE issue_triage SET triage_state = (SELECT triage_state FROM bak_20261101_invest_decision_duplicate WHERE issue_id = 2124 LIMIT 1), close_evidence = (SELECT close_evidence FROM bak_20261101_invest_decision_duplicate WHERE issue_id = 2124 LIMIT 1) WHERE issue_id = 2124 AND EXISTS (SELECT 1 FROM bak_20261101_invest_decision_duplicate WHERE issue_id = 2124); UPDATE agent_issues SET status = (SELECT issue_status FROM bak_20261101_invest_decision_duplicate WHERE issue_id = 2124 LIMIT 1), close_channel = (SELECT issue_close_channel FROM bak_20261101_invest_decision_duplicate WHERE issue_id = 2124 LIMIT 1), updated_at = (SELECT issue_updated_at FROM bak_20261101_invest_decision_duplicate WHERE issue_id = 2124 LIMIT 1) WHERE id = 2124 AND EXISTS (SELECT 1 FROM bak_20261101_invest_decision_duplicate WHERE issue_id = 2124); UPDATE remediation_contracts SET status = (SELECT contract_status FROM bak_20261101_invest_decision_duplicate WHERE contract_class = remediation_contracts.class LIMIT 1), last_verdict = (SELECT contract_last_verdict FROM bak_20261101_invest_decision_duplicate WHERE contract_class = remediation_contracts.class LIMIT 1) WHERE issue_id = 2124 AND class IN (SELECT contract_class FROM bak_20261101_invest_decision_duplicate WHERE contract_class IS NOT NULL);
-- INVEST-DECISION-DUPLICATE-1 (issue 2124, charter pillar autonomy): REMEDIATION-REOPEN-2
-- reopened the duplicate after its old close evidence ("Duplicate of agent_issues 1836") did not
-- match the trigger's explicit superseded/moot dispositions. Keep 1836 as the canonical investment
-- decision record, close 2124 through triage with a recognized supersession, and retire its contracts.
CREATE TABLE IF NOT EXISTS bak_20261101_invest_decision_duplicate AS
SELECT a.id AS issue_id, a.status AS issue_status, a.close_channel AS issue_close_channel,
       a.updated_at AS issue_updated_at, t.triage_state, t.close_evidence,
       c.class AS contract_class, c.status AS contract_status, c.last_verdict AS contract_last_verdict
FROM agent_issues a
LEFT JOIN issue_triage t ON t.issue_id = a.id
LEFT JOIN remediation_contracts c ON c.issue_id = a.id
WHERE a.id = 2124;

UPDATE issue_triage
SET close_evidence = 'superseded by agent_issues 1836 (INVEST-DECISION-1; duplicate investment verdict record)',
    triage_state = 'closed'
WHERE issue_id = 2124
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 1836)
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 2124);

UPDATE remediation_contracts
SET status = 'superseded',
    last_verdict = 'superseded:INVEST-DECISION-DUPLICATE-1 by issue 1836'
WHERE issue_id = 2124
  AND status IN ('active', 'holding')
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 1836);

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'qnfo-fleet-control (issue 2124 remediation)',
       'issue 2124 is a duplicate of the canonical investment verdict issue 1836, and the relapse trigger requires explicit superseded evidence',
       'INVEST-DECISION-DUPLICATE-1: close issue 2124 through triage as superseded by issue 1836 and supersede its active contracts',
       'issue 2124 reopen record: its prior close evidence named issue 1836 as a duplicate; metric-relapse-2124 failed twice after closure',
       'issue 2124 is closed with evidence recognized by REMEDIATION-REOPEN-2; issue 1836 remains the sole investment verdict record',
       'issue 2124 triage and remediation contracts only',
       'Rollback restores issue, triage and contract values from bak_20261101_invest_decision_duplicate',
       'the recurring duplicate no longer reopens and the canonical issue remains actionable',
       'metric-relapse-2124 reopen count falls from 2 to 0; no change to issue 1836',
       'no external reach change',
       'D1 triage-close synchronization; REMEDIATION-REOPEN-2 superseded-evidence predicate; offline SQLite regression test'
WHERE NOT EXISTS (
  SELECT 1 FROM decision_log
  WHERE action LIKE 'INVEST-DECISION-DUPLICATE-1:%'
);
