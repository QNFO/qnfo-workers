-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM decision_log WHERE instr(action, 'COMPANION-TOPIC-PRESCREEN-20261013:') = 1 OR instr(action, 'CP-EARLY-MERGE-1153:') = 1
-- Decisions for personal-companion 1.21.6 (TOPIC-PRESCREEN-1, LEDE-PRUNE-EXTEND-1) and for merging control-plane PR 1153 ahead of the
-- stale-PR lane (pillars personal and autonomy; DOCTRINE-1 decision_log with predictions).
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a systems analysis can only be grounded on a subject whose source names parties making choices; the topic picker must see enough candidates to find one, and a draft the fact-check has already cleaned is worth repairing',
  'COMPANION-TOPIC-PRESCREEN-20261013: personal-companion 1.21.6 TOPIC-PRESCREEN-1 (intros of 20 random articles screened in one request, best-fitting read in full first) and LEDE-PRUNE-EXTEND-1 (a fact-pruned draft blocked only by length and/or a lede without the subject is extended and given a subject-naming lede)',
  'companion_runs 5553-5581 (16:00 UTC): four candidates read, none fit, the fallback biography (Alberto Jorge) made the writer invent a foreign-player quota, contract renegotiations and club budgets; all five attempts rejected. companion_runs 5540 (15:06 UTC): the third prune round removed all quoted sentences and was blocked only by length 550 and the lede. Live screen of 20 random intros: Palazzolo v. Rhode Island ranked first, 15 of 20 scored 0',
  'merged through the canonical path', 'the companion topic choice and fact-prune repair', 'revert of personal-companion 1.21.6',
  'the companion writes about subjects whose sources carry the system it must analyse', 'a companion piece is published by 23:59 UTC 2026-10-13 from a primary article that passed systemsFit (no "systems-fit: no candidate fit" note in that run)', 'reading.q08.org publishes again at the owner''s bar',
  'd1:companion_runs; code:personal-companion wikiAnchors, fetchWikiIntros, screenTopics, pruneBlockFixable, pruneRepairFeedback; live Wikipedia intros'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'COMPANION-TOPIC-PRESCREEN-20261013:') = 1);
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a green control-plane pull request that fixes live defects, and blocks a critical fix behind it on the same branch, meets the CLAUDE.md "live defect needs it sooner" exception',
  'CP-EARLY-MERGE-1153: merged control-plane PR 1153 (deploy-guard 1.3.25, code-orchestrator 0.14.4, fleet-control 0.26.1) at 16:07 UTC, about 1.5 h before its stale-PR lane window, with the reason posted on the PR',
  'all checks green on 007e4b2; no HOLD comment; notifications read 16:05 UTC; live defects: agent_issues 2391 reopening, 2488 false loop-breaker issue, code-loop repair rounds reading log noise; companion stall 2222 critical at 84 h with its next fix on the same branch',
  'merged; canonical-deploy canary and deploy-code-orchestrator verify the versions', 'three control-plane workers', 'revert of PR 1153 (canary_revert.py reverts one level on a version miss)',
  'none (one lane-merge data point for lever T1.23 is forgone)', 'deploy-guard 1.3.25, fleet-control 0.26.1 and code-orchestrator 0.14.4 report their versions on /health within 30 minutes with no CONTROL-PLANE-REVERTED-1, and agent_issues 2391 closes within one deploy-guard scan', 'none',
  'github:PR 1153 checks and comments; d1:agent_issues; http:/health of the three workers'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'CP-EARLY-MERGE-1153:') = 1);
