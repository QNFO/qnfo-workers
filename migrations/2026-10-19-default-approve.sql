-- DEFAULT-APPROVE-1 (2026-10-19, charter pillar autonomy; doctrine kernel IC-YES-001, AUTONOMY-FIRST-1).
-- Owner directive 2026-10-19, verbatim: "The code loop SHALL ALWAYS BE ABLE TO change qnfo-fleet-control, qnfo-ops, qnfo-deploy-guard and
-- the loop's own code. Lifting it for qnfo-fleet-control in a decision card, which the fleet closed at birth on its default (deny SHALL
-- ALWAYS BE DEFAULT APPROVE). ALL DECISIONS SHALL ALWAYS BE DEFAULT APPROVE...ALWAYS!. Reversible fleet decisions SHALL ALWAYS take the
-- recommended option and proceed without waiting".
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_default_approve_triggers
-- Rollback: UPDATE ops_config SET value = 'off', updated_at = datetime('now') WHERE key = 'default_approve_gate'; DELETE FROM control_registry WHERE control = 'default-adopt-status-quo'; DELETE FROM remediation_contracts WHERE class = 'fm-card-default-denies-decision'; DELETE FROM failure_modes WHERE fm_key = 'card-default-denies-decision'; DELETE FROM remediation_contracts WHERE class = 'fm-default-approve-issue-unexecuted'; DELETE FROM failure_modes WHERE fm_key = 'default-approve-issue-unexecuted';
-- Rollback scope: the first statement is the whole behavioural rollback. Both rebuilt triggers and the new one test ops_config
-- default_approve_gate, so with it 'off' a decision card is closed on its stated default (DEFAULT-ADOPTED-1) or rerouted (AUTONOMY-FIRST-1)
-- exactly as before this file. The view and the new trigger stay in place on purpose (the rebuilt triggers read the view; dropping it
-- would make every human_actions insert fail). The remaining statements remove the registry rows. To restore the two original trigger
-- texts byte for byte, DROP TRIGGER human_actions_default_adopt_ai and human_actions_autonomy_first_ai, DROP TRIGGER
-- human_actions_default_approve_ai, DROP VIEW v_human_action_decision, and run the sql column of bak_20261019_default_approve_triggers.
-- spof-review: none added. The new trigger writes autonomy_reroute_queue and decision_log (the tables the existing triggers write) and never
-- agent_issues, so the AGENT-ISSUES-TRIGGER-DEPTH-1 chain and the QUEUE-BREAK-CYCLE-1 cycle break are unchanged.
--
-- WHAT WENT WRONG (agent_issues: this file's decision_log row; human_actions 115, filed 2026-10-19 10:07Z by a chat session)
-- Card 115 asked "Let the code loop change qnfo-fleet-control ...?" with the recommended option "Approve: add qnfo-fleet-control to
-- CM_LOOP_CANARIED ..." and the stated default "The deny stays." The trigger human_actions_default_adopt_ai (DEFAULT-ADOPTED-1, owner
-- directive 2026-10-12) closes a card at birth on its stated default, so the card was resolved on the deny within the same statement that
-- filed it and the recommended option was never taken. The writers of cards state the status quo as the default because the card names a
-- risk; the trigger treated that as the owner's choice. The owner's rule is the opposite: a reversible decision takes the recommended
-- option and proceeds, and the default of every decision is approve.
--
-- WHAT THIS FILE DOES
-- 1. default_approve_markers (a table, so the fleet can add a marker by INSERT without a migration) and v_human_action_decision grade each
--    card: decision = 1 when the action text matches a 'decision_action' pattern (an "Approve:" or "Decline:" option, "Pick one", "Choose one",
--    "option (a)", "which of", ...) or the title a 'decision_title' pattern ("decide ...", "should ...", a title that asks) and no
--    'decision_title_not' pattern (why/is/did/what/how questions); hard = 1 when the card text matches a 'hard' pattern, i.e. it is, by its
--    own words, an act the interrupt gate keeps (IC-GATE-001: money, a legal or signing act, destroying data, the owner's accounts, credentials,
--    mailbox and name) or a security or privacy limit (doctrine section 9: one-time codes, privacy, personal data, suppression and opt-out
--    handling, consent); ib = 1 when the card carries an IDENTITY-BOUND: line; gate is v_human_action_gate (the fleet's own owner-only grade).
--    approve = 1 when ops_config default_approve_gate is not 'off', the card is a decision, is not hard, carries no IDENTITY-BOUND: line, the
--    gate reads 'fleet' and the source is not a closure notice (owner-request-issue). held = 1 for a decision that is not hard but carries an
--    IDENTITY-BOUND: line. A hard card, and a card that offers no options (an owner step with a safe default), keep their old path.
--    A held card is not closed on its stated default and not sent to the fleet: it stays open for the owner, because a writer who labels a card
--    IDENTITY-BOUND says it truly needs the owner (CLAUDE.md, AUTONOMY-FIRST-1) and the fleet does not execute an act so labelled on its own
--    authority. Card 115 was that shape; the owner has now approved it (statement below), and a card of that shape no longer closes on a deny.
-- 2. human_actions_default_approve_ai (new): a decision card with approve = 1 is not closed on a status-quo default. It is queued for the
--    fleet in autonomy_reroute_queue (drained into agent_issues by the existing autonomy-reroute-drain task) with the instruction to execute
--    the recommended option (the Approve option, else option (a), else the first), and the card is set rerouted with the approve default in
--    effect. One decision_log row records it.
-- 3. human_actions_default_adopt_ai is recreated with one added condition, "not an approve card and not a held card"; human_actions_autonomy_first_ai
--    with "not an approve card", so a decision card is handled once. Every other text is the live text.
-- 4. Card 115 gets the owner's decision (approved, wider than the card asked: also qnfo-ops, qnfo-deploy-guard and qnfo-code-orchestrator);
--    the worker change that executes it is CODE-LOOP-CONTROL-PLANE-1 (separate pull request, claims on both worker.js files).
-- 5. control_registry: the control-plane deny's disposition is amended and the status-quo default is recorded as a replaced control.
--    failure_modes + the fm-card-default-denies-decision detector: a decision card closed on a default while the gate is on reads above 0.
-- The two IDENTITY-BOUND limits stay: a card for money, a legal or signing act, an owner-only credential or account, or a security or privacy
-- limit is not approved by the fleet (reading (n) and (s) of the kernel); harness permission checks, the secret lock and live claims also win.

INSERT OR IGNORE INTO ops_config (key, value, note, updated_at) VALUES
 ('default_approve_gate', 'on', 'DEFAULT-APPROVE-1 (owner directive 2026-10-19): off restores DEFAULT-ADOPTED-1 / AUTONOMY-FIRST-1 for decision cards (a decision card is closed on its stated default or rerouted). on: a reversible decision card is queued for the fleet to execute its recommended option and is never closed on a status-quo default.', datetime('now'));

CREATE TABLE IF NOT EXISTS bak_20261019_default_approve_triggers AS
  SELECT name, type, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at
    FROM sqlite_master
   WHERE type = 'trigger' AND name IN ('human_actions_default_adopt_ai', 'human_actions_autonomy_first_ai');

-- grading markers: LIKE patterns (case-insensitive) matched against ' ' || lower(title || why || action || default_in_effect) || ' ' for 'hard',
-- against the lower-cased action for 'decision_action', and against the lower-cased trimmed title for 'decision_title' / 'decision_title_not'.
-- A marker is added by INSERT (a hold needs a recorded reason: note); INSERT OR IGNORE keeps an operator's own rows on a re-run.
CREATE TABLE IF NOT EXISTS default_approve_markers (kind TEXT NOT NULL CHECK (kind IN ('hard', 'decision_action', 'decision_title', 'decision_title_not')), pattern TEXT NOT NULL, note TEXT, added_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), PRIMARY KEY (kind, pattern));

INSERT OR IGNORE INTO default_approve_markers (kind, pattern, note) VALUES
 ('decision_action', '%approve:%', 'an Approve option'), ('decision_action', '%decline:%', 'a Decline option'), ('decision_action', '%pick one%', 'a list of options'),
 ('decision_action', '%choose one%', 'a list of options'), ('decision_action', '%choose between%', 'a list of options'), ('decision_action', '%which of%', 'a list of options'),
 ('decision_action', '%option (a)%', 'a lettered list'), ('decision_action', '%option a%', 'a lettered list'), ('decision_action', '%(a)%(b)%', 'a lettered list'),
 ('decision_title', 'decide %', 'a title that decides'), ('decision_title', 'decide:%', 'a title that decides'), ('decision_title', 'should %', 'a title that asks'),
 ('decision_title', 'which of%', 'a title that asks'), ('decision_title', 'pick %', 'a title that picks'), ('decision_title', 'choose %', 'a title that chooses'),
 ('decision_title', '%?', 'a title that asks'),
 ('decision_title_not', 'why %', 'a question about the past, not a choice'), ('decision_title_not', 'is %', 'a question about a fact'), ('decision_title_not', 'did %', 'a question about the past'),
 ('decision_title_not', 'what %', 'a question about a fact'), ('decision_title_not', 'how %', 'a question about a fact'), ('decision_title_not', 'are %', 'a question about a fact'),
 ('decision_title_not', 'does %', 'a question about a fact'),
 ('hard', '% payment %', 'money (IC-GATE-001)'), ('hard', '% payments %', 'money'), ('hard', '%payment decision%', 'money'), ('hard', '%invoice%', 'money'),
 ('hard', '%bank %', 'money'), ('hard', '%credit card%', 'money'), ('hard', '%billing account%', 'money'), ('hard', '%billing plan%', 'money'),
 ('hard', '%billing project%', 'money'), ('hard', '%purchase%', 'money'), ('hard', '%wire transfer%', 'money'), ('hard', '%top up%', 'money'),
 ('hard', '%top-up%', 'money'), ('hard', '% fund %', 'money'), ('hard', '%prepaid%', 'money'), ('hard', '%subscri%', 'money (a subscription)'),
 ('hard', '% pay %', 'money'), ('hard', '% paid %', 'money'), ('hard', '% fee %', 'money'), ('hard', '% fees %', 'money'), ('hard', '%renew%', 'money (a renewal)'),
 ('hard', '%registrar%', 'money (a domain)'), ('hard', '%refund%', 'money'), ('hard', '%wallet%', 'money'), ('hard', '%$_%', 'money (an amount)'),
 ('hard', '% legal %', 'a legal act'), ('hard', '% signature %', 'a signing act'), ('hard', '%signing%', 'a signing act'), ('hard', '% sign the %', 'a signing act'),
 ('hard', '%patent applic%', 'a legal act'), ('hard', '% dpa %', 'a legal act (a data processing agreement)'), ('hard', '% dpa,%', 'a legal act'),
 ('hard', '%irreversible%', 'irreversible by the card''s own words'), ('hard', '%delete%', 'destroying data'), ('hard', '%wipe%', 'destroying data'),
 ('hard', '%erase%', 'destroying data'), ('hard', '%truncate%', 'destroying data'), ('hard', '%drop table%', 'destroying data'), ('hard', '%destroy%', 'destroying data'),
 ('hard', '%unbacked%', 'destroying data'),
 ('hard', '%api key%', 'a credential'), ('hard', '%oauth%', 'the owner''s accounts'), ('hard', '%sign in to%', 'the owner''s accounts'), ('hard', '%sign-in%', 'the owner''s accounts'),
 ('hard', '%log in to%', 'the owner''s accounts'), ('hard', '%login link%', 'the owner''s accounts'), ('hard', '%login code%', 'the owner''s accounts'),
 ('hard', '%password%', 'a credential'), ('hard', '%credential%', 'a credential'), ('hard', '%rotate%', 'a credential'), ('hard', '%secret%', 'a credential'),
 ('hard', '%token%', 'a credential'), ('hard', '%grant access%', 'the owner''s accounts'), ('hard', '%your name%', 'acting in the owner''s name'),
 ('hard', '%owner''s name%', 'acting in the owner''s name'), ('hard', '%mailbox%', 'the owner''s mailbox'), ('hard', '%email from%', 'mail in the owner''s name'),
 ('hard', '%send an email%', 'mail in the owner''s name'), ('hard', '%send email%', 'mail in the owner''s name'), ('hard', '%@_%._%', 'an e-mail address: a third party'),
 ('hard', '%visibility%', 'public exposure of the owner''s repositories'), ('hard', '%make public%', 'public exposure'), ('hard', '%be public%', 'public exposure'),
 ('hard', '%one-time code%', 'a security limit (doctrine section 9)'), ('hard', '%verification code%', 'a security limit'), ('hard', '%privacy of %', 'a privacy limit'),
 ('hard', '%gdpr%', 'a privacy limit'), ('hard', '%personal data%', 'a privacy limit'), ('hard', '%suppress%', 'suppression handling (outreach consent)'),
 ('hard', '%opt-out%', 'opt-out handling'), ('hard', '%opt out%', 'opt-out handling'), ('hard', '%unsubscribe%', 'opt-out handling'), ('hard', '%consent%', 'outreach consent');

CREATE VIEW IF NOT EXISTS v_human_action_decision AS
SELECT id, slug, status, source, decision, hard, ib, gate,
  CASE WHEN COALESCE((SELECT value FROM ops_config WHERE key = 'default_approve_gate'), 'on') <> 'off'
        AND decision = 1 AND hard = 0 AND ib = 0 AND gate = 'fleet' AND COALESCE(source, '') <> 'owner-request-issue' THEN 1 ELSE 0 END AS approve,
  CASE WHEN COALESCE((SELECT value FROM ops_config WHERE key = 'default_approve_gate'), 'on') <> 'off'
        AND decision = 1 AND hard = 0 AND ib = 1 AND COALESCE(source, '') <> 'owner-request-issue' THEN 1 ELSE 0 END AS held
FROM (
  SELECT id, slug, status, source,
    CASE WHEN (EXISTS (SELECT 1 FROM default_approve_markers m WHERE m.kind = 'decision_action' AND a LIKE m.pattern)
               OR EXISTS (SELECT 1 FROM default_approve_markers m WHERE m.kind = 'decision_title' AND ti LIKE m.pattern))
          AND NOT EXISTS (SELECT 1 FROM default_approve_markers m WHERE m.kind = 'decision_title_not' AND ti LIKE m.pattern) THEN 1 ELSE 0 END AS decision,
    CASE WHEN EXISTS (SELECT 1 FROM default_approve_markers m WHERE m.kind = 'hard' AND t LIKE m.pattern) THEN 1 ELSE 0 END AS hard,
    CASE WHEN t LIKE '%identity-bound:%' THEN 1 ELSE 0 END AS ib,
    COALESCE((SELECT g.gate FROM v_human_action_gate g WHERE g.id = x.id), 'owner') AS gate
  FROM (SELECT id, slug, status, source, lower(trim(COALESCE(title, ''))) AS ti, lower(COALESCE(action, '')) AS a,
               ' ' || lower(COALESCE(title, '') || ' ' || COALESCE(why, '') || ' ' || COALESCE(action, '') || ' ' || COALESCE(default_in_effect, '')) || ' ' AS t
          FROM human_actions) x
);

-- the stated-default trigger (DEFAULT-ADOPTED-1) as live, plus: a decision card that is approved is not closed on its default
DROP TRIGGER IF EXISTS human_actions_default_adopt_ai;
CREATE TRIGGER human_actions_default_adopt_ai AFTER INSERT ON human_actions
WHEN NEW.status='open' AND TRIM(COALESCE(NEW.default_in_effect,''))<>''
  AND COALESCE((SELECT value FROM ops_config WHERE key='default_adopt_gate'),'on')<>'off'
  AND COALESCE((SELECT approve + held FROM v_human_action_decision WHERE id = NEW.id), 0) = 0
BEGIN
  UPDATE human_actions SET status='resolved', resolved_at=datetime('now'), updated_at=datetime('now'),
    resolution='DEFAULT-ADOPTED-1: closed at birth on its stated default (owner directive 2026-10-12). Reopen with status=open.'
  WHERE id=NEW.id;
  INSERT INTO decision_log(actor,assumption,action,evidence,outcome,blast_radius,rollback_path,predicted_outcome,reach_gain,surfaces_tested,capability_gain)
  VALUES ('trigger:human_actions_default_adopt_ai','owner wants the waiting-on-you queue resolved autonomously','adopted stated default for card '||COALESCE(NEW.slug,'#'||NEW.id),COALESCE(NEW.default_in_effect,''),'card closed, default in force','none beyond the default the card already named','UPDATE human_actions SET status=''open'' WHERE id='||NEW.id,
    'the card stays resolved on its stated default; if the step still matters its OWNER-STEPS-WATCH-1 probe or a refiled card brings it back within a day, otherwise nothing changes (DEFAULT-ADOPT-PREDICTION-1)',
    '0', 'human_actions.default_in_effect (the card''s own text), ops_config default_adopt_gate', 'none (removes a wait on the owner)');
END;

-- the autonomy reroute (AUTONOMY-FIRST-1, QUEUE-BREAK-CYCLE-1) as live, plus: a decision card that is approved is queued by the trigger below
DROP TRIGGER IF EXISTS human_actions_autonomy_first_ai;
CREATE TRIGGER human_actions_autonomy_first_ai AFTER INSERT ON human_actions
WHEN NEW.status = 'open'
  AND COALESCE((SELECT value FROM ops_config WHERE key = 'autonomy_first_gate'), 'on') <> 'off'
  AND (SELECT gate FROM v_human_action_gate WHERE id = NEW.id) = 'fleet'
  AND COALESCE(NEW.source, '') <> 'owner-request-issue'
  AND COALESCE((SELECT approve FROM v_human_action_decision WHERE id = NEW.id), 0) = 0
BEGIN
  INSERT INTO autonomy_reroute_queue (human_action_id, title, description, category, priority)
  VALUES (NEW.id,
    'AUTONOMY-FIRST-REROUTE-1: ' || NEW.title,
    'AUTONOMY-FIRST-1 (migrations/2026-10-08-autonomy-first.sql): owner card #' || NEW.id || ' (' || COALESCE(NEW.slug, '') || ', from '
      || COALESCE(NEW.source, '?') || ') asked the owner for a decision that is not irreversible and identity-bound, so it is the fleet''s. '
      || 'Decide and execute: pick the best lever in the card''s action text (or a better one), apply it through the canonical path '
      || '(PR, migration, ops_config row), and close this issue with close_evidence naming the lever and a live measurement. '
      || 'Never re-open the card for the owner. Why: ' || COALESCE(NEW.why, '') || ' Default in effect: ' || COALESCE(NEW.default_in_effect, '')
      || ' Card action: ' || COALESCE(NEW.action, '') || ' Charter pillar: autonomy.',
    'governance', CASE NEW.sev WHEN 'urgent' THEN 'critical' WHEN 'high' THEN 'high' ELSE 'medium' END);
  UPDATE human_actions SET status = 'rerouted', resolved_at = datetime('now'), updated_at = datetime('now'),
    resolution = 'AUTONOMY-FIRST-1: queued for the fleet as an agent_issue (QUEUE-BREAK-CYCLE-1; drained by fleet_cron autonomy-reroute-drain)'
  WHERE id = NEW.id;
END;

-- DEFAULT-APPROVE-1: a reversible decision card takes the recommended option; the fleet executes it
DROP TRIGGER IF EXISTS human_actions_default_approve_ai;
CREATE TRIGGER human_actions_default_approve_ai AFTER INSERT ON human_actions
WHEN NEW.status = 'open'
  AND COALESCE((SELECT approve FROM v_human_action_decision WHERE id = NEW.id), 0) = 1
BEGIN
  INSERT INTO autonomy_reroute_queue (human_action_id, title, description, category, priority)
  VALUES (NEW.id,
    'DEFAULT-APPROVE-1: ' || NEW.title,
    'DEFAULT-APPROVE-1 (migrations/2026-10-19-default-approve.sql; owner directive 2026-10-19: all decisions default approve, and a reversible fleet decision takes the recommended option and proceeds without waiting). '
      || 'Owner card #' || NEW.id || ' (' || COALESCE(NEW.slug, '') || ', from ' || COALESCE(NEW.source, '?') || ') is a decision the fleet takes. '
      || 'Doer: the loop or session that claims this issue (work-lock issue:<id>); a card whose action carries a code-task: line is built by the code loop. Execute the recommended option: the card''s Approve option, else its option (a), else the first option it lists; a card that lists no option is executed as the course its why recommends, else the lowest-risk reversible action, with the assumption stated in one line, through the canonical path (PR, migration, ops_config row). '
      || 'The default the card stated is superseded by the approve default and is not a reason to wait or to decline. Close this issue with close_evidence naming the change and a live measurement; never re-open the card for the owner. '
      || 'Still in force: the interrupt gate (IC-GATE-001), the harness permission checks, the shared-secrets lock and another session''s live claim; a step one of those refuses is stated with its reason and filed with a closing probe. '
      || 'Why: ' || COALESCE(NEW.why, '') || ' Default the card stated (superseded): ' || COALESCE(NEW.default_in_effect, '(none)')
      || ' Card action: ' || COALESCE(NEW.action, '') || ' Charter pillar: autonomy.',
    'governance', CASE NEW.sev WHEN 'urgent' THEN 'critical' WHEN 'high' THEN 'high' ELSE 'medium' END);
  UPDATE human_actions SET status = 'rerouted', resolved_at = datetime('now'), updated_at = datetime('now'),
    default_in_effect = 'APPROVE (DEFAULT-APPROVE-1, owner directive 2026-10-19): the recommended option is in force and the fleet executes it without waiting. The default this card stated was: ' || COALESCE(NEW.default_in_effect, '(none)'),
    resolution = 'DEFAULT-APPROVE-1: queued for the fleet to execute the recommended option (autonomy_reroute_queue, drained by fleet_cron autonomy-reroute-drain); the stated default was not adopted. ops_config default_approve_gate = off restores DEFAULT-ADOPTED-1.'
  WHERE id = NEW.id;
  INSERT INTO decision_log(actor,assumption,action,evidence,outcome,blast_radius,rollback_path,predicted_outcome,reach_gain,surfaces_tested,capability_gain)
  VALUES ('trigger:human_actions_default_approve_ai','owner directive 2026-10-19: every reversible decision defaults to approve and takes the recommended option without waiting','queued the recommended option of card '||COALESCE(NEW.slug,'#'||NEW.id)||' for the fleet instead of closing it on its stated default',COALESCE(NEW.default_in_effect,'(no default stated)'),'card rerouted, approve default in force','the recommended option of one reversible decision, executed by the fleet through the canonical path','ops_config default_approve_gate = off; UPDATE human_actions SET status=''open'' WHERE id='||NEW.id,
    'the autonomy-reroute-drain task files an agent_issues row for this card within 10 minutes and the fleet executes the recommended option; if the issue is still open after 120 minutes the stuck views name it (DEFAULT-APPROVE-1)',
    '0', 'human_actions card text, v_human_action_decision, ops_config default_approve_gate', 'decisions take the recommended option without a wait on the owner');
END;

-- the owner's decision on card 115 (approved, and wider than the card: the owner named qnfo-ops, qnfo-deploy-guard and the loop's own code too)
UPDATE human_actions SET
  default_in_effect = 'APPROVE (owner decision 2026-10-19): the code loop may plan and merge changes to qnfo-fleet-control, qnfo-ops, qnfo-deploy-guard and qnfo-code-orchestrator (the loop''s own code), with the functional canary and the Actions revert behind every merge. In force when CODE-LOOP-CONTROL-PLANE-1 (agent_issues 100134) merges; until then the deny lists in the two workers still apply.',
  resolution = 'OWNER DECISION 2026-10-19 (verbatim: "The code loop SHALL ALWAYS BE ABLE TO change qnfo-fleet-control, qnfo-ops, qnfo-deploy-guard and the loop''s own code ... ALL DECISIONS SHALL ALWAYS BE DEFAULT APPROVE"): approved, wider than this card asked. DEFAULT-ADOPTED-1 had closed the card at birth on its deny default; that closure is superseded. Executed by CODE-LOOP-CONTROL-PLANE-1 (CM_LOOP_CANARIED in qnfo-fleet-control and PLAN_LOOP_CANARIED in qnfo-code-orchestrator, held equal by fold-guard.test.mjs).',
  updated_at = datetime('now')
WHERE id = 115 AND slug = 'code-loop-may-change-fleet-control' AND resolution LIKE 'DEFAULT-ADOPTED-1%';

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id) VALUES
 ('default-adopt-status-quo', 'qnfo-audit D1 trigger human_actions_default_adopt_ai (DEFAULT-ADOPTED-1) closing a decision card on the status-quo default it stated', 'gate',
  'a decision card waiting on the owner; the trigger removed that wait by adopting the default, but the default is usually the status quo, so the recommended option was never taken (human_actions 115, 2026-10-19)',
  0, 'replace', 'applied',
  'human_actions_default_approve_ai: a reversible decision card is queued for the fleet to execute its recommended option; DEFAULT-ADOPTED-1 stays for cards that offer no options and for hard cards (money, legal or signing act, destroying data, the owner''s accounts and credentials, security and privacy limits)',
  strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
  'owner directive 2026-10-19: all decisions default approve; reversible fleet decisions take the recommended option and proceed without waiting. migrations/default-approve.test.mjs proves the card-115 shape is rerouted, a hard card keeps its default, and ops_config default_approve_gate = off restores the old behaviour.',
  NULL);

UPDATE control_registry SET
  evidence = evidence || ' | OWNER DIRECTIVE 2026-10-19: "The code loop SHALL ALWAYS BE ABLE TO change qnfo-fleet-control, qnfo-ops, qnfo-deploy-guard and the loop''s own code." The deny is lifted for those four workers by that decision and takes effect when CODE-LOOP-CONTROL-PLANE-1 (agent_issues 100134) moves them into CM_LOOP_CANARIED / PLAN_LOOP_CANARIED; until it merges the lists in qnfo-fleet-control and qnfo-code-orchestrator still deny them. qnfo-code-agent is retired (RETIRED file) and stays listed. It stays for qnfo-observability (the scorer host), qnfo-autonomy-scorer and qnfo-containers-pilot.',
  reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE control = 'control-plane-deny' AND evidence NOT LIKE '%OWNER DIRECTIVE 2026-10-19%';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('card-default-denies-decision',
  'a reversible decision card is closed at birth on the status-quo default its writer stated, so its recommended option is never taken and the owner has to say approve again',
  'DEFAULT-ADOPTED-1 (human_actions_default_adopt_ai) closes any card that carries a default_in_effect, and writers of decision cards state the status quo ("The deny stays") as the default because the card names a risk (human_actions 115, 2026-10-19)',
  'DEFAULT-APPROVE-1 (migrations/2026-10-19-default-approve.sql): v_human_action_decision grades decision cards; the new trigger queues a reversible decision card for the fleet to execute its recommended option; offline suite migrations/default-approve.test.mjs',
  'no human_actions row with a DEFAULT-ADOPTED-1 resolution is a decision card the fleet approves or holds (v_human_action_decision approve or held), while ops_config default_approve_gate is on',
  'fm-card-default-denies-decision', '2026-10-19', NULL,
  'a chat session or a loop files a decision card with a status-quo default, or someone recreates human_actions_default_adopt_ai without the approve condition',
  'the card is resolved at birth with DEFAULT-ADOPTED-1 and the recommended option sits unexecuted until the owner notices (card 115: the code loop stayed barred from fleet-control)',
  'every decision the fleet leaves to the owner');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-card-default-denies-decision', NULL, 'DEFAULT-APPROVE-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM human_actions h JOIN v_human_action_decision d ON d.id = h.id WHERE h.resolution LIKE ''DEFAULT-ADOPTED-1%'' AND (d.approve = 1 OR d.held = 1)) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('default-approve-issue-unexecuted',
  'an approved decision is queued as an agent_issues row (DEFAULT-APPROVE-1) that nothing executes, so the recommended option waits for a session sweep exactly as a deny default would',
  'the reroute path files free-form governance issues from source autonomy-first-gate; the code-loop planner refuses that category and source (PLAN_DENY_CATEGORY, PLAN_TRUSTED) and builds a task only from a code-task: line, so a card without one has no automated doer (all 18 earlier rows on this route were closed by a session sweep or a metric probe)',
  'DEFAULT-APPROVE-1 says so in the issue text (doer: the loop or session that claims it; a code-task: line is built by the code loop); this detector reads any DEFAULT-APPROVE-1 issue open past 120 minutes (SLA-120M-2) so the stuck views and the issue ratchets name it',
  'no DEFAULT-APPROVE-1 issue has been open for more than 120 minutes',
  'fm-default-approve-issue-unexecuted', '2026-10-19', NULL,
  'a decision card is approved and its issue has no code-task: line',
  'the issue ages past 120 minutes with no doer; the approved option is not executed',
  'every approved decision card');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-default-approve-issue-unexecuted', NULL, 'DEFAULT-APPROVE-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM agent_issues WHERE status = ''open'' AND title LIKE ''DEFAULT-APPROVE-1: %'' AND created_at < (CAST(strftime(''%s'', ''now'') AS INTEGER) - 7200) * 1000) AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'the owner means what they wrote: every reversible decision defaults to approve and takes the recommended option; the interrupt gate (money, legal or signing act, destroying data, the owner''s accounts and credentials) and the security and privacy limits are not decisions the fleet approves, so a card that is hard by its own words keeps its old path',
  'DEFAULT-APPROVE-1: human_actions_default_approve_ai queues a reversible decision card for the fleet to execute its recommended option; human_actions_default_adopt_ai and human_actions_autonomy_first_ai skip such a card; card 115 records the owner''s approval (wider than the card: qnfo-ops, qnfo-deploy-guard, qnfo-code-orchestrator too); control_registry and failure_modes updated',
  'd1 qnfo-audit 2026-10-19: card 115 resolved at 10:07:37 by DEFAULT-ADOPTED-1 on the default "The deny stays."; of the 109 cards graded by the new view, the 8 resolved decision cards that are not hard (ids 15, 16, 19, 20, 21, 38, 39, 48) were filed 2026-10-01 to 2026-10-06, before DEFAULT-ADOPTED-1 existed, and were resolved by the owner or a recorded delegation, so card 115 is the only decision card with a non-hard text that DEFAULT-ADOPTED-1 closed on a default (75, 100 and 109 are decision cards whose text is hard and rightly kept their default); the owner message of 2026-10-19 states the rule',
  'migration merged', 'three triggers on human_actions (two recreated with one added condition, one new), one view, one ops_config key, registry rows; no card other than 115 is changed; no worker, threshold or cap',
  'ops_config default_approve_gate = off restores the previous behaviour of every card path at once; the Rollback header lists the registry deletes; bak_20261019_default_approve_triggers holds the two original trigger texts',
  'a decision card is never closed on a status-quo default: the fleet executes the recommended option and the owner is not asked twice',
  'every new reversible decision card is rerouted to the fleet within one insert and its agent_issues row exists within 10 minutes; fm-card-default-denies-decision reads observed 0',
  'none', 'd1:qnfo-audit human_actions, v_human_action_gate, sqlite_master (SELECT only); offline node:sqlite suite migrations/default-approve.test.mjs replays the live trigger texts then this file'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'DEFAULT-APPROVE-1:') = 1);
