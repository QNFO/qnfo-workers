-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM decision_log WHERE instr(action, 'COMPANION-TOPIC-PRESCREEN-20261013:') = 1 OR instr(action, 'CP-EARLY-MERGE-1153:') = 1 OR instr(action, 'PROPOSAL-HEADROOM-1:') = 1; DELETE FROM remediation_contracts WHERE class = 'fm-producer-batch-overshoots-backpressure'; DELETE FROM failure_modes WHERE fm_key = 'producer-batch-overshoots-backpressure' (the issue-2489 probe keeps its new text; its birth probe is in remediation_verifications history)
-- Decisions for personal-companion 1.21.6 (TOPIC-PRESCREEN-1, LEDE-PRUNE-EXTEND-1) and for merging control-plane PR 1153 ahead of the
-- stale-PR lane (pillars personal and autonomy; DOCTRINE-1 decision_log with predictions), and idea-hub 1.8.6 PROPOSAL-HEADROOM-1 for the owner
-- task agent_issues 2489 ("Idea intake -> triage stuck with backpressure: 35 waiting (new <= 30)"): the failure mode, its d1-query detector,
-- the issue's closing probe (the chain's own limit) and the decision.
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('producer-batch-overshoots-backpressure', 'the idea triage queue sits above its integration-chain limit (new <= 30) although every producer obeys backpressure',
  'each idea-hub batch producer checked only that the queue was at or under PROPOSAL_BACKPRESSURE (30) and then added a whole batch (re-entry up to 6 questions, ask gaps up to ASK_GAP_BATCH, notebook up to OWNER_CORPUS_BATCH), while triage takes 5 a cycle; auto-reentry and owner-corpus added about 6 an hour on 2026-10-13',
  'PROPOSAL-HEADROOM-1 (idea-hub 1.8.6): the batch producers fill the queue only up to PROPOSAL_FILL_TO (25), counting what the same cycle added; a signal is consumed whole or left new',
  'idea_proposals new and deferred_budget at or under 30', 'fm-producer-batch-overshoots-backpressure', '2026-10-13', 2489,
  'producers adding more per cycle than triage takes', 'owner task op-mv6meusn21b1: Idea intake -> triage 35 waiting (new <= 30)', 'the idea intake chain and the owner''s notebook intake');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at) VALUES
 ('fm-producer-batch-overshoots-backpressure', NULL, 'PROPOSAL-HEADROOM-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CASE WHEN (SELECT COUNT(*) FROM idea_proposals WHERE status IN (''new'', ''deferred_budget'')) <= 30 THEN ''0'' ELSE CAST((SELECT COUNT(*) FROM idea_proposals WHERE status IN (''new'', ''deferred_budget'')) AS TEXT) END AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));
UPDATE remediation_contracts SET verify_transport = 'd1-query',
  verify_probe = 'SELECT ''0'' AS expected, CASE WHEN (SELECT COUNT(*) FROM idea_proposals WHERE status IN (''new'', ''deferred_budget'')) <= 30 THEN ''0'' ELSE CAST((SELECT COUNT(*) FROM idea_proposals WHERE status IN (''new'', ''deferred_budget'')) AS TEXT) END AS observed'
WHERE class = 'issue-2489';
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'backpressure that checks a threshold and then adds a whole batch overshoots the threshold by the batch; producers must fill to a level, not past it',
  'PROPOSAL-HEADROOM-1: idea-hub 1.8.6 batch producers (re-entry, ask gaps, owner notebook) fill the triage queue only up to 25; triage speed is unchanged, because accepted ideas already wait in research_queue deferred (173 against a target of 60)',
  'idea_proposals new 31 at 15:30 UTC, oldest 09:01; producers since 2026-10-12 15:00: auto-reentry 84, owner-corpus 59; idea-triage-budget 14:36 UTC: 5 triaged; research_deferred_pool 173',
  'merged through the canonical path', 'the idea intake producers', 'revert of idea-hub 1.8.6',
  'the intake chain stays inside its limit without dropping an idea', 'idea_proposals new + deferred_budget reads 30 or less at every hourly read from the second ideation cycle after the deploy for 24 h, and agent_issues 2489 closes on its probe', 'none',
  'd1:idea_proposals, cloud_ops_events idea-triage-budget, research_queue; code:idea-hub runConsume, runAskGap, runOwnerCorpus, ideationCycle'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'PROPOSAL-HEADROOM-1:') = 1);
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
