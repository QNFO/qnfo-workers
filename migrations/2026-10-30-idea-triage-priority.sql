-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status='retired' WHERE class='fm-idea-triage-producer-starvation';
-- IDEA-TRIAGE-PRIORITY-1; charter pillar research; QNFO/qnfo-fleet-issues#89.
-- Revert the worker commit to restore stage ordering; retain the append-only decision and failure history.
INSERT OR IGNORE INTO failure_modes
  (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, trigger_condition, symptom, blast_radius)
VALUES
  ('idea-triage-producer-starvation',
   'Idea intake can fill its queue while the consumer is skipped for budget',
   'ideationCycle ran proposal producers before triage, then skipped triage when less than 15 seconds of the soft budget remained',
   'IDEA-TRIAGE-PRIORITY-1: run bounded triage before proposal production, retaining the hard wall deadline and producer headroom limits',
   'Actionable proposals older than 120 minutes with no completed triage in 120 minutes',
   'fm-idea-triage-producer-starvation', '2026-10-30',
   'A slow consume, ask-gap, corpus or think stage spends the cycle budget before triage',
   'Idea intake -> triage backpressure recurs while producers keep filling the queue',
   'idea-hub idea_proposals intake and research admission');

INSERT OR IGNORE INTO remediation_contracts
  (class, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES
  ('fm-idea-triage-producer-starvation', 'IDEA-TRIAGE-PRIORITY-1',
   'failure-mode detector; idea-hub scheduled triage owns remediation',
   'SELECT ''0'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM idea_proposals WHERE status IN (''new'',''deferred_budget'') AND COALESCE(rationale,'''') NOT LIKE ''%[scoring-error%'' AND julianday(created_at) < julianday(''now'',''-120 minutes'')) AND NOT EXISTS (SELECT 1 FROM idea_proposals WHERE status IN (''triaged_accepted'',''triaged_hold'',''deferred_diversity'') AND julianday(triaged_at) >= julianday(''now'',''-120 minutes'')) THEN ''1'' ELSE ''0'' END AS observed',
   'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', datetime('now'));

INSERT INTO decision_log
  (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'copilot-5388',
  'Proposal production must not consume the time needed to drain existing intake',
  'IDEA-TRIAGE-PRIORITY-1: move triage ahead of proposal producers in idea-hub',
  '2026-10-30 live baseline: 15 new proposals, 6 scoring-error markers, latest triage run processed 6; the historic 57-row signal is currently cleared. Offline slow-producer tests reproduce the stage-ordering risk',
  'Branch change; merge and canonical deployment verification pending',
  'idea-hub ideationCycle only; no new public mutation route or binding',
  'Revert worker ordering and retire fm-idea-triage-producer-starvation; keep decision history',
  'The existing bounded triage batch cannot be suppressed by slow proposal producers',
  'One triage attempt per cycle despite slow downstream production; no stale actionable intake without triage progress beyond 120 minutes',
  'No direct reach change; preserve research intake throughput',
  'idea-hub triage-priority, proposal-headroom, reentry-drain, scoring-failure and triage-budget offline suites; D1 read-only baseline'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action = 'IDEA-TRIAGE-PRIORITY-1: move triage ahead of proposal producers in idea-hub');
