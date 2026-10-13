-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-factcheck-waits-for-slowest'; DELETE FROM failure_modes WHERE fm_key = 'factcheck-waits-for-slowest'; DELETE FROM decision_log WHERE instr(action, 'FACTCHECK-FIRST-TWO-1:') = 1
-- FACTCHECK-FIRST-TWO-1 + REVIEWER-HEALTH-1 (2026-10-13, pillar personal; agent_issues 2222, metric companion_hours_since_last_piece).
-- The 11:00 UTC companion run (companion_runs 5397-5411) composed a draft, passed the critic, and was cleaned by two fact prune rounds
-- (8 and 8 sentences removed, 915 then 751 words). It ended rejected with 3 items left because the run's time was spent: every
-- verification took 220 s (fact-check at 139 s, prune rounds at 359 s and 579 s, the final verdict at 799 s). Each verification ran two
-- rounds, and Promise.all made each round wait the full 110 s reviewer timeout for glm-5.3, which failed 10 of its 11 fact-check calls
-- that day (ai_call_counters, average 108 s). The other reviewers answered in 9-40 s.
-- personal-companion 1.19.6 (same pull request) keeps two reviewers in flight and replaces a failed one at once. It asks a third reviewer
-- when two verdicts are not in after 45 s, ends on the second valid verdict from a second family, and asks a reviewer that failed at
-- least half of at least 3 fact-check calls today last. The two-family rule is unchanged.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('factcheck-waits-for-slowest', 'a companion fact-check waits the full reviewer timeout for one hanging reviewer although two other families have answered',
  'factCheck asked reviewers in rounds joined by Promise.all, so a round lasted as long as its slowest call; glm-5.3 failed 10 of 11 fact-check calls on 2026-10-13 after about 108 s each and every verification took 220 s, so the prune ran out of run time with 3 items left',
  'FACTCHECK-FIRST-TWO-1 + REVIEWER-HEALTH-1 (personal-companion 1.19.6): gatherVerdicts keeps two reviewers in flight, replaces a failed one at once, hedges with a third after 45 s and returns on the second valid verdict from a second family; a reviewer failing half of its calls today is asked last',
  'personal-companion/worker.js on main defines gatherVerdicts and factCheck calls it', 'fm-factcheck-waits-for-slowest', '2026-10-13', 2222,
  'one reviewer model hangs or fails slowly on long drafts', 'fact-check stages 220 s apart in companion_runs and a run that ends with "time budget spent" after prune rounds', 'every companion generation run while a reviewer model is degraded');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at) VALUES
 ('fm-factcheck-waits-for-slowest', NULL, 'FACTCHECK-FIRST-TWO-1', 'failure-mode detector',
  '{"paths": ["personal-companion/worker.js"], "contains": "gatherVerdicts(env, ids, draft, ground, FACTCHECK_HEDGE_MS)"}',
  'code-read', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));
UPDATE agent_issues SET
  description = description || char(10) || char(10) || 'FACTCHECK-FIRST-TWO-1 (2026-10-13 11:35 UTC, session_01Kddqwk5gQT5qSSHVKjT2EA): the 11:00 UTC run (1.19.5) reached the fact-check with a draft that passed validation and the critic, and two prune rounds removed 8 and 8 sentences; it stopped with 3 items left because every verification took 220 s, waiting twice for the 110 s timeout of glm-5.3 (10 of 11 fact-check calls failed today). personal-companion 1.19.6 ends a verification on the first two valid verdicts from two families and asks a failing reviewer last, so the five prune rounds fit in the run.',
  updated_at = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE id = 2222 AND status = 'open' AND instr(description, 'FACTCHECK-FIRST-TWO-1') = 0;
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a review that needs two verdicts should not wait for a third reviewer that hangs',
  'FACTCHECK-FIRST-TWO-1: personal-companion 1.19.6 returns a fact-check on the first two valid verdicts from two families, hedges a hanging reviewer after 45 s and asks a reviewer failing half of its calls today last',
  'companion_runs 5404-5408 (2026-10-13 11:00 UTC): verifications 220 s apart; ai_call_counters 2026-10-13 factcheck: glm-5.3 11 calls 10 errors avg 108 s, deepseek-v4-pro avg 9 s, kimi-k2.6 avg 13 s, nemotron avg 40 s',
  'merged through the canonical path', 'the companion fact-check scheduling; the two-family rule is unchanged', 'revert of personal-companion 1.19.6',
  'a degraded reviewer model no longer costs the companion its run', 'the next companion generation run logs its fact-check stages less than 120 s apart and either publishes a piece or ends on a fact-check verdict, not on the time budget', 'reading.q08.org publishes again',
  'd1:companion_runs, ai_call_counters; code:personal-companion factCheck, gatherVerdicts'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'FACTCHECK-FIRST-TWO-1:') = 1);
