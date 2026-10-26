-- REM-A4-FIRST-PASS-CLOSE-2 (2026-10-26, charter pillar autonomy; remediation session rem-a4, closing-machinery package). Sibling of FIRST-PASS-CLOSE-1 (the consumer, scripts/remediation_consumer.py, PR 4883).
-- The same defect sits in qnfo-fleet-control remediationContractsTick (the hourly second verifier of d1-query contracts): it writes the pass row into remediation_verifications first and stamps the
-- contract's last_verdict afterwards, so remediation_verification_autoclose_ins (which refuses while a contract of the issue still reads fail) cannot close an issue on the first passing read of a
-- contract that had been failing. qnfo-fleet-control/worker.js is claimed by the code loop at the time of writing, so the edit is filed for the code loop (a code-task line with its anchor and its
-- code-probe), which owns control-plane edits since CODE-LOOP-CONTROL-PLANE-1. Measured on qnfo-audit over 3 days of trigger closes (2026-10-26 19:45Z): 79 of 212 closes of never-reopened issues
-- waited a second read, 6.2 hours on average.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: INSERT INTO issue_triage (issue_id, rc, triage_state, owner, sla_due_at, close_evidence) SELECT id, 'rollback:rem-a4-first-pass-close-2', 'closed', 'rem-a4-closing', datetime('now'), 'withdrawn by the Rollback line of migration 2026-10-26-rem-a4-first-pass-close-2' FROM agent_issues WHERE title LIKE 'FIRST-PASS-CLOSE-2:%' AND status = 'open' AND source = 'claude-session:rem-a4-closing' ON CONFLICT(issue_id) DO UPDATE SET rc = excluded.rc, triage_state = 'closed', owner = excluded.owner, close_evidence = excluded.close_evidence

INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'FIRST-PASS-CLOSE-2: qnfo-fleet-control remediationContractsTick writes the pass row before it stamps the contract, so the autoclose trigger cannot close on the first passing read',
  'Charter pillar: autonomy. Closing machinery. Sibling of FIRST-PASS-CLOSE-1 (scripts/remediation_consumer.py, PR 4883).' || char(10) ||
  'Defect: remediation_verification_autoclose_ins and issue_close_evidence_required refuse to close an issue while a contract of it carries a refusal verdict (fail, vacuous-probe-result, probe-error, probe-not-machine-executable, probe-same-account-host) in remediation_contracts.last_verdict. remediationContractsTick (qnfo-fleet-control/worker.js, the d1-query second verifier) inserts the pass row into remediation_verifications first and stamps the contract afterwards, so the trigger reads the verdict of the previous tick: the first passing read of a contract that had been failing never closes its issue, the next read does. Measured on qnfo-audit over 3 days of trigger closes (2026-10-26 19:45Z): 257 closes, of the 212 never-reopened issues 79 had an earlier pass since the contract''s last fail and waited 6.2 hours on average for the second read (the 45 reopened issues need two consecutive passes by design and are unchanged). The consumer half is fixed by PR 4883; the tick verifies the same contracts about every 30 minutes.' || char(10) ||
  'Change in qnfo-fleet-control/worker.js, remediationContractsTick, the branch that records a verdict (the line var passed = es === os ? 1 : 0; has the anchor below): directly after it add the comment line FIRST-PASS-CLOSE-2 (same defect as scripts/remediation_consumer.py, PR 4883) and one statement: if (passed) { try { await db.prepare("UPDATE remediation_contracts SET last_verdict = ''pass'' WHERE class = ?1 AND status IN (''active'', ''holding'') AND COALESCE(last_verdict, '''') IN (''fail'', ''vacuous-probe-result'', ''probe-error'', ''probe-not-machine-executable'', ''probe-same-account-host'')").bind(c.class).run(); } catch (eS) { console.error(JSON.stringify({ evt: "fleet-control:remediationTick:pass-prestamp", class: c.class, error: String(eS && eS.message) })); } } so the stored refusal verdict is moved to pass immediately before the pass row is written (the stamp after the row writes the same verdict). A fail, a deferral and a contract in any other status are untouched. Bump the VERSION patch number, keep deployed-current.worker.js identical, and extend the remediation tick suite (qnfo-fleet-control/remediation-transports.test.mjs or the suite that already replays the autoclose trigger) with a case: a contract at last_verdict fail whose probe now passes closes its open issue on that tick, a reopened issue still needs two passes. Never put a star-slash pair inside a block comment.' || char(10) ||
  'Definition of done: qnfo-fleet-control/worker.js on main holds FIRST-PASS-CLOSE-2 (the code-probe below) and the canonical deploy is live. Outcome to read afterwards (not the closing probe): over a day with at least 5 trigger closes, none of the never-reopened closes has an earlier pass since the contract''s last fail.' || char(10) ||
  'code-task: repo=qnfo-workers path=qnfo-fleet-control/worker.js' || char(10) ||
  'code-anchor: var passed = es === os ? 1 : 0;' || char(10) ||
  'code-probe: {"paths": ["qnfo-fleet-control/worker.js"], "contains": "FIRST-PASS-CLOSE-2"}',
  'claude-session:rem-a4-closing', 'autonomy', 'medium', 'open', CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.title LIKE 'FIRST-PASS-CLOSE-2:%' AND a.status = 'open');

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a4-closing',
  'a defect found in a second verifier is filed with a doer and a closing probe in the same change that fixes the first one, never left as prose',
  'REM-A4-FIRST-PASS-CLOSE-2: issue FIRST-PASS-CLOSE-2 filed for qnfo-fleet-control remediationContractsTick (code-task line, anchor, code-probe)',
  'qnfo-audit 2026-10-26 19:45Z: 257 trigger closes in 3 days, 212 never reopened, 79 with an earlier pass since the contract''s last fail, 6.23 hours mean wait; worker.js line var passed = es === os ? 1 : 0; occurs once; the tick inserts the verification row before it stamps last_verdict',
  'applied by migration', 'one agent_issues row; no worker, cap, cron, guard or trigger change',
  'the Rollback line closes the issue it filed',
  'the second verifier gets the same first-pass close as the consumer',
  'the code loop takes the issue, the edit lands and the code-read contract passes; closes would then no longer wait a second tick',
  'none (internal closing machinery)',
  'read-only D1 queries of the closes and verifications, the worker source for the anchor'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REM-A4-FIRST-PASS-CLOSE-2:%');
