-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-companion-stall-closes-on-one-piece', 'fm-companion-essay-over-ceiling-rewritten'); DELETE FROM failure_modes WHERE fm_key IN ('companion-stall-closes-on-one-piece', 'companion-essay-over-ceiling-rewritten'); DELETE FROM control_registry WHERE control IN ('companion-stall-close-gate', 'companion-prune-repeat-stop', 'companion-attempt-budget-stop'); DELETE FROM capability_ledger WHERE capability IN ('companion-yield-self-stops', 'companion-stall-recovery-by-filing')
-- Rollback scope: the two contracts, the two failure_modes rows, the three control_registry rows and the two capability_ledger rows; the decision_log row stays (append-only).
-- COMPANION-STALL-YIELD-1 (2026-10-19, charter pillar: personal; agent_issues 100064, COMPANION-PUBLISH-STALL-AUTO-1: reading.q08.org published
-- nothing for 13 h, the eighth issue of that title since 2026-10-07: 2126, 2222, 2552, 2635, 2669, 2934, 99975, 100064). personal-companion 1.37.0
-- (the pull request that carries this file) fixes two failure modes found while measuring the stall, and spends the run budget better:
--   1. companion-stall-closes-on-one-piece: companionStallDetector closed the issue as soon as the newest piece was younger than STALL_MIN, so one
--      piece ended it (99975 closed 2026-10-19T04:04:54Z by the 04:04:51Z piece) and the next stalled tick filed a new one (100064 at 07:00:43Z)
--      while the 08, 12 and 16 UTC slots published nothing. The issue now closes only when (1) the newest piece is younger than 120 minutes, (2) the
--      second newest piece also landed after the issue was filed (judged on the issue's own created_at, epoch ms) and (3) the stall did not recur between
--      those two pieces: no two consecutive failed or blocked generation runs lie between them, which is the detector's own definition of a stall. A calendar
--      window does not do this: the piece before the one that closed 99975 was 15.6 h old and 2934 was closed with the previous piece 4.3 h old, so "a
--      second piece in the last 24 h" passed both. Rule (2) alone does not either: replayed with 2934's real filing (2026-10-18T11:00:11Z) and the real
--      pieces, it closes 2934 at the 04:04:51Z piece of 2026-10-19, whose predecessor (12:27:32Z, 2026-10-18) is also after the filing but 15.6 h earlier
--      with the stall in between, and the next stalled tick would file again; rule (3) holds it.
--      READ (qnfo-audit agent_issues and reading.q08.org/feed.xml, 2026-10-19 about 19:10Z): 2934 and 99975 were closed at 2026-10-18T13:00:12Z and
--      2026-10-19T04:04:54Z by the pieces 12:27:32Z and 04:04:51Z, and 100064 (filed 07:00:43Z) is open with the newest piece at 04:04:51Z, before its filing.
--      personal-companion/stall-detector.test.mjs replays those real filings and pieces; the failed runs in the empty slots (companion_runs is in the private
--      personal-life D1 and was not read) and every piece after 04:04:51Z are modelled, and marked hypothetical there. Nothing in this file states a close
--      that has not happened. The digest's "latest model-call error" is read from the same 24 h as the rest of the digest (it quoted the 2026-10-17
--      spend-limit row).
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
--   it (so it reads 0 today and counts only closes after the cutoff; that is a date artefact, not evidence of the fix, which is the replay test
--   above). A genuine second stall within 360 minutes of a real recovery would also be counted: the contract then files an issue to look
--   at, which is what a recurrence detector is for. LIKE patterns stay under D1's 50-byte limit.
--   fm-companion-essay-over-ceiling-rewritten (code-read): personal-companion/worker.js on main still defines shortenFeedback.
-- CONTROLS (DOCTRINE-1: read and update control_registry before adding a gate, cap or guard). The release adds three, none on a critical path, all kept:
--   companion-stall-close-gate (gate): the stall issue stays open until two pieces landed after it was filed;
--   companion-prune-repeat-stop (guard): the fact-prune loop and the corrective revision stop when a round repeats the claim classes an earlier round
--   flagged and flags no fewer (r1 -7, r2 -6, r3 blocked in the handoff trail; the 8, 8, 3 converging path continues);
--   companion-attempt-budget-stop (guard): no attempt starts with less of GEN_BUDGET_MS left than the longest attempt of the run cost (46 of 61 runs).
-- Each row names the previous behaviour as its alternate path. The capability the worker gains is recorded in capability_ledger. No metric is added (so
-- no trigger): the stall issue is filed and closed by the worker itself and the metric companion_hours_since_last_piece is unchanged.
-- Idempotent: INSERT OR IGNORE, and the decision_log row is guarded by NOT EXISTS.

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('companion-stall-closes-on-one-piece', 'the stall issue is closed by one piece and refiled within hours, so its age, evidence and priority restart while the publishing slots after the piece publish nothing',
  'companionStallDetector closed COMPANION-PUBLISH-STALL-AUTO-1 as soon as the newest companion_pieces row was younger than STALL_MIN, on the strength of one piece: agent_issues 99975 was closed by the 2026-10-19T04:04:51Z piece (at 04:04:54Z) and 100064 was filed at 07:00:43Z; the digest also quoted a model-call error from 2026-10-17 because its query had no time bound',
  'personal-companion 1.37.0 COMPANION-STALL-YIELD-1: the issue closes only when the newest piece is younger than STALL_MIN (120 minutes, judged on exact minutes), the second newest piece also landed after the issue was filed (judged on the issue created_at) and no two consecutive failed or blocked generation runs lie between the two pieces (a 24 h window would have closed 2934 and 99975 on one piece, and two pieces since the filing alone closes 2934 on the 2026-10-19T04:04:51Z piece after 15.6 h of stall); until then the open issue is kept and refreshed; the digest quotes a model-call error only from the last 24 h',
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

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('companion-stall-close-gate', 'personal-companion/worker.js companionStallDetector (recovered)', 'gate',
 'closing the COMPANION-PUBLISH-STALL-AUTO-1 issue on one piece after a stall, so its age, evidence and priority restart at the next stalled tick (eight issues of that title since 2026-10-07)',
 0, 'keep', 'applied',
 'the previous closer (close when the newest piece is younger than STALL_MIN) is the revert of 1.37.0; while the gate holds, the metric companion_hours_since_last_piece is still written first, the open issue is refreshed by the stalled branch every hourly tick and keeps its age and priority, and it closes once two pieces have landed since its filing with no two failed generation runs between them; nothing is hidden or dropped and no issue is closed without evidence naming both pieces and the filing time; if the runs between the pieces cannot be read the issue is held, the error is logged and the next hourly tick reads them again',
 NULL,
 'COMPANION-STALL-YIELD-1 2026-10-19. Read: 2934 was closed 2026-10-18T13:00:12Z by the 12:27:32Z piece (previous piece 08:07:51Z, 4.3 h earlier) and 99975 at 2026-10-19T04:04:54Z by the 04:04:51Z piece (previous piece 12:27:32Z, 15.6 h earlier); 100064 is open (filed 07:00:43Z) with the newest piece at 04:04:51Z, before its filing. A 24 h window passes both closes, so the gate compares the previous piece with the issue created_at; two pieces since the filing still close 2934 at the 04:04:51Z piece with 15.6 h of stall between its pieces, so the gate also refuses when two consecutive failed or blocked generation runs lie between the two pieces. Tested in personal-companion/stall-detector.test.mjs with the real filings and pieces and with modelled failed runs and hypothetical later pieces (labelled there); the alternate path (the previous closer) has not been exercised, so alternate_tested_at is NULL. Review when the next stall issue closes: its close_evidence must name two pieces after its filing and no two failed generation runs between them.',
 100064, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('companion-prune-repeat-stop', 'personal-companion/worker.js generate (pruneRepeat, pruneClassOf, PRUNE_REPEAT_AFTER)', 'guard',
 'spending further fact-prune rounds, full re-verifications and the corrective model revision on a draft whose rounds keep flagging the same classes of invented claim in no smaller number',
 0, 'keep', 'applied',
 'the previous behaviour (PRUNE_ROUNDS rounds, then the corrective revision and the extension) applies to every draft the rule does not stop: nothing is cut before two prune rounds have been answered, a round that flags fewer items than the one before is converging and continues (the documented 8, 8, 3 path ends in a pass), and a new class of claim is never a repeat; a stopped attempt ends as the same fact-check rejection and the next attempt writes a new draft, so the verification gate is unchanged and nothing unverified is published',
 NULL,
 'COMPANION-STALL-YIELD-1 2026-10-19: the handoff trail of a rejected run read r1 -7, r2 -6, r3 blocked (lede does not name the subject), the writer restating unsupported claims at a steady rate while each round cost a re-verification (docs/handoff/2026-10-19-closeout-2.md); 46 of 61 generation runs in the 24 h ended time budget spent after 2 attempts. Tested in personal-companion/verify.test.mjs (pruneRepeat on 3, 3, 3 and 8, 8, 8 stops, 8, 8, 3 continues, a new class does not stop; an end-to-end run stops at r3 and spends no revision or extension). Review when 20 runs exist after the deploy: compare the share of runs that publish with the share before.',
 100064, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id, reviewed_at)
VALUES ('companion-attempt-budget-stop', 'personal-companion/worker.js generate (attemptBudgetStop, GEN_BUDGET_MS)', 'guard',
 'starting a generation attempt with less of the 600 s run budget left than the longest attempt of this run cost, which the wall cuts off or which ends rejected after the budget with its AI spend wasted',
 0, 'keep', 'applied',
 'the previous check (an attempt starts while any budget remains, GEN_BUDGET_MS unchanged at 600 s) is the fallback: the first attempt has no measure and always starts, an attempt that can finish inside the remaining budget starts, and the stop writes the same time-budget-spent stage row the stall digest already counts; this is a run-time budget, not an AI spend cap, and it stops no process, queue or later run (BUDGET-SOFT-ROUTE-1 is about spend caps)',
 NULL,
 'COMPANION-STALL-YIELD-1 2026-10-19: 46 of 61 generation runs in the 24 h to 2026-10-19 11:50Z ended time budget spent after 2 attempts, the 11:00Z one at 734 s, so a third attempt that could not finish had been started or cut off. Tested in personal-companion/verify.test.mjs (attemptBudgetStop at 350 s and 351 s left with a 250 s attempt; an end-to-end run with a fake clock starts two attempts and stops before the third). Review when 20 runs exist after the deploy: compare the share of runs ending time budget spent.',
 100064, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'));

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('companion-yield-self-stops', 'migrations/2026-10-19-companion-stall-yield.sql (COMPANION-STALL-YIELD-1, personal-companion 1.37.0)', 'personal-companion 1.37.0 deployed; no new binding',
 'the writer worker ends a fact-prune loop that repeats the same claim classes without shrinking, starts no attempt with less budget left than the longest attempt of the run cost, and cuts an over-length draft instead of rewriting it; all three fail closed (the verification gate is unchanged); code-read detector fm-companion-essay-over-ceiling-rewritten',
 strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
 'reading.q08.org spends less of a 600 s run on drafts the gate keeps rejecting: 29 of 158 rejections in 24 h were lengths rewritten from scratch and 46 of 61 runs ended time budget spent after 2 attempts');

INSERT OR IGNORE INTO capability_ledger (capability, provenance, prerequisites, reliability, acquired_at, last_exercised_at, evidence)
VALUES ('companion-stall-recovery-by-filing', 'migrations/2026-10-19-companion-stall-yield.sql (COMPANION-STALL-YIELD-1, personal-companion 1.37.0)', 'personal-companion 1.37.0 deployed; reads agent_issues.created_at through the AUDIT binding and companion_runs through the PERSONAL binding it already holds',
 'the stall issue closes itself only when two pieces landed after it was filed and no two failed generation runs lie between them, with both pieces and the filing time in close_evidence; detector fm-companion-stall-closes-on-one-piece',
 strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
 'the stall issue keeps its age, evidence and priority through a single-piece recovery instead of being closed and refiled hours later (2934 -> 99975 -> 100064)');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766', 'a stall issue that closes on one piece and a run that spends its 600 s budget on drafts the gate keeps rejecting hide the yield problem, so the closer must ask for a second piece and the run must stop work that cannot finish; the verification gate is owner-set and stays as it is',
  'COMPANION-STALL-YIELD-20261019: personal-companion 1.37.0 closes the stall issue only with two pieces since it was filed and no stall between them, bounds its error digest to 24 h, cuts an over-length draft instead of rewriting it, stops a fact-prune loop that repeats the same claim classes without shrinking, and starts no attempt with less budget than the longest attempt of the run cost',
  'agent_issues 100064 and its seven predecessors (close then refile: 99975 closed 2026-10-19T04:04:54Z, 100064 filed 07:00:43Z); the 24 h to 2026-10-19T17:11Z: 158 rejected rows, 29 of them lengths, 46 of 61 runs ended time budget spent after 2 attempts (docs/handoff/2026-10-19-closeout-2.md)',
  'merged through the canonical path', 'one worker, personal-companion; the gate, the ceilings and the floors are unchanged, a stopped loop only ends an attempt that would be rejected', 'revert of personal-companion 1.37.0, or ops_config companion_generation = hold to pause generation',
  'the worker stops a prune loop, an attempt and a rewrite on its own',
  'companion_hours_since_last_piece under 12 at 2026-10-21T09:00:00Z (the metric target), and no stall issue closed by auto-recovery (two pieces since its filing, no stall between them) is followed by a new one within 360 minutes from 2026-10-20T00:00:00Z',
  'reading.q08.org publishes more often', 'd1:qnfo-audit agent_issues, metric_registry; code:personal-companion shortenFeedback, pruneRepeat, attemptBudgetStop, companionStallDetector'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'COMPANION-STALL-YIELD-20261019:') = 1);
