-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261014_sla_drain_2_triage
-- Rollback: UPDATE agent_issues SET status = 'open', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id IN (1716, 1760, 1818, 1951, 1952, 1953, 1996, 2196, 2544); UPDATE remediation_contracts SET status = 'active' WHERE class IN ('issue-1716', 'issue-1760', 'issue-1818', 'issue-1951', 'issue-1952', 'issue-1953', 'issue-1996', 'issue-2196', 'issue-2544'); DELETE FROM issue_triage WHERE issue_id IN (1716, 1760, 1818, 1951, 1952, 1953, 1996, 2196, 2544) AND rc = 'SLA-DRAIN-2'; INSERT OR REPLACE INTO issue_triage SELECT * FROM bak_20261014_sla_drain_2_triage; DELETE FROM goals WHERE source LIKE 'agent_issues % (SLA-DRAIN-2, ISSUE-SLA-2H-1)';
-- SLA-DRAIN-2 (2026-10-14, pillars reach and personal), following ROADMAP-TO-GOALS-1 (migrations/2026-10-14-06-roadmap-to-goals.sql).
-- Owner directives: "Audit all SLAs and accelerate to drain all queues and backlogs" (2026-10-14), and ISSUE-SLA-2H-1 (2026-10-13): "A
-- finding that is not a defect (a roadmap item, a report) belongs in goals or objective_space with the successor id, never closed as
-- wontfix." issues_open_over_120m read 106 at 06:35Z; the seven oldest that are not transformation levers describe new capabilities,
-- not defects, and their probes read fail only because the capability has not been built:
--   1716 Q08-REVIEW-2026-10-31   a dated decision; qnfo-fleet-dashboard q08Review takes it on its own at the due date
--   1760 Q08-SELF-TUNE-1         a self-tuning loop for q08 (feature)
--   1818 TWIN-FRONTIER-MODEL-1   twin answer quality vs frontier assistants (lever a done by TWIN-FLASH-1; lever b split to 1996)
--   1951 CONNECTION-LEDGER-1     calendar answers become Ledger people (feature)
--   1952 RADAR-TASTE-LEARN-1     radar learns from feedback (feature)
--   1953 CONNECTION-ENGAGEMENT-1 a new metric for answered owner questions (feature)
--   1996 TWIN-NATIVE-TOOLS-1     native function calling for the twin (feature)
-- Each becomes an adopted goals row that keeps the issue's probe as its DoD and names its doer, and the issue closes with close_evidence
-- naming the goal (the triage triggers set its contract to superseded). Transformation lever issues (1779, 2007, 2008) stay open, as
-- ROADMAP-TO-GOALS-1 decided, and so do 1857 (its closing condition is a live mail check) and 2036 (a concrete one-file code change).

CREATE TABLE IF NOT EXISTS bak_20261014_sla_drain_2_triage AS SELECT * FROM issue_triage WHERE issue_id IN (1716, 1760, 1818, 1951, 1952, 1953, 1996, 2196, 2544);

INSERT OR IGNORE INTO goals (goal_key, statement, goal_type, parent_objective, alignment, source, priority, status, dod, owner, adopted_at, program_code)
SELECT substr(a.title, 1, instr(a.title, ':') - 1), a.title, 'instrumental',
  'mission',
  'enhancement moved from the issue queue by SLA-DRAIN-2 (ISSUE-SLA-2H-1); the issue text keeps the full specification',
  'agent_issues ' || a.id || ' (SLA-DRAIN-2, ISSUE-SLA-2H-1)', 2, 'adopted',
  'Done when this query reads its expected value: ' || COALESCE(c.verify_probe, '(no probe)'),
  CASE a.id WHEN 1716 THEN 'qnfo-fleet-dashboard q08Review (due 2026-10-31)' WHEN 1760 THEN 'q08-signal-engine' WHEN 1952 THEN 'radar-hub'
            WHEN 1953 THEN 'personal-companion' ELSE 'personal-api' END,
  datetime('now'), CASE WHEN a.id IN (1716, 1760) THEN 'QNFO.OPS' ELSE NULL END
FROM agent_issues a LEFT JOIN remediation_contracts c ON c.class = 'issue-' || a.id
WHERE a.id IN (1716, 1760, 1818, 1951, 1952, 1953, 1996) AND a.status = 'open' AND instr(a.title, ':') > 1;

INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'SLA-DRAIN-2', 'closed', g.owner, datetime('now'),
  'superseded by goal ' || g.goal_key || ' (goals.id ' || g.id || '): an enhancement, not a defect (owner directive ISSUE-SLA-2H-1); the goal keeps this issue''s probe as its DoD and ' || g.owner || ' as its doer. Closed by migrations/2026-10-14-sla-drain-2-roadmap-to-goals.sql.'
FROM agent_issues a JOIN goals g ON g.source = 'agent_issues ' || a.id || ' (SLA-DRAIN-2, ISSUE-SLA-2H-1)'
WHERE a.id IN (1716, 1760, 1818, 1951, 1952, 1953, 1996) AND a.status = 'open'
ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence, triage_state = 'closed', rc = excluded.rc;

UPDATE agent_issues SET status = 'closed', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id IN (1716, 1760, 1818, 1951, 1952, 1953, 1996) AND status = 'open'
  AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = agent_issues.id AND t.rc = 'SLA-DRAIN-2' AND t.close_evidence LIKE 'superseded by %');

UPDATE remediation_contracts SET status = 'superseded'
WHERE class IN ('issue-1716', 'issue-1760', 'issue-1818', 'issue-1951', 'issue-1952', 'issue-1953', 'issue-1996')
  AND EXISTS (SELECT 1 FROM agent_issues a WHERE 'issue-' || a.id = remediation_contracts.class AND a.status = 'closed');

-- Two metric-trigger issues lost their trigger when SLA-120M-2 and SLA-120M-6 replaced the 24-hour metrics with 120-minute ones
-- (triggers 3062 and 5796 disabled); their successors are open on the enabled triggers.
INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT id, 'SLA-DRAIN-2', 'closed', 'qnfo-fleet-control', datetime('now'),
  CASE id WHEN 2196 THEN 'superseded by 2568 (METRIC-TRIGGER-5937 issues_open_over_120m, open): trigger 3062 on issues_open_over_24h was disabled by SLA-120M-2, which measures the same backlog at 120 minutes. Closed by migrations/2026-10-14-sla-drain-2-roadmap-to-goals.sql.'
          ELSE 'superseded by 2570 (METRIC-TRIGGER-5944 open_issues_without_doer_120m, open): trigger 5796 on open_issues_without_doer_24h was disabled by SLA-120M-6, which measures the same gap at 120 minutes. Closed by migrations/2026-10-14-sla-drain-2-roadmap-to-goals.sql.' END
FROM agent_issues WHERE id IN (2196, 2544) AND status = 'open'
  AND EXISTS (SELECT 1 FROM analytics_metric_triggers t WHERE t.id = CASE agent_issues.id WHEN 2196 THEN 3062 ELSE 5796 END AND t.enabled = 0)
ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence, triage_state = 'closed', rc = excluded.rc;
UPDATE agent_issues SET status = 'closed', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id IN (2196, 2544) AND status = 'open'
  AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = agent_issues.id AND t.rc = 'SLA-DRAIN-2' AND t.close_evidence LIKE 'superseded by %');
UPDATE remediation_contracts SET status = 'superseded'
WHERE class IN ('issue-2196', 'issue-2544')
  AND EXISTS (SELECT 1 FROM agent_issues a WHERE 'issue-' || a.id = remediation_contracts.class AND a.status = 'closed');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_015EF12jWvz4tFNB2zAHcdYC',
  'an issue that specifies a capability not yet built is a roadmap item; the owner directive puts it in goals with its successor id, and its doer is unchanged',
  'SLA-DRAIN-2: issues 1716, 1760, 1818, 1951, 1952, 1953, 1996 superseded by adopted goals rows that keep their probes as DoD; 2196 and 2544 (triggers disabled by SLA-120M) superseded by 2568 and 2570; levers 1779, 2007, 2008, check 1857 and code change 2036 stay open',
  'issues_open_over_120m 106 at 06:35Z; the seven are 8.5 to 12.8 days old, each probe reads fail because the capability is unbuilt, none is a transformation lever (transformation_levers.issue_id) and none has an open PR',
  'merged through the migration runner', 'seven agent_issues rows and their contracts; goals gains seven adopted rows', 'the Rollback header',
  'the open-issue queue holds defects; enhancements sit in goals with their DoD and doer',
  'open_agent_issues and issues_open_over_120m each fall by at least 7 at the next refresh; none of the seven reopens within 7 days',
  'none', 'd1:agent_issues, issue_triage, remediation_contracts, transformation_levers, goals; github open PRs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'SLA-DRAIN-2:') = 1);
