-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-companion-stall-closes-on-one-piece', 'fm-companion-essay-over-ceiling-rewritten'); DELETE FROM failure_modes WHERE fm_key IN ('companion-stall-closes-on-one-piece', 'companion-essay-over-ceiling-rewritten')
-- Rollback scope: the two contracts and the two failure_modes rows; the decision_log row stays (append-only).
-- COMPANION-STALL-YIELD-1 (2026-10-19, charter pillar: personal; agent_issues 100064, COMPANION-PUBLISH-STALL-AUTO-1: reading.q08.org published
-- nothing for 13 h, the eighth issue of that title since 2026-10-07: 2126, 2222, 2552, 2635, 2669, 2934, 99975, 100064). personal-companion 1.37.0
-- (the pull request that carries this file) fixes two failure modes found while measuring the stall, and spends the run budget better:
--   1. companion-stall-closes-on-one-piece: companionStallDetector closed the issue as soon as the newest piece was younger than STALL_MIN, so one
--      piece ended it (99975 closed 2026-10-19T04:04:54Z by the 04:04:51Z piece) and the next stalled tick filed a new one (100064 at 07:00:43Z)
--      while the 08, 12 and 16 UTC slots published nothing. The issue now closes when the newest piece is younger than 120 minutes AND a second
--      piece landed in the last 24 h; the digest's "latest model-call error" is read from the same 24 h as the rest of the digest (it quoted the
--      2026-10-17 spend-limit row).
--   2. companion-essay-over-ceiling-rewritten: 29 of the 158 rejections in the 24 h to 2026-10-19T17:11Z were lengths ("essay length 3741",
--      companion_runs #11643); expandFeedback returns null above the floor, so each fell to the generic feedback and paid a whole new draft (about 80 s
--      on the Workers AI writer). shortenFeedback now gives the next attempt its own draft and asks for a cut to 200 words under the ceiling.
-- The same release stops the fact-prune loop when a round repeats the kinds of claim an earlier round flagged and flags no fewer of them, and starts
-- no attempt with less budget left than the longest attempt of the run cost (46 of 61 runs in 24 h ended "time budget spent after 2 attempts").
-- The verification gate (COMPANION-VERIFY-1, owner-set) and the ceilings and floors are untouched.
--
-- DETECTORS. companion_runs lives in the private personal-life D1, which a public probe log must not read, so neither detector reads it.
--   fm-companion-stall-closes-on-one-piece (d1-query, qnfo-audit): COUNT of COMPANION-PUBLISH-STALL-AUTO-1 issues closed by auto-recovery on or after
--   2026-10-20T00:00Z (after the fix can be live; the cutoff is a regression guard, not a claim that stalls stop) that were followed by a new issue of
--   that title within 360 minutes. It reads 0 when the closer holds; the old closer produced a pair every few hours (2934 -> 99975 after 241 min,
--   99975 -> 100064 after 176 min). Measured read-only on qnfo-audit 2026-10-19 ~18:30Z: 4 such pairs in the live history without the cutoff, 0 with
--   it (so it reads 0 today and counts only closes after the cutoff). LIKE patterns stay under D1's 50-byte limit.
--   fm-companion-essay-over-ceiling-rewritten (code-read): personal-companion/worker.js on main still defines shortenFeedback.
-- No hold, filter, cap or gate is added (control_registry: none), and no metric is added (so no trigger): the stall issue is filed and closed by the
-- worker itself and the metric companion_hours_since_last_piece is unchanged.
-- Idempotent: INSERT OR IGNORE, and the decision_log row is guarded by NOT EXISTS.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('companion-stall-closes-on-one-piece', 'the stall issue is closed by one piece and refiled within hours, so its age, evidence and priority restart while the publishing slots after the piece publish nothing',
  'companionStallDetector closed COMPANION-PUBLISH-STALL-AUTO-1 as soon as the newest companion_pieces row was younger than STALL_MIN, on the strength of one piece: agent_issues 99975 was closed by the 2026-10-19T04:04:51Z piece (at 04:04:54Z) and 100064 was filed at 07:00:43Z; the digest also quoted a model-call error from 2026-10-17 because its query had no time bound',
  'personal-companion 1.37.0 COMPANION-STALL-YIELD-1: the issue closes only when the newest piece is younger than STALL_MIN (120 minutes, judged on exact minutes) and a second piece landed in the last 24 h; until then the open issue is kept and refreshed; the digest quotes a model-call error only from the last 24 h',
  'fm-companion-stall-closes-on-one-piece: a COMPANION-PUBLISH-STALL-AUTO-1 issue closed by auto-recovery on or after 2026-10-20T00:00Z and another filed within 360 minutes', 'fm-companion-stall-closes-on-one-piece', '2026-10-07', 100064,
  'one piece lands after a stall while the generation slots after it publish nothing',
  'a COMPANION-PUBLISH-STALL-AUTO-1 issue closed with close_channel auto-recovery and a new one opened a few hours later: eight issues of that title since 2026-10-07',
  'reading.q08.org and its subscribers: no piece for hours between single-piece recoveries, and the stall issue never accumulates age or priority'),
 ('companion-essay-over-ceiling-rewritten', 'an essay, serial or notes draft over the length ceiling is rewritten from scratch instead of cut, so each such rejection pays a whole new draft',
  'validatePiece rejects an essay or notes piece over 3200 words and a serial over 2800, and expandFeedback returns null above the floor, so the rejection fell to the generic failed-validation feedback and a full rewrite (about 80 s on the Workers AI writer): 29 of 158 rejections in the 24 h to 2026-10-19T17:11Z were lengths, the newest companion_runs #11643 "essay length 3741"',
  'personal-companion 1.37.0 COMPANION-STALL-YIELD-1: shortenFeedback gives the next attempt its own draft and asks it to cut to 200 words under the ceiling by removing the least-sourced passages and to add nothing; the ceilings (3200, 2800) and the floors are unchanged and the cut draft passes every gate again',
  'fm-companion-essay-over-ceiling-rewritten: personal-companion/worker.js on main still defines shortenFeedback (code-read; the length rows are in the private personal D1)', 'fm-companion-essay-over-ceiling-rewritten', '2026-10-18', 100064,
  'a writer draft over 3200 words (essay, notes) or 2800 (serial) with no other validation problem',
  'companion_runs rejected rows "validate: essay length N" with N above the ceiling, each followed by a full new compose',
  'reading.q08.org yield: about 80 s of a 600 s run budget per over-length rejection');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, next_due_at, module, budget_ms, max_items, requires_container) VALUES
 ('fm-companion-stall-closes-on-one-piece', NULL, 'COMPANION-STALL-YIELD-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM agent_issues c WHERE c.title LIKE ''COMPANION-PUBLISH-STALL-AUTO-1:%'' AND c.status = ''closed'' AND c.close_channel = ''auto-recovery'' AND c.updated_at >= 1792454400000 AND EXISTS (SELECT 1 FROM agent_issues o WHERE o.title LIKE ''COMPANION-PUBLISH-STALL-AUTO-1:%'' AND o.id > c.id AND o.created_at >= c.updated_at AND o.created_at <= c.updated_at + 21600000)) AS TEXT) AS observed', 'd1-query', 3, 'personal-companion', 1, 'active', strftime('%Y-%m-%d %H:%M:%S', 'now'), 'failure-mode', 45000, 5, 0),
 ('fm-companion-essay-over-ceiling-rewritten', NULL, 'COMPANION-STALL-YIELD-1', 'failure-mode detector', '{"paths": ["personal-companion/worker.js"], "contains": "function shortenFeedback(problems, form, piece) {"}', 'code-read', 3, 'personal-companion', 1, 'active', strftime('%Y-%m-%d %H:%M:%S', 'now'), 'failure-mode', 45000, 5, 0);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766', 'a stall issue that closes on one piece and a run that spends its 600 s budget on drafts the gate keeps rejecting hide the yield problem, so the closer must ask for a second piece and the run must stop work that cannot finish; the verification gate is owner-set and stays as it is',
  'COMPANION-STALL-YIELD-20261019: personal-companion 1.37.0 closes the stall issue only with a second piece in 24 h, bounds its error digest to 24 h, cuts an over-length draft instead of rewriting it, stops a fact-prune loop that repeats the same claim classes without shrinking, and starts no attempt with less budget than the longest attempt of the run cost',
  'agent_issues 100064 and its seven predecessors (close then refile: 99975 closed 2026-10-19T04:04:54Z, 100064 filed 07:00:43Z); the 24 h to 2026-10-19T17:11Z: 158 rejected rows, 29 of them lengths, 46 of 61 runs ended time budget spent after 2 attempts (docs/handoff/2026-10-19-closeout-2.md)',
  'merged through the canonical path', 'one worker, personal-companion; the gate, the ceilings and the floors are unchanged, a stopped loop only ends an attempt that would be rejected', 'revert of personal-companion 1.37.0, or ops_config companion_generation = hold to pause generation',
  'the worker stops a prune loop, an attempt and a rewrite on its own',
  'companion_hours_since_last_piece under 12 at 2026-10-21T09:00:00Z (the metric target), and no stall issue closed by auto-recovery is followed by a new one within 360 minutes from 2026-10-20T00:00:00Z',
  'reading.q08.org publishes more often', 'd1:qnfo-audit agent_issues, metric_registry; code:personal-companion shortenFeedback, pruneRepeat, attemptBudgetStop, companionStallDetector'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'COMPANION-STALL-YIELD-20261019:') = 1);
