-- REM-A4-BP26-MAP-1 (2026-10-26, charter pillar autonomy; agent_issues 2993 PORTFOLIO-GAP no-mapped-work umbrella; follows qnfo-github-steward 0.9.1 PS-KEEP-CATALOGUE-PROJECT-1, PR 4862)
--
-- WHAT WAS MEASURED (qnfo-audit SELECT only, 2026-10-26 19:30Z)
--   portfolio_gaps holds five open non-infra no-mapped-work rows, all for the BP26 projects (BP26.AGENTOPS, COMPLIANCE, EDITORIAL, ENGINEERING, REACH); the umbrella contract (open non-infra rows = 0) reads 5. The best-practice catalogue
--   (migrations/2026-10-26-best-practice-catalogue.sql) mapped each of its 30 issues to its BP26 project in issue_project_map, and all 30 now map to W.qnfo-ops: qnfo-github-steward psPlace placed every open issue on
--   W.<triage owner or source> on each pass (INSERT ... ON CONFLICT DO UPDATE), whatever project it already sat on. The hourly re-filing of the umbrella (135 reopens) was a second defect, fixed by MANAGEMENT-PERSONAS-3 on 2026-10-26.
--
-- WHAT THIS FILE DOES (applied after the steward fix is live, so the old placement cannot undo it)
--   1. Saves the 30 rows of issue_project_map, the open no-mapped-work gap rows and the contract of issue-2993.
--   2. Maps the 30 catalogue issues back to their BP26 project (the list is the catalogue's own predicate_id to project table), only while the project is active and the issue still sits on a W.<worker> project.
--   3. Closes the open no-mapped-work gap rows whose project now has a mapped issue (the detector's own condition no longer holds; portfolio-autopilot would close them on 2026-10-28 otherwise).
--   4. Corrects the action text of the umbrella contract (the probe is unchanged: it already measures the defect) and logs the decision.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE issue_project_map SET project_code = (SELECT b.project_code FROM bak_20261026_rem_a4_portfolio_map b WHERE b.issue_id = issue_project_map.issue_id), program_code = (SELECT b.program_code FROM bak_20261026_rem_a4_portfolio_map b WHERE b.issue_id = issue_project_map.issue_id), updated_at = (SELECT b.updated_at FROM bak_20261026_rem_a4_portfolio_map b WHERE b.issue_id = issue_project_map.issue_id) WHERE issue_id IN (SELECT issue_id FROM bak_20261026_rem_a4_portfolio_map); UPDATE portfolio_gaps SET status = 'open', resolved_at = NULL WHERE kind = 'no-mapped-work' AND EXISTS (SELECT 1 FROM bak_20261026_rem_a4_portfolio_gaps b WHERE b.kind = portfolio_gaps.kind AND b.entity = portfolio_gaps.entity AND b.day = portfolio_gaps.day); UPDATE remediation_contracts SET action = (SELECT b.action FROM bak_20261026_rem_a4_portfolio_contract_2993 b WHERE b.class = remediation_contracts.class) WHERE class = 'issue-2993' AND EXISTS (SELECT 1 FROM bak_20261026_rem_a4_portfolio_contract_2993); DELETE FROM remediation_contracts WHERE class = 'fm-catalogue-mapping-overwritten'; DELETE FROM failure_modes WHERE fm_key = 'catalogue-mapping-overwritten'

CREATE TABLE IF NOT EXISTS bak_20261026_rem_a4_portfolio_map AS SELECT m.issue_id, m.project_code, m.program_code, m.kind, m.updated_at FROM issue_project_map m JOIN agent_issues a ON a.id = m.issue_id WHERE a.predicate_id LIKE 'BP26-%';
CREATE TABLE IF NOT EXISTS bak_20261026_rem_a4_portfolio_gaps AS SELECT * FROM portfolio_gaps WHERE kind = 'no-mapped-work' AND status = 'open';
CREATE TABLE IF NOT EXISTS bak_20261026_rem_a4_portfolio_contract_2993 AS SELECT * FROM remediation_contracts WHERE class = 'issue-2993';

-- 2. the 30 mappings (predicate_id of the catalogue issue -> project, program)
WITH want(predicate, project_code, program_code) AS (VALUES
  ('BP26-CLAIM-LEDGER', 'BP26.EDITORIAL', 'QNFO.RSCH'),
  ('BP26-CORRECTIONS-FEED', 'BP26.EDITORIAL', 'QNFO.RSCH'),
  ('BP26-PROVENANCE-MARKING', 'BP26.EDITORIAL', 'QNFO.RSCH'),
  ('BP26-STRUCTURED-DATA', 'BP26.EDITORIAL', 'QNFO.RSCH'),
  ('BP26-FORECAST-HYGIENE', 'BP26.EDITORIAL', 'QNFO.RSCH'),
  ('BP26-PAPER-PIDS', 'BP26.EDITORIAL', 'QNFO.RSCH'),
  ('BP26-WCAG22', 'BP26.EDITORIAL', 'QNFO.RSCH'),
  ('BP26-SOCIAL-AUTOMATION', 'BP26.REACH', 'QNFO.REACH'),
  ('BP26-AI-ACT-ART50', 'BP26.COMPLIANCE', 'QNFO.OPS'),
  ('BP26-GDPR-RECORDS', 'BP26.COMPLIANCE', 'QNFO.OPS'),
  ('BP26-DPIA', 'BP26.COMPLIANCE', 'QNFO.OPS'),
  ('BP26-RETENTION', 'BP26.COMPLIANCE', 'QNFO.OPS'),
  ('BP26-NO-TRACKING', 'BP26.COMPLIANCE', 'QNFO.OPS'),
  ('BP26-AI-ACT-ARTICLE4', 'BP26.COMPLIANCE', 'QNFO.OPS'),
  ('BP26-EMAIL-AUTH', 'BP26.REACH', 'QNFO.REACH'),
  ('BP26-WORKERS-BP-LINT', 'BP26.ENGINEERING', 'QNFO.INFRA'),
  ('BP26-D1-DISCIPLINE', 'BP26.ENGINEERING', 'QNFO.INFRA'),
  ('BP26-R2-KV-USAGE', 'BP26.ENGINEERING', 'QNFO.INFRA'),
  ('BP26-AI-GATEWAY-BUDGETS', 'BP26.ENGINEERING', 'QNFO.INFRA'),
  ('BP26-GRADUAL-DEPLOYS', 'BP26.ENGINEERING', 'QNFO.INFRA'),
  ('BP26-DURABLE-JOBS', 'BP26.ENGINEERING', 'QNFO.INFRA'),
  ('BP26-OBSERVABILITY', 'BP26.ENGINEERING', 'QNFO.INFRA'),
  ('BP26-SECRETS-MIN', 'BP26.ENGINEERING', 'QNFO.INFRA'),
  ('BP26-EDGE-SECURITY', 'BP26.ENGINEERING', 'QNFO.INFRA'),
  ('BP26-SLO-ERROR-BUDGETS', 'BP26.AGENTOPS', 'QNFO.OPS'),
  ('BP26-AGENT-CHANGE-GATES', 'BP26.AGENTOPS', 'QNFO.OPS'),
  ('BP26-PROMPT-INJECTION', 'BP26.AGENTOPS', 'QNFO.OPS'),
  ('BP26-EVALS', 'BP26.AGENTOPS', 'QNFO.OPS'),
  ('BP26-LEASES-KILLSWITCH', 'BP26.AGENTOPS', 'QNFO.OPS'),
  ('BP26-AUDIT-LOG', 'BP26.AGENTOPS', 'QNFO.OPS'))
UPDATE issue_project_map
   SET project_code = (SELECT w.project_code FROM want w JOIN agent_issues a ON a.predicate_id = w.predicate WHERE a.id = issue_project_map.issue_id),
       program_code = (SELECT w.program_code FROM want w JOIN agent_issues a ON a.predicate_id = w.predicate WHERE a.id = issue_project_map.issue_id),
       updated_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
 WHERE project_code LIKE 'W.%'
   AND EXISTS (SELECT 1 FROM want w JOIN agent_issues a ON a.predicate_id = w.predicate JOIN projects p ON p.project_code = w.project_code AND p.status = 'active' WHERE a.id = issue_project_map.issue_id);

-- 3. the gap rows whose project now has a mapped issue
UPDATE portfolio_gaps SET status = 'closed', resolved_at = COALESCE(resolved_at, datetime('now'))
 WHERE kind = 'no-mapped-work' AND status = 'open' AND EXISTS (SELECT 1 FROM issue_project_map m WHERE m.project_code = portfolio_gaps.entity);

-- 4. the umbrella contract's action text and the decision
UPDATE remediation_contracts SET module = 'rem-a4-portfolio', action = 'MEASURES the defect: counts the open no-mapped-work gaps outside QNFO.INFRA.* (derived stubs are expected there); 0 when every active non-derived project has an issue in issue_project_map. REM-A4-PORTFOLIO-1: the five BP26 projects lost their mapping because qnfo-github-steward placed every open issue on W.<owner> each pass (30 BP26 issues all on W.qnfo-ops); 0.9.1 PS-KEEP-CATALOGUE-PROJECT-1 keeps an issue on an active non-worker project, migrations/2026-10-26-rem-a4-bp26-map.sql restores the 30 mappings from the catalogue''s own predicate list and closes the gap rows they clear. The hourly re-filing of the umbrella was fixed by MANAGEMENT-PERSONAS-3 (the filer excludes QNFO.INFRA.* like this probe).'
 WHERE class = 'issue-2993' AND instr(action, 'VACUOUS-PROBE-V3-1') = 1;

-- 5. the failure mode and its detector (0 once the 30 issues sit on their BP26 projects; non-zero if a placement pass moves one off again)
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('catalogue-mapping-overwritten', 'an open catalogue issue (predicate_id BP26-*) is moved from its catalogue project to a W.<worker> project by the placement pass', 'qnfo-github-steward psPlace placed every open issue on W.<triage owner or source> each pass, whatever project it already sat on, so a mapping chosen by a catalogue to a non-worker project was overwritten within the hour; the five BP26 projects then had no mapped issue and the no-mapped-work detector reported them (2993)', 'qnfo-github-steward 0.9.1 PS-KEEP-CATALOGUE-PROJECT-1 keeps an open issue on an active non-worker project; REM-A4-BP26-MAP-1 restored the 30 mappings; fm-catalogue-mapping-overwritten reads an open BP26 issue on a W.<worker> project', 'no open issue with a BP26- predicate_id is mapped to a W.<worker> project', 'fm-catalogue-mapping-overwritten', '2026-10-26', 2993, 'a catalogue maps its issues to its own projects and the steward places them by owner', 'PORTFOLIO-GAP no-mapped-work umbrella reopened and re-filed (135 reopens in 6 days); five active projects with no mapped issue', 'portfolio_gaps, the no-mapped-work umbrella, GitHub milestones of the catalogue issues');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES
 ('fm-catalogue-mapping-overwritten', NULL, 'REM-A4-BP26-MAP-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM agent_issues a JOIN issue_project_map m ON m.issue_id = a.id WHERE a.predicate_id LIKE ''BP26-%'' AND a.status = ''open'' AND m.project_code LIKE ''W.%'') AS TEXT) AS observed', 'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a4-portfolio', 'a catalogue that maps its issues to its own projects is the source of truth for that mapping, and a placement pass must not overwrite it with an owner guess', 'REM-A4-BP26-MAP-1: the 30 BP26 catalogue issues are mapped back to BP26.EDITORIAL, COMPLIANCE, REACH, ENGINEERING and AGENTOPS and the no-mapped-work gap rows those mappings clear are closed', 'issue_project_map: all 30 issues with predicate_id like BP26-% on W.qnfo-ops (the catalogue migration mapped them to the BP26 projects); portfolio_gaps: five open no-mapped-work rows for the BP26 projects, the only non-infra ones; qnfo-github-steward psPlace placed every open issue on W.<owner> (0.9.0); 0.9.1 PS-KEEP-CATALOGUE-PROJECT-1 keeps an issue on an active non-worker project (PR 4862); offline suite migrations/rem-a4-bp26-map.test.mjs', 'applied by migration', '30 issue_project_map rows (project_code, program_code) and the gap rows of projects that now have a mapped issue; the steward re-labels the GitHub milestones of the 30 issues on its next passes', 'the Rollback line restores the 30 rows and reopens the gap rows from the saved copies', 'catalogue projects keep their own issues across steward passes', 'the umbrella probe of issue 2993 reads 0 on the next fleet-control tick and closes on two consecutive passes (reopened_count 135); the detector files no no-mapped-work gap for BP26.* while the issues stay mapped', 'none', 'd1:qnfo-audit issue_project_map, agent_issues, projects, portfolio_gaps, fleet_tasks portfolio-execute and portfolio-autopilot (SELECT only), qnfo-github-steward psPlace source; offline node:sqlite replay'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'REM-A4-BP26-MAP-1:') = 1);
