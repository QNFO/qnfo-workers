-- JOURNEY-MAIN-FRESH-1 (2026-10-19, charter pillar: core; agent_issues 100076). The deploy-coherence journey in scripts/fleet_journeys.py
-- compared each live /health version with the worker.js of the remediation consumer's own checkout. The consumer job queues
-- (cancel-in-progress false), so its checkout can be several merges behind main: on 2026-10-19 07:51Z 8 of 41 steps failed with every
-- live version AHEAD of the checkout and equal to main (qnfo-code-orchestrator checkout 0.18.22, live and main 0.18.24). The journey
-- now reads the newest origin/main before it calls a mismatch. This file records the failure mode; its detector is the journey's own
-- self-closing issue contract (issue-100076), which passes the first run every step passes.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM failure_modes WHERE fm_key = 'journey-checkout-behind-main'

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius) VALUES
 ('journey-checkout-behind-main', 'the deploy-coherence journey reports live != main for workers deployed after its checkout', 'fleet_journeys.py read the expected VERSION from the queued consumer run''s checkout, which can lag origin/main by several merges', 'JOURNEY-MAIN-FRESH-1: on a mismatch the journey reads <dir>/worker.js from a shallow fetch of origin/main and passes when live equals it', 'issue-100076: FLEET-JOURNEY-FAILED-1 deploy-coherence closes the first run every step passes', 'issue-100076', '2026-10-19T07:51:01Z', 100076, 'several merges land while a remediation-consumer run waits in its concurrency queue', 'FLEET-JOURNEY-FAILED-1 deploy-coherence with every failing step live ahead of main', 'fleet health signal: a false deploy-drift alarm on up to every worker merged since the checkout');
