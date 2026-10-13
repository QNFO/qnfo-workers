-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM decision_outcomes WHERE actor = 'session_01Kddqwk5gQT5qSSHVKjT2EA' AND instr(evidence, 'OUTCOMES-7:') = 1; DELETE FROM remediation_contracts WHERE class IN ('fm-companion-final-text-unread', 'fm-companion-split-lede-uncounted', 'fm-companion-length-lede-undercount'); DELETE FROM failure_modes WHERE fm_key IN ('companion-final-text-unread', 'companion-split-lede-uncounted', 'companion-length-lede-undercount'); DELETE FROM decision_log WHERE instr(action, 'COMPANION-PIPELINE-FIT-20261013:') = 1 OR instr(action, 'COMPANION-REGROUND-KEEP-20261013:') = 1
-- SESSION-CLOSEOUT-3 (2026-10-13, pillars autonomy and personal; agent_issues 2222, 2504). Outcomes of six logged predictions whose
-- window has elapsed, judged from live reads (misses recorded as misses); the decisions behind personal-companion 1.22.1-1.22.7 and the
-- kept withdrawal of the 74 early companion pieces; three companion failure modes found in the 18:00-20:00 UTC runs, each with a
-- code-read detector on the fix that is live on main.

-- 1. Outcomes (doctrine section 22)
INSERT INTO decision_outcomes (decision_id, ts, observed_outcome, matched, evidence, actor)
SELECT d.id, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), o.column2, o.column3, 'OUTCOMES-7: ' || o.column4, 'session_01Kddqwk5gQT5qSSHVKjT2EA'
FROM decision_log d JOIN (VALUES
 (261, 'The first consumer run after the merge probed paper-abstract-empty, and fm-probe-review-refuses-detector read 0 from that run on.', 1, 'remediation_verifications fm-paper-abstract-empty id 28598 2026-10-13 11:52:50 (first probe after the 11:45 decision; it passed from 15:20:27 on); fm-probe-review-refuses-detector 13 of 13 passes 11:52:49 to 20:19:00.'),
 (265, 'No companion piece was published by 16:15 UTC; every run from 11:00 to 16:00 UTC ended with no piece surviving the gate.', 0, 'personal-life companion_runs status ok: last id 4563 2026-10-10T04:05:50Z; failed runs 5410 11:14Z, 5444 12:13Z (critic unavailable), 5474 13:06Z, 5508 14:06Z, 5551 15:08Z, 5581 16:05Z, each no piece survived the gate.'),
 (285, 'No companion piece was published by 20:15 UTC; the 15:00 to 20:00 UTC runs all failed and the 17:00 UTC run never started (the starved retry had used its 16 runs).', 0, 'personal-life companion_runs: failed 5551 15:08Z, 5581 16:05Z, 5628 18:08Z, 5664 19:06Z, 5692 20:06Z; no schema ok row between 16:05Z and 18:01:22Z; steward alert 5693 stall 88.0h.'),
 (300, 'No companion piece was published by 20:15 UTC. The rejections moved from fact-check pruning to the critic and the length floor.', 0, 'personal-life companion_runs 5584-5692: no ok row; 20:00 run rejections 5675 critique grounding=0, 5678 notes length 834, 5684 critique grounding=0, 5688 notes length 702, 5691 notes length 769.'),
 (305, 'deploy-guard, fleet-control and code-orchestrator deployed their new versions within two minutes of the merge, no revert was filed, and agent_issues 2391 closed 15 minutes later.', 1, 'fleet_deploys 5968 qnfo-deploy-guard 16:06:33Z, 5972 qnfo-fleet-control 16:06:49Z, 5973 qnfo-code-orchestrator 16:07:02Z, all ok=1; no CONTROL-PLANE-REVERTED-1 agent_issues row after 15:00Z; issue_lifecycle 2391 dispositioned closed 2026-10-13T16:21:03Z.'),
 (311, 'The 18:00, 19:00 and 20:00 UTC ticks each started a companion run within two minutes of the hour.', 1, 'personal-life companion_runs schema ok: 5584 18:01:22Z, 5630 19:01:16Z, 5666 20:01:30Z (the 17:00 tick before the 1.21.7 deploy started none).')
) o ON o.column1 = d.id
WHERE NOT EXISTS (SELECT 1 FROM decision_outcomes x WHERE x.decision_id = d.id AND x.actor = 'session_01Kddqwk5gQT5qSSHVKjT2EA' AND instr(x.evidence, 'OUTCOMES-7:') = 1);

-- 2. Failure modes and detectors
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('companion-final-text-unread', 'the companion stored text the critic never read: the fact-check prune, extend or revision changed the draft after the critic passed it, and the stored scores belonged to an earlier text',
  'the critic ran once, before the fact-check stage; every later change (sentence deletions, an extension from the source, a model revision) went to storage with the earlier verdict',
  'FINAL-READ-1 (personal-companion 1.22.4): when the text to be stored differs from the text the critic last read, the critic reads it again and the run fails closed if it does not pass; the stored scores are that read''s',
  'personal-companion/worker.js on main re-reads a changed final text', 'fm-companion-final-text-unread', '2026-10-13', 2222,
  'a companion draft changed after the critic passed it', 'owner 2026-10-13 18:05 UTC: q08.org "still publishing banal, vacuous" text; the publish path had no read of the final text', 'every companion piece'),
 ('companion-split-lede-uncounted', 'the analysis split was dropped on every draft: the rails measured the reporting before the analysis line in the body alone, and the writer''s lede, stored apart, was not counted',
  'composePiece stores the first paragraph in piece.lede; analysisSplitOk read body_md only, so a draft whose line followed the lede measured "report 0 chars < 600"',
  'SPLIT-LEDE-1 (personal-companion 1.22.6): the rails, the critic''s choice of body and the auto-marker measure lede + body together',
  'personal-companion/worker.js on main measures the split on lede + body', 'fm-companion-split-lede-uncounted', '2026-10-13', 2222,
  'a companion draft that carries the analysis line', 'companion_runs 5673 "critique (analysis dropped: report 0 chars < 600)", 5682 "report 323 chars < 600"', 'every companion piece with analysis'),
 ('companion-length-lede-undercount', 'the companion length floor measured the body without the lede, so a draft that opened with a paragraph counted 70-120 words fewer than the same draft opening with a heading',
  'composePiece moves the first paragraph to piece.lede only when the draft opens with a paragraph; validatePiece counted body_md alone',
  'LENGTH-LEDE-1 (personal-companion 1.22.7): pieceWords measures lede + body, the lede once and the analysis line not at all; validatePiece, the extend feedback and the stored word count use it; floors unchanged',
  'personal-companion/worker.js on main measures lede + body', 'fm-companion-length-lede-undercount', '2026-10-13', 2222,
  'a companion notes or essay draft whose lede is stored apart', 'companion_runs 5678 notes length 834, 5688 notes length 702, 5691 notes length 769 against floors of 850 and 722', 'every companion piece');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at) VALUES
 ('fm-companion-final-text-unread', NULL, 'FINAL-READ-1', 'failure-mode detector',
  '{"paths": ["personal-companion/worker.js"], "contains": "var qf = await critiquePiece(env, finalPiece, form, ground);"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now')),
 ('fm-companion-split-lede-uncounted', NULL, 'SPLIT-LEDE-1', 'failure-mode detector',
  '{"paths": ["personal-companion/worker.js"], "contains": "analysisSplitOk(splitText(piece))"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now')),
 ('fm-companion-length-lede-undercount', NULL, 'LENGTH-LEDE-1', 'failure-mode detector',
  '{"paths": ["personal-companion/worker.js"], "contains": "var wc = pieceWords(piece); // LENGTH-LEDE-1"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

-- 3. Decisions
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'each companion rejection between 18:00 and 20:00 UTC named a defect in what the pipeline measured or asked for, not in the gate''s bar, so fixing the measurement keeps the bar and lets a sound draft through',
  'COMPANION-PIPELINE-FIT-20261013: personal-companion 1.22.1 WRITER-FIT-1 (the Workers AI writer is asked for the length its floor needs, samples at 0.35; the critic at 0.2), 1.22.2 CRITIC-LIST-1 (the critic lists every invented claim and one prune round removes them all), 1.22.3 ANALYSIS-SPLIT-DIAG-1, 1.22.4 FINAL-READ-1 (the critic re-reads a changed final text, fail closed), 1.22.5 ANALYSIS-AUTO-1 (an unmarked draft gets the analysis line at its first reasoning paragraph where the rails hold), 1.22.6 SPLIT-LEDE-1 and 1.22.7 LENGTH-LEDE-1 (the split rails and the length floor measure the lede with the body)',
  'companion_runs 5584-5692 (18:00-20:00 UTC): critic rejections one invented detail at a time, a stored text the critic had not read, every analysis split dropped as "report 0 chars < 600", notes drafts of 834, 702 and 769 words rejected against 850 and 722 with the lede uncounted; PRs 1188 and 1191 merged, /health 1.22.7-length-lede at 20:23:19Z',
  'merged through the canonical path', 'the companion writer and critic calls and its length and split rails', 'revert of personal-companion 1.22.7 to 1.22.1 in turn',
  'the companion measures a draft the way the reader reads it and never stores a text its critic did not read',
  'in the 24 h after 20:23 UTC 2026-10-13, fewer than 10 companion attempts are rejected on length (validate notes/essay length; 37 in the 24 h before) and at least half of the critique stage rows read "analysis marked"',
  'reading.q08.org publishes again at the owner''s bar',
  'd1:personal-life companion_runs, companion_pieces; code:personal-companion validatePiece, critiquePiece, composePiece, callWorkersAI, verifyPiece'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'COMPANION-PIPELINE-FIT-20261013:') = 1);
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a piece whose record names a topic and no source cannot be checked against a source, so it stays withdrawn; what was wrong was the stated reason, which read as a found error',
  'COMPANION-REGROUND-KEEP-20261013: kept the 74 companion pieces withdrawn on 2026-10-10 withdrawn and replaced their public reason with the re-check reason (they were written before the companion recorded its source material); agent_issues 2504 closed on that measurement',
  'personal-life companion_retractions 74 rows, all with the "Re-checked 2026-10-13 and kept withdrawn" reason, 0 with "Withdrawn: no record of the source material"; backup bak_20261013_companion_retractions; issue_triage 2504 close_evidence',
  'applied to personal-life with a backup table', 'the public retraction notes of 74 withdrawn pieces', 'restore companion_retractions.reason from bak_20261013_companion_retractions',
  'a reader of /retractions is told why each early piece is withdrawn, accurately',
  'no withdrawn companion piece reappears without passing the current two-family fact-check, and companion_retractions keeps 74 rows with the re-check reason through 2026-10-20',
  'the retraction page states the true reason',
  'd1:personal-life companion_retractions, companion_pieces; qnfo-audit agent_issues 2504'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'COMPANION-REGROUND-KEEP-20261013:') = 1);
