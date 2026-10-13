-- Q08-ANALYSIS-DEPTH-1 (2026-10-13, pillar reach; owner 2026-10-13: "q08.org content is totally lacking in context and big-picture
-- systems analysis. Fail, not worth publishing."). Failure mode found in run 380 (published 15:06Z, slug
-- 2026-10-13-character-ai-files-for-bankruptcy-no8f1v): the piece passed the fact check, then the inference prune deleted the sentences the
-- reviewers had labelled INFERENCE, which inside the systems analysis are the analysis itself. The page kept two sentences of it, opening
-- "This information gap ..." about a gap the piece never named, and the whole body was four paragraphs (about 1950 characters).
-- q08-signal-engine 0.20.0 (PR 1151): the inference prune keeps the analysis section, a "This <noun>" sentence left after a cut goes with
-- it, and an essay publishes only with an analysis of at least two paragraphs and 700 characters.
-- Detector: no q08 piece published after the 0.20.0 deploy (15:20Z) has a body under 2400 characters, the shape of a piece whose
-- analysis was cut away (report floor 600 + analysis floor 700 + lede, context and ending).
-- Idempotent (INSERT OR IGNORE).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-outward-prose-analysis-pruned'; DELETE FROM failure_modes WHERE fm_key = 'outward-prose-analysis-pruned';
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('outward-prose-analysis-pruned', 'a published essay keeps a stub of its systems analysis that refers to things the piece never explains', 'after the fact check passed, pruneInferences deleted every sentence the reviewers labelled INFERENCE, including the reasoning in the analysis section, and no check measured what was left of the analysis', 'q08-signal-engine 0.20.0 Q08-ANALYSIS-KEEP-1 (the inference prune keeps the analysis section), Q08-DANGLING-CUT-1 (a "This <noun>" sentence left after a cut goes with it) and Q08-ANALYSIS-DEPTH-1 (publish only with an analysis of at least 2 paragraphs and 700 characters, else one analysis revision)', 'no q08 piece published after 2026-10-13T15:20Z has a body under 2400 characters', 'fm-outward-prose-analysis-pruned', '2026-10-13', NULL, 'a deletion-only repair applied to reasoning text after the checks passed', 'a short essay whose analysis opens "This information gap ..." with no antecedent', 'every reader of q08.org');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-outward-prose-analysis-pruned', NULL, 'Q08-ANALYSIS-DEPTH-1', 'failure-mode detector', 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM published_pieces WHERE published_at >= ''2026-10-13T15:20:00Z'' AND length(body_md) < 2400) AS TEXT) AS observed', 'd1-query@q08-signal', 3, 'q08-signal-engine', 1, 'holding', 'failure-mode', 45000, 5, 0);
