-- PROBE-DRAIN-1 (2026-10-11, pillar autonomy; owner directive 2026-10-11 "Remediate all open items and failure modes, as well as
-- automatic resolution of root causes for future issues 100% autonomously").
-- Measured 09:08Z: failure_modes_recurring 10 (8 detectors unprobed), issues_unprobed_60m 59, 117 of 242 active contracts overdue.
-- Root causes: (1) scripts/remediation_consumer.py probed at most REMEDIATION_MAX_ITEMS (40) contracts per run, and on a quiet
-- main the workflow runs about once an hour (qnfo-cloud-ops dispatches it after 60 idle minutes), while qnfo-fleet-control's
-- hourly tick probed 18-125 (its tick shares the cron invocation with ~20 other steps); (2) an hourly contract was stamped due
-- exactly 60 minutes later, so even a punctual run probed it just outside the 60-minute window issues_unprobed_60m measures.
-- The consumer now drains every due contract per run (batches of 40, 4 in parallel, 300 s budget) and stamps hourly contracts
-- due after 45 minutes. The existing detector fm-unprobed-issues (issues_unprobed_60m <= 10) is this fix's probe.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE failure_modes SET remediation = substr(remediation, 1, instr(remediation, ' | 2026-10-11 PROBE-DRAIN-1') - 1) WHERE fm_key = 'unprobed-issues' AND instr(remediation, ' | 2026-10-11 PROBE-DRAIN-1') > 0

UPDATE failure_modes SET remediation = remediation || ' | 2026-10-11 PROBE-DRAIN-1: the consumer drains every due contract per run (batched, 4 parallel, 300 s budget) and stamps hourly contracts due after 45 minutes; capacity, not cadence, was the root cause (117 of 242 overdue)'
WHERE fm_key = 'unprobed-issues' AND instr(remediation, 'PROBE-DRAIN-1') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01CWLpf5v1NjC9GXbM6rnH4k', 'probe capacity below the hourly contract load is the root cause of unprobed issues and detectors', 'PROBE-DRAIN-1: remediation consumer drains the due set per run, parallel and budgeted; hourly contracts due at 45 minutes', 'remediation_contracts 2026-10-11 09:08Z: 242 active, 117 due; consumer runs probed 0-40 each; fleet-control 18-125 per hour; issues_unprobed_60m 59; failure_modes_recurring 10', 'every open issue and detector is probed inside its hour', 'scripts/remediation_consumer.py only', 'revert the PR', 'the probe loop keeps pace with the backlog as it grows', 'within two hours of merge issues_unprobed_60m <= 10 and failure_modes_recurring <= 2', NULL, 'D1, GitHub runner'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'PROBE-DRAIN-1%');
