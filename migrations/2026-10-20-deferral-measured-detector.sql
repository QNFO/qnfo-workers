-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-measured-pending-deferred'; DELETE FROM failure_modes WHERE fm_key = 'measured-pending-deferred'
-- spof-review: adds no cron, binding or credential; one standing detector contract that reads remediation_contracts and cloud_ops_events, and one failure_modes row.
--
-- DEFERRAL-MEASURED-1 (2026-10-20, charter pillar autonomy; agent_issues 2954, 100245, 100246). Companion to qnfo-fleet-control 0.42.1.
-- A 'pending' read that carries a number against a bound ("pending: unmanaged_direct_spend_share reads 0.5058 (target <= 0.5)") is a measurement that is off
-- target. qnfo-fleet-control's tick deferred it (no verdict, no ledger row, an escalation issue after 7 days about the probe), while scripts/remediation_consumer.py and the
-- D1 trigger remediation_reopen_on_relapse_d1 read it as a failure. Read 2026-10-20 06:00Z: 5 of the 33 classes that deferred in the last 12 hours had this shape
-- (issue-2346, issue-2446, goal-TP-1-AUTONOMY-ENGINE-1, goal-TP-3-FOOTPRINT-TEARDOWN-1, goal-TP-4-COST-FLEET-UNDER-40-1). 0.42.1 makes the tick the third reader
-- that agrees (rtIsMeasuredPending). This detector reads the same condition from SQL alone: an active contract whose last verdict is 'deferred' and whose newest
-- remediation.deferred event (12 hours, the tick writes one per class every 6 hours) is a measured pending. Expected 0 once 0.42.1 is live.
-- Backups: none needed; the file only adds a row to each table and the Rollback deletes exactly those two rows (INSERT OR IGNORE: a row that already existed under these keys would be deleted by the Rollback too, none does as of 2026-10-20).

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('measured-pending-deferred',
  'a verification contract that measures its defect every hour defers for days because its observed text starts with pending',
  'rtIsDeferral in qnfo-fleet-control treated every pending read as a deferral, while the consumer (is_measured_pending) and the D1 relapse trigger read a pending that carries a number against a bound as a failure; the tick deferred 5 of 33 classes in 12 hours on 2026-10-20 and the 7-day sweep then filed escalation issues about the probes (100245, 100246)',
  'DEFERRAL-MEASURED-1 (qnfo-fleet-control 0.42.1): rtIsMeasuredPending makes a measured pending a verdict (pass = 0 row, last_verdict fail, deferred_since cleared). Probes written as measurements say "above target: ..." rather than "pending: ..."',
  'no active contract reads deferred while its newest remediation.deferred event is a pending with a number against a ceiling, target, threshold, limit, "fewer than", "more than" or a comparison operator',
  'fm-measured-pending-deferred', '2026-10-20', 2954,
  'a probe returns pending: <metric> <number> (target <= <number>)',
  'active contracts with last_verdict deferred whose newest deferral event carries a measured value',
  'the closure of every issue and goal whose probe measures it, and the 7-day escalation issues filed about them');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-measured-pending-deferred', NULL, 'DEFERRAL-MEASURED-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(DISTINCT c.class) FROM remediation_contracts c JOIN (SELECT ts, text, lower(substr(text, instr(text, '' observed='') + 10)) AS o FROM cloud_ops_events WHERE kind = ''remediation.deferred'' AND ts >= strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-12 hours'')) e ON substr(e.text, 1, length(c.class) + 17) = ''class='' || c.class || '' transport='' WHERE c.status = ''active'' AND c.last_verdict LIKE ''deferred%'' AND NOT EXISTS (SELECT 1 FROM cloud_ops_events n WHERE n.kind = ''remediation.deferred'' AND n.ts > e.ts AND substr(n.text, 1, length(c.class) + 17) = ''class='' || c.class || '' transport='') AND instr(e.o, ''pending'') = 1 AND e.o GLOB ''*[0-9]*'' AND (instr(e.o, ''ceiling'') > 0 OR instr(e.o, ''target'') > 0 OR instr(e.o, ''threshold'') > 0 OR instr(e.o, ''limit'') > 0 OR instr(e.o, ''fewer than'') > 0 OR instr(e.o, ''more than'') > 0 OR instr(e.o, '' <= '') > 0 OR instr(e.o, '' >= '') > 0 OR instr(e.o, '' < '') > 0 OR instr(e.o, '' > '') > 0)) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));
