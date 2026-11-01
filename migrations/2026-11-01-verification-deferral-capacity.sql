-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261101_verification_deferral_capacity
-- Rollback: UPDATE capability_ledger SET reliability = (SELECT b.reliability FROM bak_20261101_verification_deferral_capacity b WHERE b.capability = capability_ledger.capability) WHERE capability = 'verification-deferral-escalation';
-- spof-review: none added. This aligns the capability ledger with the existing bounded sweep; the worker's per-tick limit remains 3.
--
-- VERIFICATION-DEFERRED-7D-1 capacity (2026-11-01, charter pillar autonomy; issue 2954).
-- The 12/day allowance could leave the reported 431 overdue contracts without a named escalation for over a month. The
-- worker now permits up to 432/day at the existing three-per-tick limit, enough for that observed backlog within 144 10-minute ticks.

CREATE TABLE IF NOT EXISTS bak_20261101_verification_deferral_capacity AS
SELECT capability, reliability FROM capability_ledger WHERE capability = 'verification-deferral-escalation';

UPDATE capability_ledger
SET reliability = replace(reliability, 'at most 3 issues a tick and 12 in any 24 hours', 'at most 3 issues a tick and 432 in any 24 hours')
WHERE capability = 'verification-deferral-escalation'
  AND instr(reliability, 'at most 3 issues a tick and 12 in any 24 hours') > 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'Copilot PR 5822',
  'the observed backlog of 431 overdue deferrals must be escalated within one day without raising the per-tick issue burst',
  'VERIFICATION-DEFERRED-7D-1 capacity: raise the daily escalation allowance from 12 to 432, retaining the per-tick limit of 3; synchronize the capability ledger',
  'issue 2954 reports 431 contracts overdue; qnfo-fleet-control/verification-path.test.mjs proves 431 deduped issues with a named unblocker and doer are filed within 144 ticks',
  'applied through the CI migration and canonical worker deploy',
  'qnfo-audit.capability_ledger row verification-deferral-escalation',
  'restore the capability ledger from bak_20261101_verification_deferral_capacity and revert the worker cap/version',
  'overdue-deferral-escalation-throughput',
  '431 overdue contracts receive an escalation within 24 hours; per-tick burst remains 3',
  NULL,
  'qnfo-fleet-control/verification-path.test.mjs; node:sqlite migration replay'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'VERIFICATION-DEFERRED-7D-1 capacity:%');
