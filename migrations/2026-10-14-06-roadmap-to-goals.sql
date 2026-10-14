-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status = 'open', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000 WHERE id IN (2004, 2010, 2011, 2012, 2014, 2015, 2025, 2324, 2524); UPDATE remediation_contracts SET status = 'active' WHERE class IN ('issue-2004', 'issue-2010', 'issue-2011', 'issue-2012', 'issue-2014', 'issue-2015', 'issue-2025', 'issue-2324', 'issue-2524'); UPDATE issue_triage SET close_evidence = (SELECT b.close_evidence FROM bak_20261014_roadmap_triage b WHERE b.issue_id = issue_triage.issue_id), triage_state = COALESCE((SELECT b.triage_state FROM bak_20261014_roadmap_triage b WHERE b.issue_id = issue_triage.issue_id), triage_state) WHERE issue_id IN (2004, 2010, 2011, 2012, 2014, 2015, 2025, 2324, 2524); DELETE FROM goals WHERE source LIKE '%ROADMAP-TO-GOALS-1%'; DELETE FROM decision_log WHERE instr(action, 'ROADMAP-TO-GOALS-1:') = 1
-- ROADMAP-TO-GOALS-1 (2026-10-14, pillar autonomy). Owner directive 2026-10-13 (ISSUE-SLA-2H-1): "A finding that is not a defect (a roadmap
-- item, a report) belongs in goals or objective_space with the successor id, never closed as wontfix."
-- Seven agent_issues rows are the parent items of the transformation program (docs/TRANSFORMATION-PROGRAM.md T1, T3, T4, T5, T6, T7,
-- T9). Each is a multi-week program goal whose exit is a 14-day or 30-day metric window, not a defect. They become goals rows, each
-- keeping its exit condition as the DoD query. Their doer is unchanged: TRANSFORMATION-LOOP-1 in qnfo-fleet-control reads
-- transformation_levers and the exit metrics, never these issue rows, and lever issues it adopted (2007, 2008, 1779) stay open
-- because their closure would count as a landing.
-- Two more items carry no work of their own:
--   2324 is the weekly doctrine audit report; its lever (single points of failure) is carried by open issue 2201.
--   2524 is a session handoff whose remaining item is open issue 2397.
-- Each issue closes with close_evidence naming its successor. Each contract is set to superseded (the 140 rows already in that
-- state follow the same rule), so no probe reopens a superseded issue. Old triage rows are kept in bak_20261014_roadmap_triage.
CREATE TABLE IF NOT EXISTS bak_20261014_roadmap_triage AS SELECT * FROM issue_triage WHERE issue_id IN (2004, 2010, 2011, 2012, 2014, 2015, 2025, 2324, 2524);
INSERT OR IGNORE INTO goals (goal_key, statement, goal_type, parent_objective, alignment, source, priority, status, dod, owner, adopted_at, program_code)
SELECT substr(a.title, 1, instr(a.title, ':') - 1), a.title, 'instrumental', 'transformation-program',
  'docs/TRANSFORMATION-PROGRAM.md; doer TRANSFORMATION-LOOP-1 (transformation_levers, wave exit metrics)',
  'agent_issues ' || a.id || ' (ROADMAP-TO-GOALS-1, ISSUE-SLA-2H-1)', 1, 'adopted',
  'Done when this query reads ok or 1: ' || COALESCE(c.verify_probe, '(no probe)'),
  'qnfo-fleet-control TRANSFORMATION-LOOP-1', datetime('now'), 'QNFO.OPS'
FROM agent_issues a LEFT JOIN remediation_contracts c ON c.class = 'issue-' || a.id
WHERE a.id IN (2004, 2010, 2011, 2012, 2014, 2015, 2025) AND a.status = 'open' AND instr(a.title, ':') > 1;
INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'ROADMAP-TO-GOALS-1', 'closed', 'qnfo-fleet-control', datetime('now'),
  'superseded by goal ' || g.goal_key || ' (goals.id ' || g.id || '): a transformation-program roadmap item, not a defect (owner directive ISSUE-SLA-2H-1). The goal keeps this issue''s exit query as its DoD and TRANSFORMATION-LOOP-1 (transformation_levers, wave exit metrics) stays its doer. Closed by migrations/2026-10-14-06-roadmap-to-goals.sql.'
FROM agent_issues a JOIN goals g ON g.source = 'agent_issues ' || a.id || ' (ROADMAP-TO-GOALS-1, ISSUE-SLA-2H-1)'
WHERE a.id IN (2004, 2010, 2011, 2012, 2014, 2015, 2025) AND a.status = 'open'
ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence, triage_state = 'closed', rc = excluded.rc;
INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT id, 'ROADMAP-TO-GOALS-1', 'closed', 'qnfo-fleet-control', datetime('now'),
  CASE id
    WHEN 2324 THEN 'superseded by 2201 (METRIC-TRIGGER-3077-SPOFS-TOTAL, open): this weekly doctrine audit report named single points of failure as the weakest clause; 2201 carries that lever and its probe (spofs_total, 2 at closure: qnfo-research-exec single executor, GitHub Actions for CI and migrations). The next weekly audit files its own row. Closed by migrations/2026-10-14-06-roadmap-to-goals.sql.'
    ELSE 'superseded by 2397 (FLEET-HARDENING-2, open): this session handoff closes when 2516, 2523 and 2397 are closed; 2516 and 2523 are, so 2397 alone carries the remaining work. Closed by migrations/2026-10-14-06-roadmap-to-goals.sql.'
  END
FROM agent_issues WHERE id IN (2324, 2524) AND status = 'open'
ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence, triage_state = 'closed', rc = excluded.rc;
UPDATE agent_issues SET status = 'closed', updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id IN (2004, 2010, 2011, 2012, 2014, 2015, 2025, 2324, 2524) AND status = 'open'
  AND EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = agent_issues.id AND t.rc = 'ROADMAP-TO-GOALS-1' AND t.close_evidence LIKE 'superseded by %');
UPDATE remediation_contracts SET status = 'superseded'
WHERE class IN ('issue-2004', 'issue-2010', 'issue-2011', 'issue-2012', 'issue-2014', 'issue-2015', 'issue-2025', 'issue-2324', 'issue-2524')
  AND EXISTS (SELECT 1 FROM agent_issues a WHERE 'issue-' || a.id = remediation_contracts.class AND a.status = 'closed');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a multi-week program goal with a 14- or 30-day exit window is a roadmap item, not a defect; the owner directive puts it in goals with its successor id, and the doer that moves it (TRANSFORMATION-LOOP-1) never read the issue rows',
  'ROADMAP-TO-GOALS-1: transformation-program parent issues 2004, 2010, 2011, 2012, 2014, 2015, 2025 superseded by goals rows that keep their exit queries; report 2324 superseded by 2201 and handoff 2524 by 2397; lever issues 2007, 2008, 1779 stay open',
  'qnfo-fleet-control TRANSFORMATION-LOOP-1 source: wave state reads metric_registry and fleet_budget, landing reads transformation_levers.issue_id (2007, 2008, 1779 only); the nine contracts read pending on multi-week windows (worker_count 28 vs 24, fleet_ai_run_rate_30d_usd 129 vs 40, a 30-day window to 2026-11-05)',
  'merged through the canonical path (migration runner)', 'nine agent_issues rows and their contracts; goals gains seven adopted rows', 'the rollback line (reopens the issues, reactivates the contracts, restores triage, removes the goals)',
  'the open-issue queue holds defects only; program goals sit in goals with their exit queries and doer',
  'none of the nine issues is reopened in the 7 days after the merge, and open_agent_issues falls by at least 9 at the next refresh',
  'none', 'd1:agent_issues, remediation_contracts, transformation_levers, goals; code:qnfo-fleet-control TRANSFORMATION-LOOP-1'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'ROADMAP-TO-GOALS-1:') = 1);
