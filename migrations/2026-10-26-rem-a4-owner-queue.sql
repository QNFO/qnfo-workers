-- REM-A4-OWNER-QUEUE-1 (2026-10-26, charter pillar autonomy; agent_issues 100459 and 100454, rem-a4 slice of the doctrine and closing-machinery cluster).
--
-- 100459 IB-HELD-1. v_human_action_decision.held was "decision = 1 AND hard = 0 AND ib = 1", and human_actions_default_adopt_ai (DEFAULT-ADOPTED-1, owner directive 2026-10-12) closes a card at birth
-- on its stated default whenever approve + held = 0. So an IDENTITY-BOUND card reached the owner only when its action looked like a decision AND no hard marker matched its text; every other
-- IDENTITY-BOUND card that carried a default_in_effect was resolved in the statement that filed it. Read from qnfo-audit 2026-10-26 19:25Z: 34 cards carry the IDENTITY-BOUND: line, 28 of them grade
-- hard = 1 (an e-mail address, a payment, a credential, a legal act), 5 grade hard = 0 and decision = 0, one (card 115) is held; 23 carry a DEFAULT-ADOPTED-1 resolution: 18 closed at birth by the trigger since
-- 2026-10-12, the newest two today (189 bp26-retention-enforce at 18:44Z, 190 attest-first-credibility-event at 19:19Z), and 5 (46 51 52 65 67) closed in bulk on the owner's chat instruction of 2026-10-12. The one-line patch the issue names (drop "decision = 1") would not have kept its
-- own example: card 142 holds an e-mail address, and '%@_%._%' is a hard marker. A writer who adds the IDENTITY-BOUND: line says the owner is needed (CLAUDE.md, AUTONOMY-FIRST-1); the label, not the wording
-- of the action and not a lexical net, is the barrier. hard keeps its other job: it bars a card from FLEET approval (approve still needs hard = 0 AND ib = 0). The unapplied
-- docs/handoff/patches/default-approve-2.patch says the same in its text ("hard only excludes a card from the approve wording, it is not a second interrupt gate"), but its held still needs decision = 1.
-- DECISION (assumption, one line): held = ib = 1 for every source except owner-request-issue (a closure notice is never held, as before), behind the same kill switch (ops_config default_approve_gate = off
-- restores DEFAULT-ADOPTED-1 for every card at once). The two triggers that read the view are untouched. The 18 cards the trigger closed at birth since 2026-10-12 (and the 5 the owner closed by chat instruction) are NOT reopened: their defaults have
-- been in force and the owner can reopen any of them with status = open; the ids are in the decision_log row below.
-- WINDOW: the runner applies statements one at a time, so a human_actions INSERT in the few milliseconds between DROP VIEW and CREATE VIEW would fail in its trigger (about 2 to 8 cards a day: negligible).
--   The statements are adjacent on purpose. If CREATE VIEW ever failed, the Rollback line below recreates the old view.
-- DETECTORS. fm-card-default-denies-decision counted "approve = 1 OR held = 1" among cards closed by DEFAULT-ADOPTED-1; with the wider held it would read 23 (the history) and breach. It now counts the old
--   shapes for every card and the new shape only for cards filed after the first grading (ops_config ib_held_since_card_id, set below to the newest card id after the view is replaced), so its sensitivity to the
--   old shape is unchanged. fm-ib-card-closed-at-birth is new and does not read the view at all (the label text itself), so a regression of the view cannot hide it.
-- CONTRACT issue-100459. Its probe (LIKE '%decision = 1%AND%ib = 1%') also matched the approve branch followed by the held branch, so it could never pass after any fix; the new probe reads the stored view text
--   precisely and also fails when a card graded held after the baseline was closed at birth.
-- 100454. The issue text corrects itself: the metric is truthful, the remaining defect is "an owner-classified e-mail waits with processed_at NULL, no loop owns triage-to-disposition". Measured 2026-10-26 19:25Z:
--   emails.processed_at is written by nothing since 2026-09-26 (233 e-mails received since, 2 carry it; 370 of 711 before), and no code reads it. The 90 personal-unverified rows with processed_at NULL all carry a
--   terminal status set by qnfo-email at receipt (46 archived, 38 spam, 5 processed, 1 replied). The owner-facing queue is v_email_human_pending_v2 (the dashboard attention source and the e-mail leg of v_owner_queue_live):
--   0 rows, so no personal or personal-unverified mail waits on anyone; 0 stuck at status received for over 60 minutes; human_actions holds 0 non-open cards without resolved_at (the retracted first root cause) and
--   the 18 rerouted cards all carry resolved_at. The probe moves from the dead column to the canonical queue with the issue's own 24-hour threshold, plus a stall check and the original second path.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261026_v_human_action_decision
-- Rollback: DROP VIEW IF EXISTS v_human_action_decision; CREATE VIEW v_human_action_decision AS SELECT id, slug, status, source, decision, hard, ib, gate, CASE WHEN COALESCE((SELECT value FROM ops_config WHERE key = 'default_approve_gate'), 'on') <> 'off' AND decision = 1 AND hard = 0 AND ib = 0 AND gate = 'fleet' AND COALESCE(source, '') <> 'owner-request-issue' THEN 1 ELSE 0 END AS approve, CASE WHEN COALESCE((SELECT value FROM ops_config WHERE key = 'default_approve_gate'), 'on') <> 'off' AND decision = 1 AND hard = 0 AND ib = 1 AND COALESCE(source, '') <> 'owner-request-issue' THEN 1 ELSE 0 END AS held FROM (SELECT id, slug, status, source, CASE WHEN (EXISTS (SELECT 1 FROM default_approve_markers m WHERE m.kind = 'decision_action' AND a LIKE m.pattern) OR EXISTS (SELECT 1 FROM default_approve_markers m WHERE m.kind = 'decision_title' AND ti LIKE m.pattern)) AND NOT EXISTS (SELECT 1 FROM default_approve_markers m WHERE m.kind = 'decision_title_not' AND ti LIKE m.pattern) THEN 1 ELSE 0 END AS decision, CASE WHEN EXISTS (SELECT 1 FROM default_approve_markers m WHERE m.kind = 'hard' AND t LIKE m.pattern) THEN 1 ELSE 0 END AS hard, CASE WHEN t LIKE '%identity-bound:%' THEN 1 ELSE 0 END AS ib, COALESCE((SELECT g.gate FROM v_human_action_gate g WHERE g.id = x.id), 'owner') AS gate FROM (SELECT id, slug, status, source, lower(trim(COALESCE(title, ''))) AS ti, lower(COALESCE(action, '')) AS a, ' ' || lower(COALESCE(title, '') || ' ' || COALESCE(why, '') || ' ' || COALESCE(action, '') || ' ' || COALESCE(default_in_effect, '')) || ' ' AS t FROM human_actions) x); UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM human_actions h JOIN v_human_action_decision d ON d.id = h.id WHERE h.resolution LIKE ''DEFAULT-ADOPTED-1%'' AND (d.approve = 1 OR d.held = 1)) AS TEXT) AS observed' WHERE class = 'fm-card-default-denies-decision'; UPDATE remediation_contracts SET verify_probe = 'SELECT ''decision_1_conjunct_absent_in_ib_held'' AS expected, CASE WHEN (SELECT sql FROM sqlite_master WHERE type=''view'' AND name=''v_human_action_decision'') LIKE ''%decision = 1%AND%ib = 1%'' THEN ''decision_1_conjunct_present_in_ib_held'' ELSE ''decision_1_conjunct_absent_in_ib_held'' END AS observed' WHERE class = 'issue-100459'; UPDATE remediation_contracts SET verify_probe = 'SELECT ''0'' AS expected, CAST(COUNT(*) AS TEXT) AS observed FROM emails WHERE classification=''personal-unverified'' AND processed_at IS NULL AND received_at < datetime(''now'',''-1 hour'')' WHERE class = 'issue-100454'; DELETE FROM remediation_contracts WHERE class = 'fm-ib-card-closed-at-birth'; DELETE FROM failure_modes WHERE fm_key = 'ib-card-closed-at-birth'; DELETE FROM ops_config WHERE key = 'ib_held_since_card_id'

CREATE TABLE IF NOT EXISTS bak_20261026_v_human_action_decision AS SELECT name, type, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at FROM sqlite_master WHERE type = 'view' AND name = 'v_human_action_decision';

DROP VIEW IF EXISTS v_human_action_decision;
CREATE VIEW v_human_action_decision AS
SELECT id, slug, status, source, decision, hard, ib, gate,
  CASE WHEN COALESCE((SELECT value FROM ops_config WHERE key = 'default_approve_gate'), 'on') <> 'off'
        AND decision = 1 AND hard = 0 AND ib = 0 AND gate = 'fleet' AND COALESCE(source, '') <> 'owner-request-issue' THEN 1 ELSE 0 END AS approve,
  CASE WHEN COALESCE((SELECT value FROM ops_config WHERE key = 'default_approve_gate'), 'on') <> 'off'
        AND ib = 1 AND COALESCE(source, '') <> 'owner-request-issue' THEN 1 ELSE 0 END AS held
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

-- the baseline is read after the view is replaced: a card filed before it was handled by the old text, a card filed after it by the new one
INSERT OR IGNORE INTO ops_config (key, value, note, updated_at)
SELECT 'ib_held_since_card_id', CAST(COALESCE(MAX(id), 0) AS TEXT),
  'IB-HELD-1 (agent_issues 100459, 2026-10-26): the newest human_actions id when v_human_action_decision began to hold every IDENTITY-BOUND card. The detectors fm-ib-card-closed-at-birth and fm-card-default-denies-decision count a DEFAULT-ADOPTED-1 closure of an IDENTITY-BOUND card only above it (the 23 earlier DEFAULT-ADOPTED-1 resolutions are history). Deleting the row makes both detectors count the history and read red.',
  datetime('now')
FROM human_actions;

UPDATE remediation_contracts
   SET verify_probe = 'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM human_actions h JOIN v_human_action_decision d ON d.id = h.id WHERE h.resolution LIKE ''DEFAULT-ADOPTED-1%'' AND (d.approve = 1 OR (d.held = 1 AND ((d.decision = 1 AND d.hard = 0) OR h.id > COALESCE((SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''ib_held_since_card_id''), 0))))) AS TEXT) AS observed'
 WHERE class = 'fm-card-default-denies-decision' AND instr(verify_probe, 'ib_held_since_card_id') = 0;

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('ib-card-closed-at-birth',
  'an owner card that carries an IDENTITY-BOUND: line is closed in the statement that files it, on the default its writer stated, so the step only the owner can take never reaches the owner queue',
  'human_actions_default_adopt_ai closes any open card with a default_in_effect unless v_human_action_decision grades it approved or held, and held required decision = 1 AND hard = 0 beside the label: of 34 IDENTITY-BOUND cards 28 grade hard = 1 and 5 are not decision-shaped, 18 were closed at birth by the trigger since 2026-10-12 (agent_issues 100459, human_actions 142, 175, 189, 190)',
  'IB-HELD-1 (migrations/2026-10-26-rem-a4-owner-queue.sql): held = ib = 1 for every source except owner-request-issue; ops_config ib_held_since_card_id records the first card the new grading covers; offline suite migrations/rem-a4-owner-queue.test.mjs replays the live objects',
  'no human_actions row above ib_held_since_card_id whose text carries identity-bound: has a DEFAULT-ADOPTED-1 resolution while default_approve_gate is not off (closure notices of source owner-request-issue excluded)',
  'fm-ib-card-closed-at-birth', '2026-10-26', 100459,
  'someone recreates v_human_action_decision or human_actions_default_adopt_ai without the IDENTITY-BOUND hold, or turns the gate off and on again, or a new writer closes a labelled card with the DEFAULT-ADOPTED-1 resolution text',
  'a decision or a step that only the owner can take (money, a legal act, a credential, the owner mailbox) is closed on its default and is invisible in the owner queue (human_wait_oldest_min and owner_queue_live_open never see it)',
  'every IDENTITY-BOUND card');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-ib-card-closed-at-birth', NULL, 'IB-HELD-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM human_actions h WHERE h.resolution LIKE ''DEFAULT-ADOPTED-1%'' AND h.id > COALESCE((SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''ib_held_since_card_id''), 0) AND instr(lower(COALESCE(h.title, '''') || '' '' || COALESCE(h.why, '''') || '' '' || COALESCE(h.action, '''') || '' '' || COALESCE(h.default_in_effect, '''')), ''identity-bound:'') > 0 AND COALESCE(h.source, '''') <> ''owner-request-issue'' AND COALESCE((SELECT value FROM ops_config WHERE key = ''default_approve_gate''), ''on'') <> ''off'') AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

UPDATE remediation_contracts
   SET verify_probe = 'WITH v AS (SELECT (SELECT sql FROM sqlite_master WHERE type = ''view'' AND name = ''v_human_action_decision'') AS sql) SELECT ''held-by-ib-label'' AS expected, CASE WHEN instr(v.sql, ''decision = 1 AND hard = 0 AND ib = 1'') > 0 THEN ''held-needs-decision'' WHEN instr(v.sql, ''hard = 0 AND ib = 1'') > 0 THEN ''held-needs-no-hard'' WHEN instr(v.sql, ''AND ib = 1 AND COALESCE(source'') = 0 THEN ''view-unrecognised'' WHEN (SELECT COUNT(*) FROM human_actions h JOIN v_human_action_decision d ON d.id = h.id WHERE h.resolution LIKE ''DEFAULT-ADOPTED-1%'' AND d.held = 1 AND h.id > COALESCE((SELECT CAST(value AS INTEGER) FROM ops_config WHERE key = ''ib_held_since_card_id''), 0)) > 0 THEN ''ib-card-closed-at-birth-after-the-fix'' ELSE ''held-by-ib-label'' END AS observed FROM v',
       action = 'MEASURES the defect (rem-a4, 2026-10-26): reads the stored text of v_human_action_decision and reads held-by-ib-label only when the held column needs neither decision = 1 nor hard = 0 beside the IDENTITY-BOUND label, and no card graded held after the baseline ops_config ib_held_since_card_id was closed at birth by DEFAULT-ADOPTED-1. Other readings name what is still wrong: held-needs-decision, held-needs-no-hard, view-unrecognised, ib-card-closed-at-birth-after-the-fix (a missing view is a probe error, which never closes anything). The standing detector fm-ib-card-closed-at-birth watches the behaviour from the card text itself.',
       verify_transport = 'd1-query', status = 'active', last_verdict = NULL, attempts = 0, last_attempt_at = NULL, deferred_since = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-100459' AND instr(verify_probe, 'held-by-ib-label') = 0;

UPDATE remediation_contracts
   SET verify_probe = 'SELECT ''cards:0 mail:0 stuck:0'' AS expected, ''cards:'' || (SELECT COUNT(*) FROM human_actions WHERE resolved_at IS NULL AND status <> ''open'') || '' mail:'' || (SELECT COUNT(*) FROM v_email_human_pending_v2 v JOIN emails e ON e.id = v.id WHERE e.classification IN (''personal'', ''personal-unverified'') AND julianday(v.received_at) < julianday(''now'', ''-24 hours'')) || '' stuck:'' || (SELECT COUNT(*) FROM emails WHERE classification IN (''personal'', ''personal-unverified'') AND status = ''received'' AND julianday(received_at) < julianday(''now'', ''-60 minutes'')) AS observed',
       action = 'MEASURES the defect (rem-a4, 2026-10-26): an owner-classified e-mail that waits without a disposition, and a finished owner card that still counts as waiting. emails.processed_at is written by nothing since 2026-09-26, so the earlier probe counted a dead column (90 rows, all with a terminal status). The canonical queue is v_email_human_pending_v2 (the dashboard attention source and the e-mail leg of v_owner_queue_live). Reads cards:0 mail:0 stuck:0 only when no non-open human_actions row lacks resolved_at, no personal or personal-unverified mail has waited over 24 hours in that queue, and none is stuck at status received for over 60 minutes.',
       verify_transport = 'd1-query', status = 'active', last_verdict = NULL, attempts = 0, last_attempt_at = NULL, deferred_since = NULL, next_due_at = datetime('now')
 WHERE class = 'issue-100454' AND instr(verify_probe, 'cards:0 mail:0 stuck:0') = 0;

UPDATE control_registry
   SET evidence = evidence || ' | IB-HELD-1 (2026-10-26, agent_issues 100459): a card that carries an IDENTITY-BOUND: line is now held open whatever its wording and whatever hard marker it matches (v_human_action_decision.held = ib), so DEFAULT-ADOPTED-1 no longer closes an owner-reserved card at birth; hard remains a bar on fleet approval only. migrations/rem-a4-owner-queue.test.mjs replays the live objects.',
       reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
 WHERE control = 'default-adopt-status-quo' AND instr(evidence, 'IB-HELD-1') = 0;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'rem-a4-ownerq',
  'an IDENTITY-BOUND: line is the writer saying the owner is needed, so the label alone holds a card open; hard markers bar fleet approval, they are not a second interrupt gate; and a closing probe must read the thing the loops and the owner actually use (v_email_human_pending_v2), not a column nothing writes',
  'REM-A4-OWNER-QUEUE-1: v_human_action_decision.held = ib = 1 except for closure notices (agent_issues 100459); fm-card-default-denies-decision gets the ib_held_since_card_id baseline; new detector fm-ib-card-closed-at-birth; the closing probes of 100459 and 100454 rewritten to measure the definition of done (100454: the owner mail queue, not emails.processed_at)',
  'qnfo-audit 2026-10-26 19:25Z: 34 IDENTITY-BOUND cards, 28 hard, 5 hard 0 and decision 0, 1 held (115), 23 carry a DEFAULT-ADOPTED-1 resolution: 18 closed at birth by the trigger since 2026-10-12 (ids 71 72 73 75 76 78 102 109 110 111 125 171 172 173 174 175 189 190) and 5 closed in bulk on the owner''s chat instruction of 2026-10-12 (46 51 52 65 67), none reopened; emails: 233 received since 2026-09-26 and 2 carry processed_at, v_email_human_pending_v2 holds 0 rows, 90 personal-unverified rows with processed_at NULL all have status archived 46, spam 38, processed 5, replied 1; human_actions non-open without resolved_at 0',
  'applied by migration',
  'one view replaced (two triggers read it, untouched), one ops_config baseline row, one detector probe narrowed to the history cut, one failure mode and one detector added, two issue contracts rewritten, one control_registry evidence note; no worker change, no card reopened',
  'the Rollback header line recreates the old view and the three old probes and removes the new rows; bak_20261026_v_human_action_decision holds the old view text; ops_config default_approve_gate = off restores DEFAULT-ADOPTED-1 for every card at once',
  'an owner-reserved card is no longer dropped at birth',
  'every new card with an IDENTITY-BOUND: line stays open (status open, no DEFAULT-ADOPTED-1 resolution) and fm-ib-card-closed-at-birth reads 0; issue 100459 closes on its contract (held-by-ib-label); issue 100454 closes on its contract (cards:0 mail:0 stuck:0). Side effects measured in advance: autonomy_rate_7d counts each DEFAULT-ADOPTED-1 close as an autonomous decision (8 IDENTITY-BOUND closes in the last 7 days), so it will read about 0.001 lower (0.951 to 0.950) once those stop; a held card waiting over 120 minutes trips human_wait_oldest_min (existing trigger, owner fleet, action SLA-120M-HUMAN-WAIT-1: red-team the card, reroute if it is not identity-bound), which is the signal, not a new loop',
  'reach: the owner sees the money, legal, credential and mailbox steps that only the owner can take',
  'node:sqlite replay of the live gate view, the three human_actions triggers, the markers and this file: migrations/rem-a4-owner-queue.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log d WHERE instr(d.action, 'REM-A4-OWNER-QUEUE-1:') = 1);
