-- REM-A4-FIRST-PASS-CLOSE-2B (2026-10-26, charter pillar autonomy; remediation session rem-a4). Follow-up of migrations/2026-10-26-rem-a4-first-pass-close-2.sql (agent_issues 1000500, FIRST-PASS-CLOSE-2).
-- The issue was filed by INSERT with a code-probe line, but the D1 trigger agent_issues_code_probe_upd that turns that line into the closing code-read contract fires on UPDATE OF description only, so the
-- issue was left with its born-superseded contract (read 2026-10-26 19:57Z: issue-1000500 superseded, probe-template-v3-generic, closure-observing). This file gives the class issue-<id> the contract
-- the trigger would have written (same shape as issue-1000398: module code-probe-line-v1, transport code-read, the code-probe of the issue), so the consumer reads qnfo-fleet-control/worker.js on main for the
-- marker FIRST-PASS-CLOSE-2 and a pass closes the issue. The marker is absent on main today, so the contract reads fail until the code loop's edit lands.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = 'superseded', last_verdict = 'superseded:rollback rem-a4-first-pass-close-2b', last_attempt_at = datetime('now') WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title LIKE 'FIRST-PASS-CLOSE-2:%' AND source = 'claude-session:rem-a4-closing' ORDER BY id DESC LIMIT 1) AND module = 'code-probe-line-v1'

UPDATE remediation_contracts
   SET status = 'active', verify_transport = 'code-read', module = 'code-probe-line-v1',
       precondition = 'code-probe line in the issue (PROBE-BIRTH-2)',
       action = 'the doer changes the code on main; scripts/remediation_consumer.py reads its checkout of main and a pass closes the issue',
       verify_probe = '{"paths": ["qnfo-fleet-control/worker.js"], "contains": "FIRST-PASS-CLOSE-2"}',
       max_attempts = 3, expected_cadence_h = 1, last_verdict = NULL, last_attempt_at = NULL, attempts = 0, deferred_since = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title LIKE 'FIRST-PASS-CLOSE-2:%' AND status = 'open' AND source = 'claude-session:rem-a4-closing' ORDER BY id DESC LIMIT 1)
   AND status = 'superseded' AND COALESCE(module, '') = 'probe-template-v3-generic';

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a4-closing',
  'an issue filed by INSERT does not get the code-read contract of its code-probe line (the D1 trigger fires on UPDATE of description only), so the session that files it writes the contract itself',
  'REM-A4-FIRST-PASS-CLOSE-2B: contract issue-<FIRST-PASS-CLOSE-2> rewritten from the born-superseded template to the code-read contract of its code-probe line',
  'qnfo-audit 2026-10-26 19:57Z: issue 1000500 had only issue-1000500 superseded probe-template-v3-generic; issue-1000398 (filed with the same line) carries module code-probe-line-v1, transport code-read; trigger agent_issues_code_probe_upd is AFTER UPDATE OF description',
  'applied by migration', 'one contract row; no worker, cap, cron, guard or trigger change', 'the Rollback line',
  'issues filed by migration with a code-probe line close on the code state like the ones filed by UPDATE',
  'the contract reads fail (marker absent) until the code loop edits qnfo-fleet-control/worker.js, then passes and closes the issue',
  'none (internal closing machinery)',
  'read-only D1 queries of the contract rows and the trigger text; offline replay in migrations/rem-a4-first-pass-close-2b.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE d.action LIKE 'REM-A4-FIRST-PASS-CLOSE-2B:%');
