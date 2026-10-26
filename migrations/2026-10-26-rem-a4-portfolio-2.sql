-- REM-A4-PORTFOLIO-2 (2026-10-26, charter pillar autonomy; agent_issues 1000194; follows migrations/2026-10-26-rem-a4-portfolio.sql, PR 4872)
--
-- WHAT WENT WRONG (read from qnfo-audit after the first file applied, 19:57Z)
--   The contract of 1000194 was written with the text '); portfolio risk ' in a string literal. The D1 triggers remediation_probe_semicolon_ins and remediation_probe_semicolon_upd rewrite every semicolon of a d1-query
--   verify_probe to a comma (so a probe stays one statement), also inside a string literal: the stored probe reads '), portfolio risk ', the newest weekly-strategic summary ('... (program risk 666); portfolio risk 768 ...')
--   no longer matches, and the first verification (remediation_verifications 332685) read "the newest weekly review summary does not label the constraint program risk and the portfolio risk separately"
--   although the label is live. The other probes of the first file carry no semicolon (100341 and 99953 passed at 19:57:46 and 19:57:48; 100341 closed).
--
-- WHAT THIS FILE DOES
--   Rewrites the probe of issue-1000194 without a semicolon: it asks for the two labels separately ('(program risk ' and ' portfolio risk '), which the summary of run 32 (constraint QNFO.OPS risk 801) has neither of.
--   Guarded by the corrupted text, so a probe another session repaired is left alone. The old probe is saved. One decision_log row. The lint gap is filed as PROBE-SEMICOLON-LINT-1 for a session (the Rollback line leaves that issue open: it is harmless).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = (SELECT b.verify_probe FROM bak_20261026_rem_a4_portfolio_2_contract b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261026_rem_a4_portfolio_2_contract b WHERE b.class = remediation_contracts.class), attempts = (SELECT b.attempts FROM bak_20261026_rem_a4_portfolio_2_contract b WHERE b.class = remediation_contracts.class) WHERE class IN (SELECT class FROM bak_20261026_rem_a4_portfolio_2_contract)

CREATE TABLE IF NOT EXISTS bak_20261026_rem_a4_portfolio_2_contract AS SELECT * FROM remediation_contracts WHERE class = 'issue-1000194';

UPDATE remediation_contracts
   SET verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN NOT EXISTS (SELECT 1 FROM portfolio_runs WHERE kind = ''weekly-strategic'' AND run_date = (SELECT MAX(run_date) FROM portfolio_runs WHERE kind = ''weekly-strategic'') AND instr(summary, ''(program risk '') > 0 AND instr(summary, '' portfolio risk '') > 0) THEN ''the newest weekly review summary does not label the constraint program risk and the portfolio risk separately'' WHEN EXISTS (SELECT 1 FROM program_review_notes WHERE day = (SELECT MAX(day) FROM program_review_notes) AND (roadmap_now IS NULL OR goals_adopted IS NULL)) THEN ''the newest program_review_notes carry no roadmap or goal counts'' WHEN COALESCE((SELECT MAX(day) FROM program_scorecards), ''1970-01-01'') < date(''now'', ''-1 day'') THEN ''the program scorecards are more than a day old: the daily run does not compute them'' ELSE ''ok'' END AS observed',
       last_verdict = NULL, attempts = 0, next_due_at = datetime('now')
 WHERE class = 'issue-1000194' AND instr(verify_probe, '), portfolio risk ') > 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a4-portfolio',
  'a probe literal must not contain a semicolon: the D1 trigger remediation_probe_semicolon_upd rewrites it to a comma inside strings too, which turns a text match into a different text',
  'REM-A4-PORTFOLIO-2: the probe of issue-1000194 asks for the two risk labels without a semicolon',
  'remediation_verifications 332685 (pass 0, 19:57:50Z) read the label missing although portfolio_runs 37 holds "(program risk 666); portfolio risk 768"; the stored probe held "), portfolio risk" where the file wrote "); portfolio risk"; remediation_verifications 332678 and 332681 (probes without a semicolon) passed',
  'applied by migration', 'one contract row', 'the Rollback line restores the saved probe, verdict and attempts',
  'none beyond the corrected probe', '1000194 closes on its next passing verification (reopened_count 0)', 'none',
  'd1:qnfo-audit sqlite_master (trigger text), remediation_verifications, portfolio_runs (SELECT only); offline node:sqlite replay with the live trigger'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'REM-A4-PORTFOLIO-2:') = 1);

-- The lint gap that let it through is filed for a session (scripts/apply_migrations.py is in CM_SCRIPT_DENY: the code loop cannot change it), with a closing probe on the code.
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'PROBE-SEMICOLON-LINT-1: scripts/apply_migrations.py --check does not refuse a semicolon inside a d1-query verify_probe literal, and a D1 trigger rewrites it to a comma',
  'Charter pillar: autonomy. REM-A4-PORTFOLIO-2 (2026-10-26): a d1-query verify_probe that contains a semicolon, also inside a string literal, is stored with a comma by the D1 triggers remediation_probe_semicolon_ins and remediation_probe_semicolon_upd (so a probe stays one statement). A probe that matches a text holding a semicolon then compares against the wrong text and fails for ever: the probe of issue 1000194 ("); portfolio risk ") read "label missing" (remediation_verifications 332685) although the label was live, and cost one extra pull request. scripts/apply_migrations.py --check refuses write keywords, LIKE patterns over 50 bytes and unparsable SQL, but not this.' || char(10) ||
  'Change: in plan() refuse a statement that sets remediation_contracts.verify_probe (UPDATE ... SET verify_probe, or INSERT INTO remediation_contracts) when the verify_probe literal contains a semicolon and the transport is d1-query (or unset on an update), naming the literal. Tag the change PROBE-SEMICOLON-LINT-1 and add the cases to scripts/apply_migrations_test.py (a probe with a semicolon inside a literal fails, one without passes, a code-read JSON probe is exempt).' || char(10) ||
  'Doer: a session. scripts/apply_migrations.py is in CM_SCRIPT_DENY (the code loop cannot change it) and file:scripts/apply_migrations.py was claimed by session-old-issues-6d-2038 at the time of writing: read /work-locks, take the file when the claim lapses or review that session''s change. Definition of done: the code on main holds PROBE-SEMICOLON-LINT-1.' || char(10) ||
  'session-task: repo=qnfo-workers path=scripts/apply_migrations.py' || char(10) ||
  'code-probe: {"paths": ["scripts/apply_migrations.py"], "contains": "PROBE-SEMICOLON-LINT-1"}',
  'session', 'autonomy', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues WHERE instr(title, 'PROBE-SEMICOLON-LINT-1:') = 1);
