-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-companion-objection-heading-only', 'fm-companion-like-pattern-over-50', 'fm-q08-title-only-writer-fallthrough'); DELETE FROM failure_modes WHERE fm_key IN ('companion-objection-heading-only', 'companion-like-pattern-over-50', 'q08-title-only-writer-fallthrough'); DELETE FROM decision_log WHERE instr(action, 'Q08-TITLE-REPAIR-20261014:') = 1 OR instr(action, 'COMPANION-OBJECTION-FIND-20261014:') = 1; DELETE FROM decision_predictions WHERE origin = 'seeded' AND subject IN ('q08_gate_pass_rate_7d') AND due_at = '2026-10-16T04:00:00Z'
-- 2026-10-14 (pillars personal and reach; agent_issues 2552, 2284, 2503). Three failure modes found while reading the 04:00 UTC companion run and
-- the last day of q08 writer trails, each with a code-read detector on the fix: OBJECTION-FIND-1 and LIKE-PATTERN-50-1 (personal-companion
-- 1.25.4, PR 1249) and Q08-TITLE-REPAIR-1 (q08-signal-engine 0.26.0, this pull request). Data only: no trigger is created or dropped.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('companion-objection-heading-only', 'a companion essay that argued its objection mid-section was refused "objection too thin" before any reader saw it',
  'the essay contract lets the objection be a heading, two sentences mid-argument or the last section, and the output rule forbids the same heading twice in a row, but composePiece read the objection only from a heading containing "objection"',
  'OBJECTION-FIND-1 (personal-companion 1.25.3): findObjection reads a heading that names it, else a paragraph that raises it in so many words, else a section whose heading challenges the claim; a piece with none still fails the rail',
  'personal-companion/worker.js on main reads the objection with findObjection', 'fm-companion-objection-heading-only', '2026-10-14', 2552,
  'a writer that follows the contract and places the objection without an Objection heading', 'companion_runs 5965, 5968, 5972 and 5976 (2026-10-14 04:06-04:08 UTC): 4 of 5 deepseek drafts rejected "objection too thin"', 'every companion essay and serial'),
 ('companion-like-pattern-over-50', 'the companion''s duplicate-opening check threw and was skipped on every long lede',
  'D1 refuses a LIKE or GLOB pattern over 50 bytes; the check bound a 60-character key plus "%"',
  'LIKE-PATTERN-50-1 (personal-companion 1.25.4): the key is 48 characters',
  'personal-companion/worker.js on main cuts the duplicate-opening key at 48 characters', 'fm-companion-like-pattern-over-50', '2026-10-14', 2552,
  'a draft whose lede yields more than 49 letters and digits', 'worker_logs 2026-10-14 03:03 and 03:09 UTC: D1_ERROR LIKE or GLOB pattern too complex', 'the duplicate-opening guard of every companion piece'),
 ('q08-title-only-writer-fallthrough', 'a q08 writer draft refused only for its title was discarded and the next, weaker writer wrote instead',
  'compose() moved to the next writer on any writer-gate problem; nemotron, whose drafts pass accuracy, often returned a Title Case label title or no H1, and gpt-oss, whose drafts all failed accuracy that day, then wrote the piece',
  'Q08-TITLE-REPAIR-1 (q08-signal-engine 0.26.0): a title-only failure of the writer or its retry gets one short title call to the same writer, the body kept byte for byte and the whole gate run again',
  'q08-signal-engine/worker.js on main repairs a title-only writer-gate failure', 'fm-q08-title-only-writer-fallthrough', '2026-10-14', 2284,
  'a writer draft whose only writer-gate problems are its title', 'q08_reader_tests round 0, 2026-10-13 04:00 to 2026-10-14 04:00 UTC: 8 of 15 nemotron drafts refused for the title alone; gpt-oss 0 of 14 published', 'every q08 essay and forecast');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at) VALUES
 ('fm-companion-objection-heading-only', NULL, 'OBJECTION-FIND-1', 'failure-mode detector', '{"paths": ["personal-companion/worker.js"], "contains": "var objection = findObjection(md);"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now')),
 ('fm-companion-like-pattern-over-50', NULL, 'LIKE-PATTERN-50-1', 'failure-mode detector', '{"paths": ["personal-companion/worker.js"], "contains": ".replace(/[^a-z0-9]/gi, \"\").toLowerCase().slice(0, 48);"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now')),
 ('fm-q08-title-only-writer-fallthrough', NULL, 'Q08-TITLE-REPAIR-1', 'failure-mode detector', '{"paths": ["q08-signal-engine/worker.js"], "contains": "if (opts && opts.titleRepair && titleOnlyProblems(allProblems)) {"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'the writer whose drafts pass accuracy should not lose them to a formatting check that one short call can satisfy; a title says what the essay argues and adds no fact the accuracy check does not then read',
  'Q08-TITLE-REPAIR-20261014: q08-signal-engine 0.26.0 gives a title-only writer-gate failure one short title call to the same writer (writer and retry, essay and forecast) before the next writer is tried',
  'q08_reader_tests round 0, 24 h to 2026-10-14 04:00 UTC: nemotron 2 of 15 drafts passed the writer gate, 8 refused for the title alone; engine_runs: the 3 published pieces were all nemotron, gpt-oss 0 of 14',
  'merged through the canonical path', 'q08 writer calls: one extra short call per title-only failure (about 400 tokens)', 'the revert of q08-signal-engine 0.26.0',
  'q08 keeps the drafts of its most accurate writer when only the title is wrong',
  'q08_gate_pass_rate_7d above its 2026-10-14 reading by 2026-10-16 04:00 UTC', 'q08.org publishes more of its best-grounded drafts', 'd1:q08-signal engine_runs, q08_reader_tests; code:q08-signal-engine compose, gate'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'Q08-TITLE-REPAIR-20261014:') = 1);
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a validator must accept every placement its own prompt allows; reading the objection from the body loses nothing the critic does not still judge',
  'COMPANION-OBJECTION-FIND-20261014: personal-companion 1.25.3 reads the objection wherever the essay contract allows it; 1.25.4 keeps the duplicate-opening LIKE pattern under the 50-byte D1 limit',
  'companion_runs 5949-5978 (2026-10-14 04:00 UTC run): 4 of 5 deepseek drafts rejected "objection too thin"; worker_logs 03:03 and 03:09 UTC LIKE or GLOB pattern too complex',
  'merged through the canonical path (PR 1249)', 'the companion objection rail and duplicate-opening check', 'the revert of personal-companion 1.25.3 and 1.25.4',
  'companion drafts that place the objection mid-argument reach the critic',
  'no companion_runs row reads "objection too thin" for a draft whose body states an objection after 1.25.4 is live', 'reading.q08.org publishes again', 'd1:personal-life companion_runs, qnfo-audit worker_logs; code:personal-companion composePiece, validatePiece, extractSection'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'COMPANION-OBJECTION-FIND-20261014:') = 1);
INSERT OR IGNORE INTO decision_predictions (decision_id, kind, subject, op, value, due_at, origin)
SELECT id, 'metric', 'q08_gate_pass_rate_7d', '>', (SELECT COALESCE(CAST(last_value AS REAL), 0) FROM metric_registry WHERE metric = 'q08_gate_pass_rate_7d'), '2026-10-16T04:00:00Z', 'seeded' FROM decision_log WHERE instr(action, 'Q08-TITLE-REPAIR-20261014:') = 1;
