-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM decision_outcomes WHERE actor = 'session_01Kddqwk5gQT5qSSHVKjT2EA' AND instr(evidence, 'OUTCOMES-8:') = 1; DELETE FROM remediation_contracts WHERE class IN ('fm-companion-analysis-line-misplaced', 'fm-companion-critic-no-date', 'fm-companion-ground-ascii-names', 'fm-companion-symbol-draft-discarded', 'fm-companion-year-range-flagged'); DELETE FROM failure_modes WHERE fm_key IN ('companion-analysis-line-misplaced', 'companion-critic-no-date', 'companion-ground-ascii-names', 'companion-symbol-draft-discarded', 'companion-year-range-flagged'); DELETE FROM decision_log WHERE instr(action, 'COMPANION-NIGHT-FIXES-20261013:') = 1
-- COMPANION-NIGHT-FIXES-20261013 (pillar personal; agent_issues 2222). personal-companion 1.23.1 (PR 1216), 1.23.2 (PR 1218) and 1.23.3
-- (PR 1226), each fixing a defect the 22:00 and 23:00 UTC runs exposed: five failure modes with code-read detectors, the decision, and
-- the outcome of decision 298 (EXEC-LOG-SIGNATURE-1), whose issue closed at 22:20 UTC.

-- 1. Outcome (doctrine section 22)
INSERT INTO decision_outcomes (decision_id, ts, observed_outcome, matched, evidence, actor)
SELECT d.id, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'No pyCompile exec error was logged after qnfo-code-orchestrator 0.14.4 went live, and agent_issues 2488 closed on its 6-hour quiet rule.', 1,
  'OUTCOMES-8: v_loop_breaker_signatures qnfo-code-orchestrator "exec: import base,sys ..." last_ts 2026-10-13T15:31:15Z, before the 0.14.4 deploy (fleet_deploys 5973 16:07:02Z); remediation_verifications issue-2488 pass at 22:20:45 after fails to 21:26:46; agent_issues 2488 closed.',
  'session_01Kddqwk5gQT5qSSHVKjT2EA'
FROM decision_log d WHERE d.id = 298
  AND NOT EXISTS (SELECT 1 FROM decision_outcomes x WHERE x.decision_id = 298 AND x.actor = 'session_01Kddqwk5gQT5qSSHVKjT2EA');

-- 2. Failure modes and detectors
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('companion-analysis-line-misplaced', 'the writer put the analysis line right after its lede, so 93% of the draft was marked analysis and the split was dropped',
  'the rails drop a misplaced line instead of moving it, and the auto-marker only placed a line where the writer left none',
  'ANALYSIS-REMARK-1 (personal-companion 1.23.1): a line placed where the rails fail is removed and placed again by the unmarked-draft rule; where no paragraph holds the rails the draft goes unmarked',
  'personal-companion/worker.js on main moves a misplaced analysis line', 'fm-companion-analysis-line-misplaced', '2026-10-13', 2222,
  'a companion draft whose analysis line breaks the rails', 'companion_runs 5703 and 5742: critique (analysis dropped: analysis 93% > 60%)', 'every companion piece with analysis'),
 ('companion-critic-no-date', 'the critic called recent results the source states fabricated or future-dated',
  'the critic and fact-check models were never told the date, and their training ends before it',
  'CRITIC-TODAY-1 (personal-companion 1.23.1): the critic and every fact-check reviewer read today''s date and are told a recent date or result is judged only against the source',
  'personal-companion/worker.js on main gives the critic and the reviewers today''s date', 'fm-companion-critic-no-date', '2026-10-13', 2222,
  'a companion source that reports this year''s events', 'companion_runs 5744 and 5753: "2026 Serie A2 championship ... the source material explicitly lists as future-dated or unoccurred"', 'every companion piece on a recent subject'),
 ('companion-ground-ascii-names', 'the deterministic name check read only a-z, so an accented name was reported as a fragment ("Ot" for "Otavio") that no repair could use',
  'groundWords and the name scan tokenised with [A-Za-z0-9]; the needle "Ot" matched "not" and "other", so the grounding repair could not delete the one sentence',
  'GROUND-UNICODE-1 (personal-companion 1.23.2): both tokenisers read every Unicode letter after NFC normalisation and compare each word with and without accents',
  'personal-companion/worker.js on main folds accents in the name check', 'fm-companion-ground-ascii-names', '2026-10-13', 2222,
  'a companion source or draft with accented names', 'companion_runs 5766: validate: grounding: name not in the source: Ot', 'every companion piece on a non-English subject'),
 ('companion-symbol-draft-discarded', 'a draft with one arrow was rejected as "emoji present" and no repair ran, not even the grounding repair',
  'hasEmoji counts arrows (U+2190-U+21FF), the writer chains mechanisms as "a -> b", and "emoji present" was outside the deterministic repair, which returns nothing when any other problem is listed',
  'SYMBOL-REPAIR-1 (personal-companion 1.23.3): the repair deletes a sentence holding an arrow or emoji, alone or with grounding needles, inside the quarter cap; the style rule names arrows',
  'personal-companion/worker.js on main repairs symbol sentences', 'fm-companion-symbol-draft-discarded', '2026-10-13', 2222,
  'a companion draft with an arrow or emoji', 'companion_runs 5777, 5786, 5795: validate: emoji present; grounding: figure not in the source: 71', 'every companion piece'),
 ('companion-year-range-flagged', 'a year range the writer abbreviated ("1770-71") was flagged as a figure not in the source although the source states both years',
  'the figure check read the two-digit range end as the number 71',
  'YEAR-RANGE-1 (personal-companion 1.23.3): the two-digit end of a year range is read as the full year it abbreviates; a range end the source lacks is still flagged',
  'personal-companion/worker.js on main reads year-range ends as years', 'fm-companion-year-range-flagged', '2026-10-13', 2222,
  'a companion draft with a year range', 'companion_runs 5777, 5786, 5795: figure not in the source: 71 (source: "the famine of 1770 and 1771")', 'every companion piece on a historical subject');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at) VALUES
 ('fm-companion-analysis-line-misplaced', NULL, 'ANALYSIS-REMARK-1', 'failure-mode detector', '{"paths": ["personal-companion/worker.js"], "contains": "!analysisSplitOk(pre + body)) body = stripAnalysisMark(body);"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now')),
 ('fm-companion-critic-no-date', NULL, 'CRITIC-TODAY-1', 'failure-mode detector', '{"paths": ["personal-companion/worker.js"], "contains": "function todayLine(now)"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now')),
 ('fm-companion-ground-ascii-names', NULL, 'GROUND-UNICODE-1', 'failure-mode detector', '{"paths": ["personal-companion/worker.js"], "contains": "function foldAccents(w)"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now')),
 ('fm-companion-symbol-draft-discarded', NULL, 'SYMBOL-REPAIR-1', 'failure-mode detector', '{"paths": ["personal-companion/worker.js"], "contains": "symbols = true; // SYMBOL-REPAIR-1"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now')),
 ('fm-companion-year-range-flagged', NULL, 'YEAR-RANGE-1', 'failure-mode detector', '{"paths": ["personal-companion/worker.js"], "contains": "nums.has(yr[1] + num)"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

-- 3. Decision
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'each of these rejections came from a measurement or repair defect, not from the gate''s bar, so fixing them keeps every rule and lets a sound draft reach the critic and the fact-check',
  'COMPANION-NIGHT-FIXES-20261013: personal-companion 1.23.1 (ANALYSIS-REMARK-1, CRITIC-TODAY-1, the editor changes only flagged sentences, an edit is kept only when it passes or grounding stays weakest), 1.23.2 (GROUND-UNICODE-1), 1.23.3 (SYMBOL-REPAIR-1, YEAR-RANGE-1, REFRAME-TRIGGER-2)',
  'companion_runs 5733-5797 (22:00 and 23:00 UTC): analysis 93% after the lede, an edit read voice=1 for repeated hedges, "2026 Serie A2" called future-dated, "Ot" for Otavio, three drafts lost to "emoji present", "71" for 1770-71, two invention rejections under systems and objection with no edit; PRs 1216, 1218, 1226 merged, /health 1.23.3-symbol-year at 23:11:42Z',
  'merged through the canonical path', 'the companion validation, repair and critic stages', 'revert of personal-companion 1.23.3 to 1.23.1 in turn',
  'the companion repairs symbol, year-range and accented-name defects deterministically and the critic judges recent events against the source',
  'in the 24 h after 23:11 UTC 2026-10-13, no companion attempt is rejected for "emoji present" or for a year-range end, and at least one reframe edit is kept (a "reframe:" stage row followed by a fact-check row in the same attempt)',
  'reading.q08.org publishes again at the owner''s bar',
  'd1:personal-life companion_runs, companion_anchor_cache; code:personal-companion validatePiece, repairGroundingDraft, groundingProblems, withAutoMark, critiquePiece, factCheckOne, reframePiece'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'COMPANION-NIGHT-FIXES-20261013:') = 1);
