-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DELETE FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1'; DELETE FROM human_responses WHERE key = 'ha:uia-source-fidelity-100140' AND credential = 'owner-directive-session'; UPDATE human_actions SET status = 'open', resolved_at = NULL, resolution = NULL, updated_at = datetime('now') WHERE slug = 'uia-source-fidelity-100140' AND resolution LIKE 'owner directive 2026-10-26%'; UPDATE agent_issues SET description = substr(description, 1, instr(description, char(10) || char(10) || 'OWNER-AUTHORIZATION-RELEASED-1') - 1) WHERE id IN (100140, 100576) AND instr(description, char(10) || char(10) || 'OWNER-AUTHORIZATION-RELEASED-1') > 0; UPDATE remediation_contracts SET verify_probe = replace(verify_probe, ' AND NOT EXISTS (SELECT 1 FROM ops_config WHERE key = ''OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1'')', '') WHERE class = 'fm-owner-task-100576-acted-without-approve'; UPDATE remediation_contracts SET verify_probe = replace(verify_probe, ' WHEN EXISTS (SELECT 1 FROM ops_config WHERE key = ''OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1'') AND NOT EXISTS (SELECT 1 FROM human_actions WHERE slug = ''uia-source-fidelity-100140'' AND status = ''open'') THEN ''reask-100140-decided''', '') WHERE verify_probe LIKE '%reask-100140%'; UPDATE control_registry SET disposition = 'keep', reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now') WHERE control = 'owner-authorization-hold-100576'; DELETE FROM control_registry WHERE control = 'owner-paper-edit-exemption-uia-100140';
--
-- OWNER-AUTO-100140-1 (2026-10-26, agent_issues 100140 / 100576, owner card ha:uia-source-fidelity-100140 = human_actions 135, charter pillar: autonomy).
-- Owner directive, verbatim, 2026-10-26 (a Claude session, in reply to a screenshot of the card on fleet.qnfo.org/classic): "this issue should be handled automatically".
-- It answers the card that has waited since 2026-10-19: Approve could not be tapped for six days (the command line had no approve verb; DASH-OWNER-ACTIONS-1 added it), the
-- owner's three typed approvals (2026-10-20) never executed, and the card was closed with Done on 2026-10-24 for want of an Approve. The owner decides the matter by directive
-- instead of per-item taps, so:
--  * ops_config OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1 holds the directive and its limits (it lifts the 2026-10-19 rule that loops never rewrite owner-authored
--    papers for the seven items of agent_issues 100140 and for nothing else; the interrupt gate, the secret lock, the paper-withdrawal guard, the harness checks and the
--    verification bars keep their precedence);
--  * the OWNER-AUTHORIZATION-HOLD-1 hold on agent_issues 100576 is released (control_registry owner-authorization-hold-100576 disposition remove; its detector and the re-ask
--    contract of the DASH-OWNER-ACTIONS-1 re-ask issue now read the directive as the decision, so the release does not read as a violation);
--  * agent_issues 100576 (the task that carries the work) and 100140 get a paragraph that says what is authorized, who does it and the rules that keep each edit reversible
--    (a new version through the ledger, items 2/4/5 assert no contribution fact the papers do not already state, item 1 re-checked against the live text first);
--  * owner card 135 is resolved with the directive as its resolution, and a human_responses note records the directive on the card (credential owner-directive-session: it is
--    NOT an owner-session approve and nothing reads it as one);
--  * control_registry records the exemption (kind guard, keep, ends when agent_issues 100140 closes) and decision_log the decision.
-- No DELETE or DROP runs here (the DELETE statements belong to the Rollback line, which removes only rows this file inserts), so no BACKUP is taken. No paper is edited by this
-- file: the revision and errata path of qnfo-research-exec makes each edit as a new version, and PAPER-LEDGER-1 keeps every prior body.

INSERT OR IGNORE INTO ops_config (key, value, note, updated_at)
VALUES ('OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1',
  '{"id":"OWNER-AUTO-100140-1","date":"2026-10-26","directive_verbatim":"this issue should be handled automatically","about":"agent_issues 100140 (UIA-SOURCE-FIDELITY-1: seven fixes to the Ignorance Audit papers, owner card ha:uia-source-fidelity-100140)","effect":"the fleet executes all seven items without a per-item approval; for these items only it lifts the 2026-10-19 rule that loops never rewrite owner-authored papers","doer":"qnfo-research-exec revision and errata path (items 1-5, 7); code-task PR to QNFO/ignorance-audit (item 6)","rules":["each edit is a new version through the paper ledger (change_actor, change_reason), so every prior body is kept and each edit is reversible","item 1 is re-checked against the live text of qwave-qudit-advantage first; a discrepancy is recorded on the issue, not guessed","items 2, 4 and 5 assert no fact about who contributed what beyond the papers own Author contributions section; where sections conflict and the record cannot decide, the narrowest statement all of them support is used and named in change_reason","item 7 is errata on the papers.qnfo.org pages; the registered Sciforum abstract is not edited","verification bars are not lowered"],"limits":"the interrupt gate (money, credentials, legal or signing acts, the owners own accounts), the secret lock, PAPER-WITHDRAW-GUARD-1, live work claims and the harness permission checks keep their precedence; the exemption ends when agent_issues 100140 closes","closes_on":"issue-100140 closing probe (migrations/2026-10-19 contract) and the new versions as evidence"}',
  'OWNER-AUTO-100140-1: owner directive 2026-10-26, answers the card human_actions 135; carried by migrations/2026-10-26-owner-auto-100140.sql',
  datetime('now'));

-- The decision on the card, as a note (credential owner-directive-session; never an owner-session approve).
INSERT INTO human_responses (key, kind, note, credential, issue_id)
SELECT 'ha:uia-source-fidelity-100140', 'note',
  'Owner directive 2026-10-26: "this issue should be handled automatically". The fleet executes the seven items of agent_issues 100140 without a per-item approval (ops_config OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1). Not an owner-session approve; recorded so the card''s history shows who decided and how.',
  'owner-directive-session', 100140
WHERE EXISTS (SELECT 1 FROM human_actions WHERE slug = 'uia-source-fidelity-100140' AND status = 'open')
  AND NOT EXISTS (SELECT 1 FROM human_responses WHERE key = 'ha:uia-source-fidelity-100140' AND credential = 'owner-directive-session');

-- Owner card 135: resolved by the directive (guarded: only while open).
UPDATE human_actions SET status = 'resolved', resolved_at = datetime('now'), updated_at = datetime('now'),
  resolution = 'owner directive 2026-10-26: "this issue should be handled automatically". The fleet applies the seven fixes of agent_issues 100140 without a per-item approval; the work is carried by agent_issues 100576 and closes on the issue-100140 probe (ops_config OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1).'
WHERE slug = 'uia-source-fidelity-100140' AND status = 'open'
  AND EXISTS (SELECT 1 FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1');

-- agent_issues 100576: the hold is released and the task says what it authorizes (guarded on its own title and on the marker, so the paragraph is appended once).
UPDATE agent_issues SET description = COALESCE(description, '') || char(10) || char(10) || 'OWNER-AUTHORIZATION-RELEASED-1 (2026-10-26, migrations/2026-10-26-owner-auto-100140.sql): the OWNER-AUTHORIZATION-HOLD-1 note above is released. The owner said on 2026-10-26, about agent_issues 100140 (UIA-SOURCE-FIDELITY-1): "this issue should be handled automatically" (ops_config OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1). That is the owner''s own authorization to execute all seven items without a per-item approval, and it lifts, for these items only, the 2026-10-19 rule that loops never rewrite owner-authored papers. The interrupt gate, the secret lock, PAPER-WITHDRAW-GUARD-1 and the verification bars are unchanged. Doer: the revision and errata path of qnfo-research-exec (REVISION-LOOP-1, errata_actions) for items 1-5 and 7, a code-task PR to QNFO/ignorance-audit for item 6. Rules: (a) every change is a NEW VERSION through the paper ledger (change_actor, change_reason set in the same UPDATE), so the prior body is kept and each edit is reversible; (b) item 1: re-check against the live text of qwave-qudit-advantage first; if the quoted text cannot be reproduced, record the discrepancy on this issue and fix only what the live text shows; (c) items 2, 4 and 5 assert no fact about who contributed what beyond what the paper''s own Author contributions section already states; where its sections conflict and the record cannot decide, use the narrowest statement all of them support and name the choice in change_reason; (d) item 7: errata on the papers.qnfo.org pages, the registered Sciforum abstract is not edited; (e) close this issue with the new versions and the passing issue-100140 probe as evidence.',
  updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 100576 AND title LIKE 'OWNER-TASK-op-mvln7t9l2192:%' AND instr(COALESCE(description, ''), 'OWNER-AUTHORIZATION-RELEASED-1') = 0
  AND EXISTS (SELECT 1 FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1');

-- agent_issues 100140: points to the task that carries the work.
UPDATE agent_issues SET description = COALESCE(description, '') || char(10) || char(10) || 'OWNER-AUTHORIZATION-RELEASED-1 (2026-10-26, migrations/2026-10-26-owner-auto-100140.sql): owner directive "this issue should be handled automatically". All seven items are authorized; the fleet executes them (task agent_issues 100576 carries the rules: new versions through the paper ledger, item 1 re-checked against the live text, items 2/4/5 assert no contribution fact the papers do not already state, item 7 as errata, the registered abstract untouched). The owner card (human_actions 135) is resolved by the directive. This issue closes on its own probe.',
  updated_at = CAST(strftime('%s', 'now') AS INTEGER) * 1000
WHERE id = 100140 AND title LIKE 'UIA-SOURCE-FIDELITY-1:%' AND instr(COALESCE(description, ''), 'OWNER-AUTHORIZATION-RELEASED-1') = 0
  AND EXISTS (SELECT 1 FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1');

-- The detector of a decision-less execution reads the directive as the decision (each NOT EXISTS of the approve gains the directive; guarded, applied once).
UPDATE remediation_contracts SET
  verify_probe = replace(verify_probe, 'AND NOT EXISTS (SELECT 1 FROM human_responses WHERE key = ''ha:uia-source-fidelity-100140'' AND kind = ''approve'' AND credential = ''owner-session'')', 'AND NOT EXISTS (SELECT 1 FROM human_responses WHERE key = ''ha:uia-source-fidelity-100140'' AND kind = ''approve'' AND credential = ''owner-session'') AND NOT EXISTS (SELECT 1 FROM ops_config WHERE key = ''OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1'')'),
  attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'fm-owner-task-100576-acted-without-approve' AND instr(verify_probe, 'UIA_SOURCE_FIDELITY_AUTO_1') = 0;

-- The re-ask contract of the DASH-OWNER-ACTIONS-1 re-ask issue passes on the directive once the card is closed (guarded on the old text; the Rollback line removes the branch).
UPDATE remediation_contracts SET
  verify_probe = replace(verify_probe, ' ELSE ''reask-100140-no-decision-reached-the-fleet''', ' WHEN EXISTS (SELECT 1 FROM ops_config WHERE key = ''OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1'') AND NOT EXISTS (SELECT 1 FROM human_actions WHERE slug = ''uia-source-fidelity-100140'' AND status = ''open'') THEN ''reask-100140-decided'' ELSE ''reask-100140-no-decision-reached-the-fleet'''),
  attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-' || (SELECT id FROM agent_issues WHERE title = 'DASH-OWNER-ACTIONS-1: re-ask the owner for the seven decisions of agent_issues 100140 (owner card ha:uia-source-fidelity-100140 was closed with Done because Approve did not exist)' ORDER BY id DESC LIMIT 1)
  AND instr(verify_probe, 'UIA_SOURCE_FIDELITY_AUTO_1') = 0 AND instr(verify_probe, 'reask-100140-no-decision-reached-the-fleet') > 0;

-- control_registry (DOCTRINE-1): the hold is released; the exemption is recorded with its reason, scope, expiry and revert.
UPDATE control_registry SET disposition = 'remove', disposition_state = 'applied',
  evidence = evidence || ' RELEASED 2026-10-26 by owner directive "this issue should be handled automatically" (ops_config OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1, migrations/2026-10-26-owner-auto-100140.sql). The directive is the decision the release condition waited for; agent_issues 100576 carries the work.',
  reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE control = 'owner-authorization-hold-100576' AND disposition = 'keep'
  AND EXISTS (SELECT 1 FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1');

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES ('owner-paper-edit-exemption-uia-100140',
  'owner directive 2026-10-19 (loops never rewrite owner-authored papers) as applied to the seven items of agent_issues 100140: the exemption is ops_config OWNER_DIRECTIVE_2026_10_26_UIA_SOURCE_FIDELITY_AUTO_1, read by the revision and errata path of qnfo-research-exec through the task agent_issues 100576',
  'guard',
  'the fleet rewriting the wording of papers the owner authored without the owner''s say-so; here the owner has said so, for these seven items only',
  0,
  'keep',
  'applied',
  'Each edit is a new version through the paper ledger (PAPER-LEDGER-1): v_paper_revisions holds the prior body, so a revision is reverted by publishing the prior version; PAPER-WITHDRAW-GUARD-1 still refuses a mass withdrawal',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'recorded reason: the owner decided by directive on 2026-10-26 ("this issue should be handled automatically") after the card waited seven days; the owner''s typed approvals of 2026-10-20 never executed because the dashboard had no approve verb. Scope: items 1-7 of agent_issues 100140 and nothing else. Expiry: the exemption ends when agent_issues 100140 closes (its own probe, issue-100140). Revert: the Rollback line of migrations/2026-10-26-owner-auto-100140.sql removes the directive, restores the hold and reopens the card; a published edit is reverted by republishing the prior version',
  100140);

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_014xChUSsqufDhZ9HxSQEsPd:owner-auto-100140-1',
  'an owner who says an issue should be handled automatically has decided it; a decision taken in a session is recorded as a directive with its limits and never as an owner-session approve; the fleet, not the owner, is the actor of every step after it',
  'OWNER-AUTO-100140-1: the owner directive "this issue should be handled automatically" is stored (ops_config), owner card 135 is resolved by it, the hold on agent_issues 100576 is released, 100576 and 100140 carry what is authorized and the rules that keep each paper edit reversible, the detector and the re-ask contract read the directive as the decision',
  'owner screenshot of ha:uia-source-fidelity-100140 on fleet.qnfo.org/classic 2026-10-26 (a card with Details only, no decision button); human_actions 135 open since 2026-10-19; human_responses 49-51 (notes and a Done, no approve); agent_issues 100576 open, high, held by owner-authorization-hold-100576; agent_issues 100140 open with a failing issue-100140 probe (item 1 and item 3 defects still in ai4metascience-ignorance-audit)',
  'pending post-deploy measurement',
  'owner card 135, the descriptions of agent_issues 100140 and 100576, two remediation probes, two control_registry rows; no paper is edited by this file',
  'the Rollback line of migrations/2026-10-26-owner-auto-100140.sql removes the directive and the exemption, restores the hold and the probes and reopens the card; decision_log stays append-only',
  'a decision the owner makes in plain words reaches the fleet as a stored directive with limits instead of waiting for a button the dashboard did not have',
  'the issue-100140 probe reads 0 once the revision and errata path publishes the new versions; the card does not reappear; fm-owner-task-100576-acted-without-approve reads 0',
  'the owner''s card stops waiting and the fleet owns the work end to end',
  'live D1 SELECTs of agent_issues 100140 and 100576, human_actions 135, human_responses for the card, remediation_contracts (the detector and the re-ask contract), control_registry and ops_config; migrations/owner-auto-100140.test.mjs replays the file on SQLite with the live probe texts'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'OWNER-AUTO-100140-1: %');
