-- INFRA-CLOSEOUTS-1 (2026-10-26, QNFO.INFRA slice of the fleet breach remediation). Closes an issue only when the live table it names holds the evidence at apply time (OWNER-NO-LOOSE-ENDS-1: closure
-- needs issue_triage.close_evidence, a measurement, never "deployed"). A condition that does not hold at apply leaves the issue open.
--   1000271 FLEET-TICK-HEAVY-SECOND-PRODUCER-1: "Done when fleet_tick_heavy has a cron:qnfo-fleet-dashboard row in 6 h". The dashboard insert existed since 1.71.1 but its 9-minute guard was always met by the
--   primary, so the table held no dashboard row for 12 hours (61 rows, all cron:qnfo-code-orchestrator, read 2026-10-26 16:25Z). qnfo-fleet-dashboard 1.71.2 (STANDBY-PROOF-2, PR 4702) writes when it has no row
--   of its own in 6 hours; the first row landed at 17:30Z (read 2026-10-26 17:41Z).
-- REPAIR (same day): the first run of this file failed on the live trigger issue_close_evidence_required ("close-while-contract-fails"). By then the issue's own d1 contract (issue-1000271, the same
-- definition of done as a probe) was active with a failing last verdict from 17:27Z, three minutes before the first dashboard row, and the trigger refuses a close while an active contract of the issue
-- fails. The statement now leaves the issue to that contract in that state (the contract closes it through the autoclose trigger on its next pass) and closes it here only when no active contract fails.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE agent_issues SET status = 'open', close_channel = NULL WHERE id = 1000271 AND close_channel LIKE 'auto:triage-sync%'; UPDATE issue_triage SET triage_state = 'triaged' WHERE issue_id = 1000271 AND rc = 'infra-closeout:STANDBY-PROOF-2'

INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence)
SELECT a.id, 'infra-closeout:STANDBY-PROOF-2', 'closed', 'qnfo-fleet-dashboard', datetime('now'),
  'fleet_tick_heavy row ' || h.id || ' (source ' || h.source || ', ts ' || h.ts || ') was written by qnfo-fleet-dashboard 1.71.2 (STANDBY-PROOF-2, PR 4702) while the primary cron:qnfo-code-orchestrator was fresh, inside the 6 hours the definition of done asks for. Before the change the table held no dashboard row in 12 hours. Closed once by migration 2026-10-26-infra-closeouts from the fleet_tick_heavy fact only.'
FROM agent_issues a
JOIN (SELECT id, source, ts FROM fleet_tick_heavy WHERE source LIKE 'cron:qnfo-fleet-dashboard%' AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-360 minutes') ORDER BY id DESC LIMIT 1) h
WHERE a.id = 1000271 AND a.status = 'open' AND a.title LIKE 'FLEET-TICK-HEAVY-SECOND-PRODUCER-1:%'
  AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding') AND COALESCE(c.last_verdict, '') IN ('fail', 'vacuous-probe-result', 'probe-error', 'probe-not-machine-executable', 'probe-same-account-host'))
ON CONFLICT(issue_id) DO UPDATE SET rc = excluded.rc, triage_state = 'closed', owner = excluded.owner, close_evidence = excluded.close_evidence;
