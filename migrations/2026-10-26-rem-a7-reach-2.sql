-- REM-A7-REACH-2 (2026-10-26; follow-up to migrations/2026-10-26-rem-a7-reach.sql, applied 18:30:39Z, migration_runs 663). Two things that file wrote did not hold, both read in qnfo-audit at 18:34Z:
--   1. EMAIL-TIER2-GATE-1 (agent_issues 1000469) carries a code-probe line, but its contract stands at status superseded with the generic birth template (the birth trigger for the probe line fires before the
--      generic template is written, the same order RUNTIME-LIVENESS-GAP-3 met), so the issue had no probe that could fail or pass. CLAUDE.md: a session that gives an issue its probe uses UPDATE on class issue-<id>.
--      The probe is the one the issue names: qnfo-email/worker.js carries the owner switch email_tier2_autosend (absent on main today, so it fails until the guard exists).
--   2. The owner card gsc-service-account-user (human_actions 183) was closed at birth by the trigger human_actions_default_adopt_ai ("DEFAULT-ADOPTED-1: closed at birth on its stated default"), because the card
--      has a stated default and is not a decision card. The step it names, adding the fleet's service account as a user of the qnfo.org Search Console property, needs the owner's Google account and
--      nothing else can take it (IDENTITY-BOUND), so a card that reads resolved hides the one open step of agent_issues 2924. It is reopened, as the resolution text itself offers (status = open); the trigger fires on
--      insert only, so the reopen holds. The card's default text is unchanged: nothing is blocked while it waits.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: UPDATE remediation_contracts SET status = 'superseded', verify_transport = 'd1-query', module = 'probe-template-v3-generic', verify_probe = 'SELECT ''closed'' AS expected, (SELECT CASE WHEN status IN (''closed'', ''resolved'') THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = ' || substr(class, 7) || ') AS observed', last_verdict = 'superseded:rollback REM-A7-REACH-2' WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title LIKE 'EMAIL-TIER2-GATE-1:%' ORDER BY id DESC LIMIT 1) AND module = 'rem-a7-reach-v1'; UPDATE human_actions SET status = 'resolved', resolved_at = datetime('now'), updated_at = datetime('now'), resolution = 'DEFAULT-ADOPTED-1: closed at birth on its stated default (owner directive 2026-10-12). Reopen with status=open.' WHERE slug = 'gsc-service-account-user' AND status = 'open' AND source = 'session:rem-a7-f1'

UPDATE remediation_contracts
   SET verify_transport = 'code-read',
       verify_probe = '{"paths": ["qnfo-email/worker.js"], "contains": "email_tier2_autosend"}',
       status = 'active', module = 'rem-a7-reach-v1', attempts = 0, last_verdict = NULL, next_due_at = datetime('now'), expected_cadence_h = 1, max_attempts = 3,
       precondition = 'the code-probe line of the issue (EMAIL-TIER2-GATE-1), set by REM-A7-REACH-2 because the birth template replaced the probe-line contract',
       action = 'the doer adds the owner switch email_tier2_autosend (absent or off: a tier 2 row takes the tier 3 handoff, nothing is sent without the owner) and the outreach-recipient and complaint rules to qnfo-email/worker.js; scripts/remediation_consumer.py reads worker.js on main every hour and a pass closes the issue. Nothing is sent or enabled by this contract.'
 WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title LIKE 'EMAIL-TIER2-GATE-1:%' AND status = 'open' ORDER BY id DESC LIMIT 1)
   AND status = 'superseded' AND instr(verify_probe, 'SELECT ''closed'' AS expected') = 1;

UPDATE human_actions
   SET status = 'open', resolved_at = NULL, resolution = NULL, updated_at = datetime('now')
 WHERE slug = 'gsc-service-account-user' AND status = 'resolved' AND source = 'session:rem-a7-f1' AND instr(COALESCE(resolution, ''), 'DEFAULT-ADOPTED-1') = 1;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a7-f1:reach-closeouts-2',
  'a step only the property owner can take must stay visible as open work, and an issue that names a code probe needs a contract that executes it; both were replaced by generic machinery at birth',
  'agent_issues 1000469: its contract becomes an active hourly code-read probe for email_tier2_autosend in qnfo-email/worker.js; human_actions 183 gsc-service-account-user reopened (migrations/2026-10-26-rem-a7-reach-2.sql)',
  'qnfo-audit 2026-10-26 18:34Z: remediation_contracts issue-1000469 status superseded, module probe-template-v3-generic; human_actions 183 status resolved, resolution DEFAULT-ADOPTED-1 closed at birth (trigger human_actions_default_adopt_ai); migration_runs 663 ok for migrations/2026-10-26-rem-a7-reach.sql',
  'pending post-apply measurement',
  'one remediation_contracts row and one human_actions row; no worker, send path, secret or property setting changes',
  'the Rollback line restores the superseded template and re-resolves the card; decision_log stays append-only',
  'EMAIL-TIER2-GATE-1 has a probe that executes; the Search Console step is an open card',
  'issue-1000469 reads fail until qnfo-email carries the switch, then passes and closes; the card stays open until a source gsc row exists',
  NULL,
  'migrations/rem-a7-reach-2.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE actor = 'rem-a7-f1:reach-closeouts-2');
