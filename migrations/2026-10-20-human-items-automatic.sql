-- HUMAN-ITEMS-AUTOMATIC-1 (2026-10-20, owner standing directive; charter pillar: autonomy).
-- Owner words: "These items/issues shall always be handled automatically by the system." Said after the needs_human code tasks and the owner-task cards (INTENT-TASK, OWNER-TASK) had waited hours for a session
-- on 2026-10-19: 8 parked code tasks and 18 cards, none carrying an IDENTITY-BOUND: line. Three things make the directive hold in the system:
--   1. The directive is recorded for machines (ops_config OWNER_DIRECTIVE_2026_10_20_HUMAN_ITEMS_AUTOMATIC_1, INSERT OR IGNORE, the shape of the earlier directive rows) and in docs and CLAUDE.md.
--   2. v_human_action_gate graded a card from the owner's task intake 'owner' on a weak keyword (account, public, personal, delete, profile, licen, deadline, email ...), and only a card graded 'fleet' is rerouted to the
--      fleet by AUTONOMY-FIRST-REROUTE-1. A card titled INTENT-TASK-... or OWNER-TASK-... is now 'fleet' unless an earlier clause grades it otherwise: the explicit IDENTITY-BOUND: line, a pull-request merge
--      (fleet anyway) and the hard markers (token, credential, secret, password, sign-in, oauth, api key, your location, desktop, your own, yourself, only you, legal, patent applic, payment, invoice, bank,
--      signature) keep their owner grade. Only the weak keyword tier and the default no longer hold such a card. The view is copied to bak_20261020_gate_view first; the Rollback line recreates the earlier text.
--   3. fm-human-items-waiting: a detector for an item that waits: a needs_human code task untouched for 120 minutes, or an owner-task card open for 120 minutes with no IDENTITY-BOUND: line. Expected 0.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261020_gate_view
-- Rollback: DROP VIEW IF EXISTS v_human_action_gate; CREATE VIEW v_human_action_gate AS SELECT id, slug, status, source, title, CASE WHEN source = 'owner-request-issue' THEN 'receipt' WHEN t LIKE '%IDENTITY-BOUND:%' THEN 'owner' WHEN t LIKE '%merge PR%' OR t LIKE '%merge https://github.com%' OR t LIKE '%review and merge%' OR t LIKE '%squash-merge%' OR t LIKE '%pull request%' THEN 'fleet' WHEN t LIKE '%token%' OR t LIKE '%credential%' OR t LIKE '%secret%' OR t LIKE '%password%' OR t LIKE '%sign-in%' OR t LIKE '%oauth%' OR t LIKE '%api key%' OR t LIKE '%your location%' OR t LIKE '%desktop%' OR t LIKE '%your own%' OR t LIKE '%yourself%' OR t LIKE '%only you%' OR t LIKE '%legal%' OR t LIKE '%patent applic%' OR t LIKE '%payment%' OR t LIKE '%invoice%' OR t LIKE '%bank%' OR t LIKE '%signature%' THEN 'owner' WHEN t LIKE '%kill band%' OR t LIKE '%ops_config%' OR t LIKE '%fleet_budget%' OR t LIKE '%code loop%' OR t LIKE '%control-plane%' OR t LIKE '%search space%' OR t LIKE '%threshold%' OR t LIKE '%rules file%' OR t LIKE '%body_md%' OR t LIKE '%worker.js%' OR t LIKE '%cadence%' OR t LIKE '% cap %' OR t LIKE '% caps%' OR t LIKE '%remedy window%' OR t LIKE '%objectives%' OR t LIKE '%bulk edit%' THEN 'fleet' WHEN t LIKE '%sign in%' OR t LIKE '%login%' OR t LIKE '%log in%' OR t LIKE '%account%' OR t LIKE '% key %' OR t LIKE '% key,%' OR t LIKE '%patent%' OR t LIKE '%licen%' OR t LIKE '%application%' OR t LIKE '%endorse%' OR t LIKE '%ORCID%' OR t LIKE '%LinkedIn%' OR t LIKE '%Scholar%' OR t LIKE '%profile%' OR t LIKE '%consent%' OR t LIKE '%personal%' OR t LIKE '%identity%' OR t LIKE '%inbox%' OR t LIKE '%Gmail%' OR t LIKE '%Outlook%' OR t LIKE '%deadline%' OR t LIKE '%nonprofit%' OR t LIKE '%CV %' OR t LIKE '%public%' OR t LIKE '%privacy%' OR t LIKE '%delete%' OR t LIKE '%Hacker News%' OR t LIKE '%Reddit%' OR t LIKE '%Buffer%' OR t LIKE '%Bluesky%' OR t LIKE '%email %' OR t LIKE '%organizations/%' THEN 'owner' ELSE 'fleet' END AS gate FROM (SELECT *, ' ' || COALESCE(title, '') || ' ' || COALESCE(why, '') || ' ' || COALESCE(action, '') || ' ' || COALESCE(default_in_effect, '') || ' ' AS t FROM human_actions); DELETE FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_10_20_HUMAN_ITEMS_AUTOMATIC_1'; DELETE FROM remediation_contracts WHERE class = 'fm-human-items-waiting'; DELETE FROM failure_modes WHERE fm_key = 'human-items-waiting';

CREATE TABLE IF NOT EXISTS bak_20261020_gate_view AS SELECT name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS backed_up_at FROM sqlite_master WHERE type = 'view' AND name = 'v_human_action_gate';

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('OWNER_DIRECTIVE_2026_10_20_HUMAN_ITEMS_AUTOMATIC_1', '{"id":"HUMAN-ITEMS-AUTOMATIC-1","directive":"THESE ITEMS SHALL ALWAYS BE HANDLED AUTOMATICALLY BY THE SYSTEM","directive_verbatim":"These items/issues shall always be handled automatically by the system.","date":"2026-10-20","scope":"needs_human code tasks, owner tasks (human_actions cards from the owner''s task intake: INTENT-TASK, OWNER-TASK), and the issues that mirror them","carried_by":["AUTONOMY-FIRST-1 reroute (v_human_action_gate, AUTONOMY-FIRST-REROUTE-1)","fm-human-items-waiting detector (120 minutes)","the code loop and its exhausted-task issue (CODE-LOOP-EXHAUSTED-1)"],"limits":"an item that is irreversible and identity-bound (a credential only the owner can mint, money, a legal or signing act, the owner''s own accounts, machine or personal data) carries an IDENTITY-BOUND: line and stays with the owner; the harness permission checks, the secret lock and live work claims keep their precedence"}', 'HUMAN-ITEMS-AUTOMATIC-1 (owner standing directive 2026-10-20): needs_human code tasks, owner-task cards and their mirror issues are handled by the system; only an IDENTITY-BOUND: item stays with the owner. No worker reads the key: the loops honor it through the doctrine, the gate view and the fm-human-items-waiting detector.');

DROP VIEW IF EXISTS v_human_action_gate;
CREATE VIEW v_human_action_gate AS
SELECT id, slug, status, source, title,
  CASE
    WHEN source = 'owner-request-issue' THEN 'receipt'
    WHEN t LIKE '%IDENTITY-BOUND:%' THEN 'owner'
    WHEN t LIKE '%merge PR%' OR t LIKE '%merge https://github.com%' OR t LIKE '%review and merge%' OR t LIKE '%squash-merge%'
      OR t LIKE '%pull request%' THEN 'fleet'
    WHEN t LIKE '%token%' OR t LIKE '%credential%' OR t LIKE '%secret%' OR t LIKE '%password%' OR t LIKE '%sign-in%' OR t LIKE '%oauth%'
      OR t LIKE '%api key%' OR t LIKE '%your location%' OR t LIKE '%desktop%' OR t LIKE '%your own%' OR t LIKE '%yourself%'
      OR t LIKE '%only you%' OR t LIKE '%legal%' OR t LIKE '%patent applic%' OR t LIKE '%payment%' OR t LIKE '%invoice%'
      OR t LIKE '%bank%' OR t LIKE '%signature%' THEN 'owner'
    WHEN title LIKE 'INTENT-TASK-%' OR title LIKE 'OWNER-TASK-%' THEN 'fleet'
    WHEN t LIKE '%kill band%' OR t LIKE '%ops_config%' OR t LIKE '%fleet_budget%' OR t LIKE '%code loop%' OR t LIKE '%control-plane%'
      OR t LIKE '%search space%' OR t LIKE '%threshold%' OR t LIKE '%rules file%' OR t LIKE '%body_md%' OR t LIKE '%worker.js%'
      OR t LIKE '%cadence%' OR t LIKE '% cap %' OR t LIKE '% caps%' OR t LIKE '%remedy window%' OR t LIKE '%objectives%'
      OR t LIKE '%bulk edit%' THEN 'fleet'
    WHEN t LIKE '%sign in%' OR t LIKE '%login%' OR t LIKE '%log in%' OR t LIKE '%account%' OR t LIKE '% key %' OR t LIKE '% key,%'
      OR t LIKE '%patent%' OR t LIKE '%licen%' OR t LIKE '%application%' OR t LIKE '%endorse%' OR t LIKE '%ORCID%'
      OR t LIKE '%LinkedIn%' OR t LIKE '%Scholar%' OR t LIKE '%profile%' OR t LIKE '%consent%' OR t LIKE '%personal%'
      OR t LIKE '%identity%' OR t LIKE '%inbox%' OR t LIKE '%Gmail%' OR t LIKE '%Outlook%' OR t LIKE '%deadline%'
      OR t LIKE '%nonprofit%' OR t LIKE '%CV %' OR t LIKE '%public%' OR t LIKE '%privacy%' OR t LIKE '%delete%'
      OR t LIKE '%Hacker News%' OR t LIKE '%Reddit%' OR t LIKE '%Buffer%' OR t LIKE '%Bluesky%' OR t LIKE '%email %'
      OR t LIKE '%organizations/%' THEN 'owner'
    ELSE 'fleet'
  END AS gate
FROM (SELECT *, ' ' || COALESCE(title, '') || ' ' || COALESCE(why, '') || ' ' || COALESCE(action, '') || ' '
        || COALESCE(default_in_effect, '') || ' ' AS t FROM human_actions);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('human-items-waiting', 'a needs_human code task or an owner-task card waits for a person although it is not identity-bound',
  'the gate graded a card from the owner task intake owner on a weak keyword, so it was never rerouted, and a parked code task has no doer of its own: both waited hours for a session on 2026-10-19 (8 tasks, 18 cards)',
  'v_human_action_gate grades an INTENT-TASK or OWNER-TASK card fleet unless an IDENTITY-BOUND: line or a hard marker says owner; fm-human-items-waiting reads the wait in minutes; the code loop and its CODE-LOOP-EXHAUSTED-1 issue are the doer of a parked task',
  'the fm-human-items-waiting contract counts needs_human code tasks untouched for 120 minutes plus owner-task cards open for 120 minutes without an IDENTITY-BOUND: line, expected 0',
  'fm-human-items-waiting', strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), NULL,
  'a code_tasks row in needs_human for over 120 minutes, or an INTENT-TASK or OWNER-TASK human_actions card open over 120 minutes with no IDENTITY-BOUND: line',
  'owner_dispatch_7d above 0 for cards that are not identity-bound, tasks the owner queued still open the next day',
  'the owner queue and the code loop: work the owner asked for sits until a person looks at it');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, next_due_at)
VALUES ('fm-human-items-waiting', NULL, 'HUMAN-ITEMS-AUTOMATIC-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM code_tasks WHERE status = ''needs_human'' AND updated_at < strftime(''%Y-%m-%dT%H:%M:%fZ'', ''now'', ''-120 minutes'')) + (SELECT COUNT(*) FROM human_actions WHERE status IN (''open'', ''pending'') AND created_at < strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-120 minutes'') AND (title LIKE ''INTENT-TASK-%'' OR title LIKE ''OWNER-TASK-%'') AND COALESCE(why, '''') NOT LIKE ''%IDENTITY-BOUND:%'') AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01MQYeWxrMd4mVYPCphyaYes',
  'an item the owner queued, or a parked code task, is handled by the system; a card is held for the owner only when it says so with an IDENTITY-BOUND: line or names a hard marker',
  'HUMAN-ITEMS-AUTOMATIC-1: directive recorded; v_human_action_gate grades INTENT-TASK and OWNER-TASK cards fleet past the weak keyword tier; fm-human-items-waiting reads the wait',
  'qnfo-audit 2026-10-20 read-only: 8 needs_human code tasks and 18 owner-task cards waited hours on 2026-10-19, none with an IDENTITY-BOUND: line; owner_dispatch_7d read 12; the gate view text',
  'migration merged',
  'one view (copied to bak_20261020_gate_view), one ops_config row, one failure mode, one detector contract',
  'the Rollback header of migrations/2026-10-20-human-items-automatic.sql',
  'owner-queued tasks reach a doer without a person routing them',
  'owner_dispatch_7d for non-identity-bound cards falls to 0; fm-human-items-waiting stays at 0',
  'none',
  'd1:qnfo-audit read-only gate view text, node:sqlite fixtures in migrations/human-items-automatic.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE action LIKE 'HUMAN-ITEMS-AUTOMATIC-1:%');
