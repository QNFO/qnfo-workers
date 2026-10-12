-- Q08-PRUNE-FLOOR-1 (2026-10-12, pillar reach; agent_issues 2286, q08-signal-engine 0.11.17). q08.org published nothing from
-- 2026-10-10 06:05Z: engine_runs 292-332 all ended gate_failed. Since 0.11.13 a draft failing the fact-check is repaired by deleting
-- the reviewers' quoted sentences, but the pruned draft was re-gated at the 2800-character writing floor; a ~3000-character essay
-- minus four sentences fell under it, so the repair fell back to a model revision that wrote new unsupported detail (runs 328-332).
-- 0.11.17 holds a pruned draft to 1500 characters (the audit-repair floor), allows five prune rounds and one model revision, and
-- writes the repair trail into the run error.
-- Detector: q08 publishes at least one piece in any 24 h window in which it finished at least 12 runs (d1-query@q08-signal reads
-- the engine's own D1). Holding until the deploy is live; the first pass after that is the evidence.
-- Idempotent (INSERT OR IGNORE).
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-q08-prune-floor-revision-loop'; DELETE FROM failure_modes WHERE fm_key = 'q08-prune-floor-revision-loop';
INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('q08-prune-floor-revision-loop', 'q08 fact-check repair never converges, so every run ends gate_failed and nothing is published', 'a draft pruned of its unsupported sentences was re-gated at the 2800-character writing floor; under it, the repair fell back to a model revision that reintroduced unsupported detail', 'q08-signal-engine 0.11.17 Q08-PRUNE-FLOOR-1: pruned drafts need 1500 characters, five prune rounds, one model revision at most, repair trail in engine_runs.error', 'a piece published in every 24 h window with at least 12 finished runs', 'fm-q08-prune-floor-revision-loop', '2026-10-10', 2286, 'the fact-check flags sentences in a draft near the 2800-character floor', 'engine_runs gate_failed with accuracy: unsupported claim on consecutive runs, published_pieces unchanged', 'q08.org: no new essay or forecast, the digest and feed go stale');
INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container) VALUES
 ('fm-q08-prune-floor-revision-loop', NULL, 'Q08-PRUNE-FLOOR-1', 'failure-mode detector', 'SELECT ''1'' AS expected, CASE WHEN (SELECT COUNT(*) FROM engine_runs WHERE ran_at > datetime(''now'', ''-24 hours'')) < 12 OR (SELECT COUNT(*) FROM published_pieces WHERE published_at > strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-24 hours'')) > 0 THEN ''1'' ELSE ''0'' END AS observed', 'd1-query@q08-signal', 3, 'q08-signal-engine', 1, 'holding', 'failure-mode', 45000, 5, 0);
