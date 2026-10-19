-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT CASE WHEN COUNT(*) <= 14 THEN 0 ELSE COUNT(*) END FROM cloud_ops_events WHERE job = ''qnfo-code-orchestrator'' AND kind = ''code-task.fail'' AND text LIKE ''%@cf/zai-org/glm-5.3: no SEARCH/REPLACE block found in the reply: the reply was empty%'' AND ts >= max(''2026-10-19T15:00:00Z'', strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours''))) AS TEXT) AS observed' WHERE class = 'fm-code-task-empty-reply-glm' AND instr(verify_probe, 'instr(text') > 0; DELETE FROM remediation_contracts WHERE class = 'fm-probe-like-pattern-over-limit'; DELETE FROM failure_modes WHERE fm_key = 'probe-like-pattern-over-limit';
-- FM-PROBE-LIKE-LIMIT-1 (2026-10-19, charter pillar: autonomy; agent_issues 100254 and 100260, LOOP-BREAKER-1 on class=fm-code-task-empty-reply-glm).
-- The detector fm-code-task-empty-reply-glm (REASONING-LOW-1, migrations/2026-10-19-code-loop-edit-reliability.sql) filters cloud_ops_events with
-- text LIKE '%@cf/zai-org/glm-5.3: no SEARCH/REPLACE block found in the reply: the reply was empty%': an 86 byte pattern, and D1 refuses a LIKE or
-- GLOB pattern over 50 bytes ("D1_ERROR: LIKE or GLOB pattern too complex"). SQLite checks the pattern when a row first reaches the comparison, so the probe passed at
-- 15:09:21Z (no code-task.fail event existed yet, observed 0) and has errored on every run since the first one: remediation_verifications holds no row for the
-- class after 15:09:21Z (an error is not a verification), the contract sits at last_verdict probe-error with attempts 17, and the detector has been blind for the whole window it
-- exists for. The remediation consumer and qnfo-fleet-control each wrote the error into the loop-breaker (100254 and 100260, last 19:56Z and 20:31Z).
-- Measured 2026-10-19 21:0xZ, qnfo-audit, SELECT only: of the active d1-query contracts that hold a LIKE literal this one is the only one over 50 bytes (a recursive scan of every
-- LIKE literal in remediation_contracts.verify_probe: one row, 86 bytes; fm-code-task-unplaceable-large-file reads '%needs an anchor%', 17 bytes).
--   * The probe is restated with instr(text, '<same text>') > 0 (no length limit; the text is the worker's own fixed message, so the case rule of LIKE does not matter). Same window,
--     same threshold of 14, same 15:00Z floor. Guarded by instr(verify_probe, 'LIKE ''%@cf/zai-org') so a replay or a later edit is left alone, and the verdict and attempt count are
--     cleared so the next consumer run reads it fresh.
--   * A detector so the class cannot hide again: fm-probe-like-pattern-over-limit counts the active d1-query contracts whose probe holds a LIKE literal over 50 bytes (recursive scan,
--     the contract's own text excluded) and reads 0 while none does.
UPDATE remediation_contracts SET
  verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT CASE WHEN COUNT(*) <= 14 THEN 0 ELSE COUNT(*) END FROM cloud_ops_events WHERE job = ''qnfo-code-orchestrator'' AND kind = ''code-task.fail'' AND instr(text, ''@cf/zai-org/glm-5.3: no SEARCH/REPLACE block found in the reply: the reply was empty'') > 0 AND ts >= max(''2026-10-19T15:00:00Z'', strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours''))) AS TEXT) AS observed',
  last_verdict = NULL, attempts = 0, next_due_at = NULL
 WHERE class = 'fm-code-task-empty-reply-glm' AND instr(verify_probe, 'LIKE ''%@cf/zai-org') > 0;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('probe-like-pattern-over-limit', 'a d1-query contract probe holds a LIKE or GLOB pattern over 50 bytes, D1 refuses it once a row reaches the comparison, and the contract errors on every run from then on',
  'D1 limits a LIKE or GLOB pattern to 50 bytes and checks it at match time, so a probe written against an empty window passes at birth and fails when the first matching-table row arrives; an error is not a verification, so the contract shows probe-error and no failing row (fm-code-task-empty-reply-glm, 17 attempts, blind from 15:09Z)',
  'a probe tests a long fixed message with instr(column, ''<text>'') > 0, never LIKE; fm-probe-like-pattern-over-limit lists any active d1-query contract whose probe holds a LIKE literal over 50 bytes',
  'the fm-probe-like-pattern-over-limit contract scans every active, monitoring or holding d1-query probe for a LIKE literal over 50 bytes and reads 0 while none exists',
  'fm-probe-like-pattern-over-limit', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 100254,
  'an active d1-query remediation contract whose verify_probe holds a LIKE literal longer than 50 bytes',
  'a contract at last_verdict probe-error with no remediation_verifications row since it was born, and a LOOP-BREAKER-1 issue quoting LIKE or GLOB pattern too complex',
  'every detector or closing probe that filters text by a long message: it is blind where it matters, and its failure reads as an infrastructure error and not as a finding');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-probe-like-pattern-over-limit', NULL, 'FM-PROBE-LIKE-LIMIT-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((WITH RECURSIVE s(class, rest) AS (SELECT class, verify_probe FROM remediation_contracts WHERE verify_transport LIKE ''d1-query%'' AND status IN (''active'', ''monitoring'', ''holding'') AND class <> ''fm-probe-like-pattern-over-limit'' AND instr(verify_probe, ''LIKE '''''') > 0 UNION ALL SELECT class, substr(rest, instr(rest, ''LIKE '''''') + 6) FROM s WHERE instr(rest, ''LIKE '''''') > 0 AND length(rest) > 6), p(class, pat) AS (SELECT class, substr(rest, instr(rest, ''LIKE '''''') + 6) FROM s WHERE instr(rest, ''LIKE '''''') > 0) SELECT COUNT(DISTINCT class) FROM p WHERE instr(pat, '''''''') > 1 AND length(CAST(substr(pat, 1, instr(pat, '''''''') - 1) AS BLOB)) > 50) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01JADz8uHqYt9eUMBTwbbBE6',
  'a detector that errors on every run is worse than none: it reads as infrastructure noise, the failure it exists for goes unseen, and a long fixed message is matched with instr(), which has no pattern limit',
  'FM-PROBE-LIKE-LIMIT-1: the probe of fm-code-task-empty-reply-glm uses instr(text, ...) > 0 in place of an 86 byte LIKE pattern, and fm-probe-like-pattern-over-limit scans every active d1-query probe for a LIKE literal over 50 bytes',
  'qnfo-audit 2026-10-19 21:0xZ (SELECT only): fm-code-task-empty-reply-glm last_verdict probe-error, attempts 17, last passing remediation_verifications row 15:09:21Z; LOOP-BREAKER-1 issues 100254 (remediation-consumer, last 19:56Z) and 100260 (qnfo-fleet-control, last 20:31Z) quote D1_ERROR: LIKE or GLOB pattern too complex; the recursive LIKE-literal scan finds this one contract over 50 bytes among all active d1-query probes; migrations/fm-empty-reply-glm-instr.test.mjs replays the base migration on SQLite',
  'migration merged',
  'one remediation_contracts row restated (same window and threshold), one detector contract, one failure mode; no worker changed',
  'the Rollback header of migrations/2026-10-19-fm-empty-reply-glm-instr.sql',
  'a probe over a long fixed message is written with instr() and a long LIKE literal is found within an hour',
  'loop_breaker_open <= 0 within 12 h',
  'none',
  'd1:qnfo-audit read-only recursive scan of every LIKE literal in verify_probe, remediation_verifications and remediation_contracts reads, node:sqlite fixtures in migrations/fm-empty-reply-glm-instr.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'FM-PROBE-LIKE-LIMIT-1:%');
