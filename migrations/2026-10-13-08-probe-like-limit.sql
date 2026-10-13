-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM failure_modes WHERE fm_key = 'd1-like-pattern-length'; DELETE FROM remediation_contracts WHERE class = 'fm-d1-like-pattern-length'
-- PROBE-LIKE-LIMIT-1 (2026-10-13, pillar autonomy). D1 refuses a LIKE or GLOB pattern longer than 50 bytes ("LIKE or GLOB
-- pattern too complex"). LOOP-ISSUE-FLAP-1 (-05, this session) gave every open loop-filed issue a contract that matched its
-- title inside the improvement loop's state_json with LIKE '%"' || title || '"%'. A short title fits; "METRIC-FIX-RELAPSED-1:
-- runtime_verified_share_24h" does not, so 2157, 2158, 2326 and 2466 read probe-error every hour and could never close.
-- The contracts now use instr(), which has no length limit and matches the same quoted title. A new failure mode records the
-- limit, and its detector counts open issues whose closing probe errors, whatever the cause, so a broken probe surfaces
-- within the hour instead of holding its issue open in silence.
UPDATE remediation_contracts SET verify_transport = 'd1-query',
  verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT state_json FROM improvement_loop_runs ORDER BY id DESC LIMIT 1) IS NULL THEN ''pending: no improvement loop run recorded'' WHEN instr((SELECT state_json FROM improvement_loop_runs ORDER BY id DESC LIMIT 1), ''"'' || (SELECT title FROM agent_issues WHERE id = ' || CAST(issue_id AS TEXT) || ') || ''"'') > 0 THEN ''the improvement loop still finds this in its latest run (IMPROVEMENT-LOOP-1 closes it when the finding clears)'' ELSE ''ok'' END AS observed',
  status = 'active', attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE issue_id IS NOT NULL
  AND verify_probe LIKE '%improvement_loop_runs%'
  AND class IN (SELECT 'issue-' || id FROM agent_issues WHERE status = 'open' AND (title LIKE 'METRIC-REGRESSION-1:%' OR title LIKE 'METRIC-FIX-RELAPSED-1:%'));
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, symptom, blast_radius)
VALUES ('d1-like-pattern-length', 'a closing probe errors on every run, so its issue can never close',
  'D1 refuses a LIKE or GLOB pattern longer than 50 bytes; LOOP-ISSUE-FLAP-1 built patterns from issue titles, and the long titles (2157, 2158, 2326, 2466) made every run of their contracts a probe-error',
  'PROBE-LIKE-LIMIT-1: title matches use instr(); the detector counts open issues whose contract reads probe-error',
  'fm-d1-like-pattern-length: no open issue''s closing contract reads probe-error', 'fm-d1-like-pattern-length', '2026-10-13',
  'remediation_contracts.last_verdict probe-error, issue open with no verdict history', 'every contract built from a template with a variable-length LIKE pattern');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
VALUES ('fm-d1-like-pattern-length', NULL, 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM remediation_contracts c JOIN agent_issues a ON c.class = ''issue-'' || a.id WHERE a.status = ''open'' AND c.status = ''active'' AND c.last_verdict = ''probe-error'') AS TEXT) AS observed', 'd1-query', 3, 1, 'active', 'PROBE-LIKE-LIMIT-1', 'failure-mode detector', 'qnfo-fleet-control');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested) VALUES
  ('session_01Kddqwk5gQT5qSSHVKjT2EA', 'a closing probe is only useful if it runs; one that errors keeps its issue open with no evidence either way',
   'PROBE-LIKE-LIMIT-1: loop-filed issue contracts match the title with instr() instead of a LIKE pattern; failure mode d1-like-pattern-length with a probe-error detector',
   'remediation_contracts 06:30 UTC: issue-2157, 2158, 2326, 2466 last_verdict probe-error; the probe run directly answers "LIKE or GLOB pattern too complex: SQLITE_ERROR"; the instr() form returns a verdict',
   'merged through the canonical path', 'the four contracts return verdicts; their issues close when the improvement loop clears the finding', 'the Rollback line of this file',
   'broken closing probes surface within the hour', 'no open issue contract reads probe-error within 2 hours of the merge', 'none', 'd1:remediation_contracts, improvement_loop_runs');
