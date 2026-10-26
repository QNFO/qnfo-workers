-- REM-A4-PORTFOLIO-3 (2026-10-26, charter pillar autonomy; follows migrations/2026-10-26-rem-a4-portfolio-2.sql, PR 4894)
--
-- WHAT WAS MEASURED (qnfo-audit SELECT only, 2026-10-26 20:10Z)
--   PORTFOLIO-2 filed PROBE-SEMICOLON-LINT-1 (agent_issues 1000507) with a code-probe line, but the trigger that turns a code-probe line into a code-read contract is AFTER UPDATE OF description, and an INSERT never fires it:
--   the only contract of the issue is the closure-observing template, born superseded (issue-1000507, 'closure-observing-probe-at-birth'), so nothing could ever close it. The same shape applies to any issue a migration files with
--   a code-probe line (the doer of such a file writes the contract itself, as migrations/2026-10-26-sweep-fleet-tasks-c.sql did for 1000395).
--
-- WHAT THIS FILE DOES
--   Replaces the born-superseded contract of the PROBE-SEMICOLON-LINT-1 issue with the code-read contract its code-probe line names (scripts/apply_migrations.py holds PROBE-SEMICOLON-LINT-1), active and due now, guarded by the
--   born shape (a contract a doer already replaced is left alone). The old row is saved. One decision_log row.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = (SELECT b.status FROM bak_20261026_rem_a4_portfolio_3_contract b WHERE b.class = remediation_contracts.class), verify_transport = (SELECT b.verify_transport FROM bak_20261026_rem_a4_portfolio_3_contract b WHERE b.class = remediation_contracts.class), verify_probe = (SELECT b.verify_probe FROM bak_20261026_rem_a4_portfolio_3_contract b WHERE b.class = remediation_contracts.class), action = (SELECT b.action FROM bak_20261026_rem_a4_portfolio_3_contract b WHERE b.class = remediation_contracts.class), module = (SELECT b.module FROM bak_20261026_rem_a4_portfolio_3_contract b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261026_rem_a4_portfolio_3_contract b WHERE b.class = remediation_contracts.class), attempts = (SELECT b.attempts FROM bak_20261026_rem_a4_portfolio_3_contract b WHERE b.class = remediation_contracts.class), next_due_at = (SELECT b.next_due_at FROM bak_20261026_rem_a4_portfolio_3_contract b WHERE b.class = remediation_contracts.class), expected_cadence_h = (SELECT b.expected_cadence_h FROM bak_20261026_rem_a4_portfolio_3_contract b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261026_rem_a4_portfolio_3_contract)

CREATE TABLE IF NOT EXISTS bak_20261026_rem_a4_portfolio_3_contract AS SELECT * FROM remediation_contracts WHERE class = 'issue-' || COALESCE((SELECT MAX(id) FROM agent_issues WHERE instr(title, 'PROBE-SEMICOLON-LINT-1:') = 1), 0);

UPDATE remediation_contracts
   SET status = 'active', verify_transport = 'code-read', module = 'code-probe-line-v1',
       verify_probe = '{"paths": ["scripts/apply_migrations.py"], "contains": "PROBE-SEMICOLON-LINT-1"}',
       action = 'the doer changes scripts/apply_migrations.py on main so that plan() refuses a semicolon inside a d1-query verify_probe literal; scripts/remediation_consumer.py reads main and passes when the file holds PROBE-SEMICOLON-LINT-1',
       last_verdict = NULL, attempts = 0, next_due_at = datetime('now'), expected_cadence_h = 6
 WHERE class = 'issue-' || (SELECT MAX(id) FROM agent_issues WHERE instr(title, 'PROBE-SEMICOLON-LINT-1:') = 1)
   AND status = 'superseded' AND instr(COALESCE(last_verdict, ''), 'closure-observing-probe-at-birth') > 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a4-portfolio',
  'an issue filed by a migration with a code-probe line needs its code-read contract written by the migration, because the birth trigger fires on an update of the description, not on an insert',
  'REM-A4-PORTFOLIO-3: the born-superseded contract of PROBE-SEMICOLON-LINT-1 becomes the code-read contract its code-probe line names',
  'agent_issues 1000507 filed by migration 747 with a code-probe line; its only contract was issue-1000507 superseded:closure-observing-probe-at-birth; trigger agent_issues_code_probe_upd is AFTER UPDATE OF description',
  'applied by migration', 'one contract row', 'the Rollback line restores the saved row',
  'none beyond the closing probe of one issue', 'the contract fails until scripts/apply_migrations.py holds PROBE-SEMICOLON-LINT-1, then closes the issue', 'none',
  'd1:qnfo-audit sqlite_master (trigger text), remediation_contracts, agent_issues (SELECT only); offline node:sqlite replay'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'REM-A4-PORTFOLIO-3:') = 1);
