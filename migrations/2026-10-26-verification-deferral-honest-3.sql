-- VERIFICATION-DEFERRAL-HONEST-3 (2026-10-26, charter pillar autonomy; follow-up of migrations/2026-10-26-verification-deferral-honest-2.sql, agent_issues 1000406 VERIFICATION-DEFERRED-7D-1 for issue-100064).
-- WHAT WAS FOUND (read 2026-10-26 18:37Z from live qnfo-audit, two minutes after honest-2 applied at 18:35:29Z): honest-2 parked the deferring contract of issue 100064 as monitoring with the loop-owned verdict text, and
--   the red-drain workflow (step 6, PARKED-REARM-1) re-armed it within the minute: last_verdict "rearmed: PARKED-REARM-1 (was monitoring:loop-owned-48h ...", status active, deferred_since NULL. The rule re-arms a monitoring
--   contract of an open issue and exempts only the loop-owned TEMPLATE: module probe-template-v2%-loop AND a probe that contains "SELECT status FROM agent_issues WHERE id =" (the form
--   contract_probe_templates_loop_merged writes). The contract of issue 100064 carries that module but another probe (it waits for close evidence text on the issue), so it is not the template and was not exempt.
--   Left alone the contract would read pending again at its next verification and start a new 7-day deferral clock, and the issue it was filed for (1000406) would close on a reset, not on a decision.
-- WHAT THIS FILE DOES: the contract of issue 100064 takes the exact form the fleet gives a loop-owned issue at birth (the text of contract_probe_templates_loop_merged for source personal-companion): status monitoring,
--   module probe-template-v2d-loop, the template probe (it reads the status of the issue and says pending for 48 hours and stale after, so a monitoring contract is never probed and cannot block the loop's close),
--   the standard verdict and action, plus the sentence of the decision. personal-companion (companionStallDetector) refreshes the issue every hour and closes it itself with evidence, which is why it is loop-owned.
--   The issue stays open and high with its code-task line for the code loop. One decision_log row.
-- PREDICTION: the contract stays monitoring after the next red-drain run (the exemption holds: module and probe form), 1000406 closes on its own probe (cleared: the contract is not active) and no new
--   VERIFICATION-DEFERRED-7D-1 issue is filed for issue-100064.
-- spof-review: none added. No DELETE or DROP runs in this file, so it names no BACKUP table beyond the one it creates for the Rollback.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261026_vdh3_contract
-- Rollback: UPDATE remediation_contracts SET status = (SELECT b.status FROM bak_20261026_vdh3_contract b WHERE b.class = remediation_contracts.class), last_verdict = (SELECT b.last_verdict FROM bak_20261026_vdh3_contract b WHERE b.class = remediation_contracts.class), verify_probe = (SELECT b.verify_probe FROM bak_20261026_vdh3_contract b WHERE b.class = remediation_contracts.class), action = (SELECT b.action FROM bak_20261026_vdh3_contract b WHERE b.class = remediation_contracts.class), precondition = (SELECT b.precondition FROM bak_20261026_vdh3_contract b WHERE b.class = remediation_contracts.class), next_due_at = datetime('now'), attempts = 0 WHERE class = 'issue-100064' AND instr(action, 'VERIFICATION-DEFERRAL-HONEST-3') > 0;

-- 0. Backup for the Rollback.
CREATE TABLE IF NOT EXISTS bak_20261026_vdh3_contract AS SELECT class, verify_probe, status, last_verdict, action, precondition, next_due_at, deferred_since, attempts FROM remediation_contracts WHERE class = 'issue-100064';

-- 1. The contract takes the loop-owned template form (guarded: only while it is active on the deferral or on the re-arm, and only while the issue is open).
UPDATE remediation_contracts
SET status = 'monitoring', next_due_at = NULL, deferred_since = NULL, attempts = 0,
    last_verdict = 'monitoring:loop-owned-48h (the filing loop closes it; SLA-120M-2 escalation and the stale view report it)',
    module = 'probe-template-v2d-loop',
    precondition = 'filed by a fleet loop under a mapped label (LOOP-SOURCE-HOSTS-1), which owns it for 48h',
    verify_probe = 'SELECT ''ok'' AS expected, CASE WHEN (SELECT status FROM agent_issues WHERE id = 100064) <> ''open'' THEN ''ok'' WHEN (SELECT created_at FROM agent_issues WHERE id = 100064) > (CAST(strftime(''%s'', ''now'') AS INTEGER) - 172800) * 1000 THEN ''pending: filed by ' || (SELECT source FROM agent_issues WHERE id = 100064) || ', which owns it for 48h'' ELSE ''stale: the filing loop ' || (SELECT source FROM agent_issues WHERE id = 100064) || ' did not close it within 48h'' END AS observed',
    action = 'LOOP-OWNED-CONTRACT-MONITORING-1: the filing loop closes this issue on recovery. This contract is parked as monitoring and is not probed, so it cannot block that close (close-while-contract-fails). The 120-minute issue SLA (issues_open_over_120m) and the stale views still report the open issue. VERIFICATION-DEFERRAL-HONEST-3: parked by a recorded decision (decision_log names issue-100064): personal-companion companionStallDetector refreshes this issue hourly and closes it itself with evidence when two pieces have landed since it was filed with no two failed generation runs between them, so the contract of this issue only repeated the loop''s own wait.'
WHERE class = 'issue-100064' AND issue_id = 100064 AND status = 'active' AND instr(action, 'VERIFICATION-DEFERRAL-HONEST-3') = 0
  AND (last_verdict LIKE 'deferred%' OR last_verdict LIKE 'rearmed: PARKED-REARM-1%')
  AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = 100064 AND a.status = 'open' AND a.source = 'personal-companion');

-- 2. The decision (decision_log is append-only: one row, guarded so a replay adds none).
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a2 (remediation session 2026-10-26)',
  'a contract that only repeats its filing loop''s own wait is parked in the form the fleet already uses for a loop-owned issue, because a parked contract in any other form is re-armed within the hour by PARKED-REARM-1',
  'VERIFICATION-DEFERRAL-HONEST-3: contract issue-100064 set to the loop-owned monitoring template (status monitoring, module probe-template-v2d-loop, probe reading the issue status with the 48 hour pending and stale text, standard verdict and action); the issue stays open',
  'read 2026-10-26 18:37Z from live qnfo-audit: honest-2 applied at 18:35:29Z, the contract of issue 100064 read status active with last_verdict "rearmed: PARKED-REARM-1 (was monitoring:loop-owned-48h" and deferred_since NULL one minute later; red-drain step 6 exempts only module probe-template-v2%-loop with a probe containing the issue-status read; issue 100064 source personal-companion, open, high, refreshed 2026-10-26T18:00:36Z by companionStallDetector',
  'applied through the canonical path on merge: the contract is monitoring and survives the next red-drain run, issue 1000406 closes on its own probe',
  'one contract row (status, probe, action, precondition) and one backup table, no issue status, trigger, worker, secret or verification row is touched',
  'the Rollback header of migrations/2026-10-26-verification-deferral-honest-3.sql restores the contract from bak_20261026_vdh3_contract',
  'loop-owned-contract-form-kept',
  'within 120 minutes of apply: contract issue-100064 still monitoring after a red-drain run, VERIFICATION-DEFERRED-7D-1 issue 1000406 closed by its own probe, no new VERIFICATION-DEFERRED-7D-1 issue for issue-100064',
  NULL,
  'node:sqlite replay (migrations/verification-deferral-honest-3.test.mjs) with the live red-drain step 6 condition, the template probe shape, apply_migrations.py --check'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor LIKE 'rem-a2%' AND instr(action, 'VERIFICATION-DEFERRAL-HONEST-3') > 0);
