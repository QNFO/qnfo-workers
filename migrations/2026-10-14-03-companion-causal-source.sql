-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class IN ('fm-companion-topic-without-causes', 'fm-companion-source-cut-mid-sentence'); DELETE FROM failure_modes WHERE fm_key IN ('companion-topic-without-causes', 'companion-source-cut-mid-sentence'); DELETE FROM decision_log WHERE instr(action, 'COMPANION-CAUSAL-SOURCE-20261014:') = 1; DELETE FROM decision_predictions WHERE origin = 'seeded' AND subject = 'companion_hours_since_last_piece' AND due_at = '2026-10-15T03:00:00Z'
-- COMPANION-CAUSAL-SOURCE-20261014 (pillar personal; agent_issues 2222, 2528). personal-companion 1.24.0 (same pull request): the primary article
-- must state causes, purposes or effects in its visible text, every source is cut at a sentence end, and 41 swallowed catches are logged.
-- Two failure modes with code-read detectors, the decision, and a seeded prediction the calibration scorer judges.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('companion-topic-without-causes', 'the companion picked articles that state no cause, purpose or effect, so the required systems analysis could only be invented and the critic rejected every draft',
  'topic selection screened for decision words (systemsFit) but not for stated causes, and a random article (a palace, a biography, a club) rarely says why anything happened',
  'CAUSAL-SOURCE-1 (personal-companion 1.24.0): among fitted candidates the primary is the first whose visible 6000 characters state at least 6 causes, purposes or effects; else the one stating most',
  'personal-companion/worker.js on main scores candidates by stated causes', 'fm-companion-topic-without-causes', '2026-10-14', 2222,
  'a companion run whose primary article states no causes', 'companion_runs 5829-5911 (01:00-02:11 UTC): critique rejections citing analysis the source "never states" (a tuition freeze''s purpose, a health-driven career change, a grant''s revocability)', 'every companion piece'),
 ('companion-source-cut-mid-sentence', 'each source was cut at a fixed character count, mid-sentence, and the writer quoted the fragment as a fact',
  'fitAnchors sliced every article to its share of the budget without regard to sentence ends',
  'SOURCE-SENTENCE-CUT-1 (personal-companion 1.24.0): a source over its share is cut at the last sentence end inside the share when that keeps at least 60% of it',
  'personal-companion/worker.js on main cuts sources at sentence ends', 'fm-companion-source-cut-mid-sentence', '2026-10-14', 2222,
  'a companion source longer than its share of the budget', 'companion_runs 5836 and 5852: "quotes as fact a sentence fragment from the source material that is cut off mid-sentence"', 'every companion piece');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at) VALUES
 ('fm-companion-topic-without-causes', NULL, 'CAUSAL-SOURCE-1', 'failure-mode detector', '{"paths": ["personal-companion/worker.js"], "contains": "var cs = causalScore(art.text); // CAUSAL-SOURCE-1"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now')),
 ('fm-companion-source-cut-mid-sentence', NULL, 'SOURCE-SENTENCE-CUT-1', 'failure-mode detector', '{"paths": ["personal-companion/worker.js"], "contains": "text: cutAtSentence(a.text, per)"}', 'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'an analysis the critic accepts needs causes the source itself states; choosing a source that states them removes the conflict between the systems-analysis requirement and the grounding rule instead of loosening either',
  'COMPANION-CAUSAL-SOURCE-20261014: personal-companion 1.24.0 prefers a primary article whose visible text states at least 6 causes, purposes or effects (CAUSAL-SOURCE-1), cuts every source at a sentence end (SOURCE-SENTENCE-CUT-1) and logs its 41 swallowed catches (WORKERS-BP-LOGGING-personal-companion-1, agent_issues 2528)',
  'companion_runs 5829-5911 (2026-10-14 01:00-02:11 UTC): ten rejections citing analysis the source never states; fragments cut mid-sentence quoted as fact (5836, 5852); sample of live Wikipedia candidates: Haga Palace 0 stated causes, Sunday football in Northern Ireland 10, Smoot-Hawley Tariff Act 8',
  'merged through the canonical path', 'companion topic selection and source budget; Workers Logs volume', 'revert of personal-companion 1.24.0',
  'the companion picks subjects whose sources explain themselves and never feeds a half sentence to its writer or reviewers',
  'a companion piece is published by 03:00 UTC 2026-10-15 (companion_hours_since_last_piece under 24 at that time)',
  'reading.q08.org publishes again at the owner''s bar',
  'd1:personal-life companion_runs; live Wikipedia extracts; code:personal-companion wikiAnchors, fitAnchors, systemsFit'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'COMPANION-CAUSAL-SOURCE-20261014:') = 1);
INSERT OR IGNORE INTO decision_predictions (decision_id, kind, subject, op, value, due_at, origin)
SELECT id, 'metric', 'companion_hours_since_last_piece', '<', 24, '2026-10-15T03:00:00Z', 'seeded' FROM decision_log WHERE instr(action, 'COMPANION-CAUSAL-SOURCE-20261014:') = 1;
