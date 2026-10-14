-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: INSERT OR REPLACE INTO session_records SELECT * FROM bak_20261014_session_records_01kdd; DELETE FROM decision_predictions WHERE decision_id IN (299, 303) AND origin = 'seeded'; DELETE FROM decision_outcomes WHERE actor = 'session_01Kddqwk5gQT5qSSHVKjT2EA' AND instr(evidence, 'OUTCOMES-9:') = 1
-- SESSION-CLOSEOUT-01KDD (2026-10-14, pillars autonomy and personal; SESSION-RECORD-1). Closes session_01Kddqwk5gQT5qSSHVKjT2EA on the owner's
-- 2026-10-14 instruction to close out the thread and hand every remaining item to server-side loops: the session record (kept first in a
-- backup table), the two predictions still due (seeded for calibration_scorer_tick, which scores issue closure at due time), and the
-- outcomes of the two companion predictions whose window ended at 23:59 UTC.

CREATE TABLE IF NOT EXISTS bak_20261014_session_records_01kdd AS SELECT * FROM session_records WHERE session_id = 'session_01Kddqwk5gQT5qSSHVKjT2EA-20261013';

-- 1. Outcomes whose window has ended (doctrine section 22)
INSERT INTO decision_outcomes (decision_id, ts, observed_outcome, matched, evidence, actor)
SELECT d.id, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'No companion piece was published by 23:59 UTC 2026-10-13.', 0,
  'OUTCOMES-9: personal-life companion_runs: last status ok row id 4563 2026-10-10T04:05:50Z; runs at 21:01, 22:01 and 23:01 UTC ended "no piece survived the gate" (5731, 5767, 5796); steward alert 5797 "stall: no successful piece in 91.0h"; agent_issues 2222 open.',
  'session_01Kddqwk5gQT5qSSHVKjT2EA'
FROM decision_log d WHERE d.id IN (304, 313)
  AND NOT EXISTS (SELECT 1 FROM decision_outcomes x WHERE x.decision_id = d.id AND x.actor = 'session_01Kddqwk5gQT5qSSHVKjT2EA' AND instr(x.evidence, 'OUTCOMES-9:') = 1);

-- 2. Predictions still due, scored by calibration_scorer_tick at due time (issue closure)
INSERT OR IGNORE INTO decision_predictions (decision_id, kind, subject, op, value, due_at, origin) VALUES
 (299, 'issue', '2391', 'closed', NULL, '2026-10-14T16:21:00Z', 'seeded'),
 (303, 'issue', '2489', 'closed', NULL, '2026-10-14T16:14:00Z', 'seeded');

-- 3. The session record
UPDATE session_records SET
  summary = 'Asked (2026-10-13): audit and remediate every failure mode and root cause fleet-wide, resolve all open issues, all KPIs green; then (2026-10-14) close out and hand every remaining item to server-side loops. Done: deploy-guard 1.3.25 SECOND-PATH-CANONICAL-1 (2391 closed), code-orchestrator 0.14.4 EXEC-LOG-SIGNATURE-1 (2488 closed 22:20 on its quiet rule), fleet-control 0.26.1 CI-FEEDBACK-ORDER-1, idea-hub 1.8.6 PROPOSAL-HEADROOM-1 (2489 closed), living-paper abstract repair (fm-paper-abstract-empty passing), 74 companion retraction reasons corrected (2504 closed), and personal-companion 1.21.4 to 1.23.3: critic prune rounds, context links, blockquote grounding, topic prescreen, hourly starved retry, analysis split with rails, writer fit, critic list, final read, auto-mark, lede counted in split and length rails, reframe repair, misplaced analysis line moved, critic told the date, Unicode name check, symbol repair, year ranges. Migrations 33-40 applied ok. reading.q08.org still has no piece (91 h at 23:04 UTC).',
  decisions_made = 'decision_log 297-313, 341, 342, 350, 374 (SECOND-PATH-CANONICAL-1, EXEC-LOG-SIGNATURE-1, CI-FEEDBACK-ORDER-1, PROPOSAL-HEADROOM-1, ABSTRACT-REPAIR-NOW-1, CP-EARLY-MERGE-1153, STARVED-RETRY-HOURLY-1, COMPANION-ANALYSIS-SPLIT-1, COMPANION-PIPELINE-FIT-20261013, COMPANION-REGROUND-KEEP-20261013, COMPANION-REFRAME-REPAIR-1, COMPANION-NIGHT-FIXES-20261013); outcomes recorded for 261, 265, 285, 298, 300, 304, 305, 311, 313 (four matched, five missed).',
  files_changed = 'personal-companion/worker.js and deployed-current.worker.js (1.21.4 -> 1.23.3); personal-companion tests prune-extend, analysis-split, length-lede, reframe-repair, ground-unicode, symbol-year (new), systems-analysis, grounding-repair; qnfo-deploy-guard, qnfo-code-orchestrator, qnfo-fleet-control, idea-hub worker.js and tests; migrations 2026-10-13-33 to 40 and 2026-10-14-01.',
  commits = 'PRs 1153, 1175, 1185, 1188, 1191, 1194, 1195, 1198, 1216, 1218, 1226, 1227 and this closeout PR, all merged to main.',
  handoff_notes = 'Server-side from here, no session needed: (1) agent_issues 2222 closes on its active d1-query contract when a companion piece is created; personal-companion 1.23.3 generates at 04, 08, 12, 16, 20 UTC and retries hourly while starved (up to 24 failed runs a day). The 00:00 UTC run (companion_runs 5798-5807): the first draft passed validation with the analysis line at 59%; REFRAME-TRIGGER-2 ran the edit, which was refused because the editor dropped the analysis line; the critic then scored objection=2 and called every incentive and constraint in the analysis invented. Next levers, in order: re-insert a dropped analysis line at its paragraph instead of refusing the edit; when the critic''s quotes all fall after the analysis line and carry no name, date, number or quotation absent from the source, re-ask a second critic family with the split rule quoted instead of rejecting. Its description keeps a session-task line because the code loop does not take personal-companion as a trusted source (INTAKE-PROVENANCE-1); the next session reading companion_runs should look for "reframe:" stage rows followed by a fact-check row. (2) Predictions 299 and 303 are seeded in decision_predictions and scored by calibration_scorer_tick at 16:14 and 16:21 UTC. (3) Predictions to judge from logs when their windows close: 297 (7 days from 2026-10-13 16:07, code_tasks last_error excerpts), 301 (fm-paper-abstract-empty through the 03:00 UTC sweep), 341 (validate length rejections in companion_runs 20:23 to 20:23 next day, fewer than 10), 342 (companion_retractions 74 re-check rows through 2026-10-20), 350 (a reframe edit kept in the six runs after 21:27), 374 (no emoji-present or year-range rejection in the 24 h after 23:11). (4) CodeQL default setup is still on in the repository settings (an admin setting); PR 1212 precheck skips the advanced analysis until it is turned off. All work claims of this session are released.',
  total_tasks = 52, completed_tasks = 47, execution_ratio = 0.9,
  completed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE session_id = 'session_01Kddqwk5gQT5qSSHVKjT2EA-20261013';
