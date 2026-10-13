-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-companion-analysis-judged-as-reporting'; DELETE FROM failure_modes WHERE fm_key = 'companion-analysis-judged-as-reporting'; DELETE FROM decision_log WHERE instr(action, 'COMPANION-ANALYSIS-SPLIT-1:') = 1
-- COMPANION-ANALYSIS-SPLIT-1 (2026-10-13, pillar personal; agent_issues 2222). personal-companion 1.22.0 (same pull request) marks the
-- writer's analysis with an invisible line and reviews it for concrete invented facts only, the q08-signal-engine 0.19.0 pattern that
-- session_01BCBpN3cZdS57dweqCs9rwt reported working on q08 (runs 376-378). Failure mode, code-read detector and the decision.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('companion-analysis-judged-as-reporting', 'the companion requires a context and systems analysis, and its critic and fact-check judge every analysis sentence by the reporting rule, so drafts are rejected or pruned for the analysis they were asked to write',
  'one rule for the whole draft: the critic scores grounding 0 for any sentence the source does not state, and the reviewers list analysis as unsupported claims',
  'ANALYSIS-SPLIT-1 (personal-companion 1.22.0): the writer marks its analysis with <!-- analysis -->; after the line the critic and the reviewers count only concrete invented facts; guard rails (600 characters of reporting, at most 60% analysis, one line); the line is removed before storing',
  'personal-companion/worker.js on main carries the analysis split', 'fm-companion-analysis-judged-as-reporting', '2026-10-13', 2222,
  'a companion draft with a systems analysis', 'companion_runs 5567-5580: critique grounding=0 and specificity=3 for "fabricated economics" and incentive claims in the analysis', 'every companion piece');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at) VALUES
 ('fm-companion-analysis-judged-as-reporting', NULL, 'ANALYSIS-SPLIT-1', 'failure-mode detector',
  '{"paths": ["personal-companion/worker.js"], "contains": "var fc = await factCheck(env, reviewText(text), ground, writerModel, seedText);"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'reasoning about incentives and consequences is the analysis the owner asked for; only concrete invented facts must be refused there, and the reporting keeps the full rule',
  'COMPANION-ANALYSIS-SPLIT-1: personal-companion 1.22.0 marks the analysis with <!-- analysis -->; after the line the critic and the fact-check count only concrete invented facts; the deterministic name, year and figure check reads the whole text; the line is removed before storing',
  'companion_runs 5519-5580 (15:00 and 16:00 UTC): critic grounding rejections on incentive and economics claims in the analysis; q08-signal-engine 0.19.0 split (session_01BCBpN3cZdS57dweqCs9rwt, messages 13:12 and 16:16 UTC) moved q08 off the same contradiction',
  'merged through the canonical path', 'the companion critic and fact-check prompts and what they read', 'revert of personal-companion 1.22.0',
  'the companion can publish analysis without the reviewers reading it as reporting', 'a companion piece is published by 23:59 UTC 2026-10-13 and its stored body carries no <!-- analysis --> line', 'reading.q08.org publishes again at the owner''s bar',
  'd1:companion_runs, companion_pieces; code:personal-companion verifyPiece, critiquePiece, persistPiece, P_STYLE, P_CRITIQUE, FACTCHECK_PROMPT'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'COMPANION-ANALYSIS-SPLIT-1:') = 1);
