-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-companion-reasoning-stated-as-fact'; DELETE FROM failure_modes WHERE fm_key = 'companion-reasoning-stated-as-fact'; DELETE FROM decision_log WHERE instr(action, 'COMPANION-REFRAME-REPAIR-1:') = 1
-- COMPANION-REFRAME-REPAIR-1 (2026-10-13, pillar personal; agent_issues 2222). personal-companion 1.23.0 (PR 1195, live 21:27 UTC) rewrites
-- reasoning the writer stated as fact into explicit reasoning before the critic prune deletes it. Failure mode, code-read detector, decision.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('companion-reasoning-stated-as-fact', 'the companion writer states motives, mechanisms and reward systems as facts, so the critic rejects every draft and the prune can only delete the analysis the reader asked for',
  'the compose prompt asks for a systems analysis and for every unsourced sentence to read as reasoning, and the Workers AI writer does not keep that rule over a long draft; the only repair for a critic rejection was deleting the quoted sentences, and each new draft invented again',
  'REFRAME-REPAIR-1 (personal-companion 1.23.0): on a critic rejection for grounding or argument, one editor call (writer family, critic temperature) rewrites each flagged sentence in place as explicit reasoning or deletes an invented event; kept only when it validates, keeps length (85-115%), headings and analysis line, and the critic reads it no worse',
  'personal-companion/worker.js on main runs the reframe repair before the critic prune', 'fm-companion-reasoning-stated-as-fact', '2026-10-13', 2222,
  'a companion draft the critic rejects for grounding or argument', 'companion_runs 5705, 5712, 5718, 5725, 5730 (2026-10-13 21:00 UTC): "invented motivational claims", "fabricated systemic mechanisms", "reward systems ... presented as facts"', 'every companion piece');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at) VALUES
 ('fm-companion-reasoning-stated-as-fact', NULL, 'REFRAME-REPAIR-1', 'failure-mode detector',
  '{"paths": ["personal-companion/worker.js"], "contains": "var rf = await reframePiece(env, piece, ground, q.why, q.invented);"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a model asked to fix named sentences in place follows the reasoning rule better than one asked to write a whole piece under it, and the critic stays an independent family because the editor never runs on its first model',
  'COMPANION-REFRAME-REPAIR-1: personal-companion 1.23.0 adds one editor pass on a critic rejection for grounding or argument; flagged reasoning stated as fact is rewritten as explicit reasoning in place, invented events are deleted, nothing is added; the edit is kept only when it validates, keeps its length, headings and analysis line, and the critic reads it no worse',
  'companion_runs 5699-5731 (21:00 UTC): the analysis split held at 36-57% on four drafts and the critic rejected all five for reasoning stated as fact; three prune rounds removed 19 sentences from one draft and the critic still found more; PR 1195 merged, /health 1.23.0-reframe-repair at 21:27:18Z',
  'merged through the canonical path', 'the companion critic stage: one extra Workers AI call per rejected attempt', 'revert of personal-companion 1.23.0',
  'the companion repairs reasoning stated as fact instead of deleting the analysis or discarding the draft',
  'in the six companion runs after 21:27 UTC 2026-10-13, at least one draft is kept by the reframe repair and passes the critic (a "reframe:" stage row followed by a fact-check stage row in the same attempt)',
  'reading.q08.org publishes again at the owner''s bar',
  'd1:personal-life companion_runs; code:personal-companion reframePiece, critiquePiece, callWorkersAI'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'COMPANION-REFRAME-REPAIR-1:') = 1);
