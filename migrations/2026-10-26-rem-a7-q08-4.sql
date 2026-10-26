-- REM-A7-Q08-4 (2026-10-26, charter pillar reach, session rem-a7-f2, agent_issues 1000512). Q08-FORECAST-LEDGER-1 was filed by REM-A7-Q08-3 (migration_runs 754) with a code-probe line in its text, but the live
-- code-probe trigger fires on an UPDATE of the description, not on the insert, so the issue was born with the closure-observing placeholder contract (superseded). Its own closing probe is set here on
-- class issue-1000512 (an UPDATE of the existing row, as the playbook asks): the slice has landed when q08-signal-engine/worker.js on main carries researchLedger. Red until then, by design.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:rolled back (REM-A7-Q08-4)' WHERE class = 'issue-1000512' AND instr(verify_probe, 'researchLedger') > 0

UPDATE remediation_contracts SET
  verify_transport = 'code-read',
  verify_probe = '{"paths": ["q08-signal-engine/worker.js"], "contains": "function researchLedger("}',
  precondition = 'REM-A7-Q08-4: the closing probe of Q08-FORECAST-LEDGER-1, replacing the closure-observing placeholder',
  action = 'slice 1 of the research ledger in q08-signal-engine/worker.js: researchLedger, the default-off switch ops_config q08_forecast_ledger, q08_forecasts.ground_json',
  status = 'active', last_verdict = NULL, attempts = 0, next_due_at = datetime('now')
WHERE class = 'issue-1000512' AND status = 'superseded' AND instr(verify_probe, 'researchLedger') = 0
  AND EXISTS (SELECT 1 FROM agent_issues WHERE id = 1000512 AND instr(title, 'Q08-FORECAST-LEDGER-1:') = 1 AND status = 'open');
