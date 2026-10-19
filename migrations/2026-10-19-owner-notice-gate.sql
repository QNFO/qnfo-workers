-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_human_action_gate_def
-- Rollback: DELETE FROM remediation_contracts WHERE class = 'fm-owner-notice-counted-as-dispatch'; DELETE FROM failure_modes WHERE fm_key = 'owner-notice-counted-as-dispatch'; DROP VIEW v_human_action_gate; then run the sql column of bak_20261019_human_action_gate_def (the view without the notice gate).
-- spof-review: none added; the reroute trigger human_actions_autonomy_first_ai already skips these cards by source, so the gate change only moves them out of the alarm counts
--
-- OWNER-NOTICE-GATE-1 (2026-10-19, pillar autonomy; owner directive 2026-10-19 "DO ANY ISSUES AFFECT FLEET'S OWN LOOPS? AUDIT,
-- RESOLVE, AND REMEDIATE ALL SUCH FAILURE MODES AND THEIR ROOT CAUSES").
--
-- WHAT WAS WRONG (qnfo-audit 2026-10-19 05:55Z)
-- When a loop closes an owner-request issue, the D1 trigger owner_request_requires_card posts a "decide or dismiss" notice to the
-- owner queue (human_actions, source 'owner-request-issue'), so the owner sees what was done with their request. The reroute
-- trigger human_actions_autonomy_first_ai skips that source on purpose (the owner keeps the review; a later attempt to post the
-- notices pre-resolved was refused and that refusal stands). But v_human_action_gate still graded each notice by its words, and a
-- notice copies the closed issue's technical text, so 5 of them (cards 103-107) read gate = 'fleet'. Every reader of the gate then
-- counted the owner's own request coming back to them as fleet work routed to the owner:
--   owner_dispatched_items_7d = 5 (kernel_registries_tick), which keeps METRIC-TRIGGER-3529 (agent_issues 2376) open for good
--   v_autonomy_first_audit.owner_cards_fleet_open (metric owner_queue_fleet_cards_open), v_doctrine_rev3_blockers.owner_decisions_7d
-- and the 2 notices whose text read as identity-bound (108, 112) inflated owner_dispatch_7d and lowered autonomy_rate_7d.
--
-- WHAT THIS CHANGES
-- v_human_action_gate gains a third value, 'notice', for a card whose source is 'owner-request-issue', unless its text carries an
-- IDENTITY-BOUND: line (then it is a real owner step and stays 'owner'). Readers filter gate = 'fleet' or gate = 'owner', so a
-- notice now counts as neither. The card itself is untouched: same row, same status, still on fleet.qnfo.org for the owner.

CREATE TABLE IF NOT EXISTS bak_20261019_human_action_gate_def AS
  SELECT name, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at FROM sqlite_master WHERE type = 'view' AND name = 'v_human_action_gate';

DROP VIEW IF EXISTS v_human_action_gate;

CREATE VIEW v_human_action_gate AS
SELECT id, slug, status, source, title,
  CASE
    WHEN t LIKE '%IDENTITY-BOUND:%' THEN 'owner'
    WHEN COALESCE(source, '') = 'owner-request-issue' THEN 'notice'
    WHEN t LIKE '%merge PR%' OR t LIKE '%merge https://github.com%' OR t LIKE '%review and merge%' OR t LIKE '%squash-merge%'
      OR t LIKE '%pull request%' THEN 'fleet'
    WHEN t LIKE '%token%' OR t LIKE '%credential%' OR t LIKE '%secret%' OR t LIKE '%password%' OR t LIKE '%sign-in%' OR t LIKE '%oauth%'
      OR t LIKE '%api key%' OR t LIKE '%your location%' OR t LIKE '%desktop%' OR t LIKE '%your own%' OR t LIKE '%yourself%'
      OR t LIKE '%only you%' OR t LIKE '%legal%' OR t LIKE '%patent applic%' OR t LIKE '%payment%' OR t LIKE '%invoice%'
      OR t LIKE '%bank%' OR t LIKE '%signature%' THEN 'owner'
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

-- Refresh the alarm metric now rather than at the next :00-:09 tick, with the same expression kernel_registries_tick uses.
UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED', last_value = CAST((
    SELECT COUNT(*) FROM v_human_action_gate g JOIN human_actions h ON h.id = g.id
    WHERE g.gate = 'fleet' AND COALESCE(h.status, '') <> 'rerouted' AND h.created_at > datetime('now', '-7 days')) AS TEXT)
WHERE metric = 'owner_dispatched_items_7d';

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('owner-notice-counted-as-dispatch',
  'the closure notice the owner gets for their own request is counted as fleet work routed to the owner, so the dispatch alarm never clears',
  'v_human_action_gate grades a card only by its words, and owner_request_requires_card copies the closed issue''s technical text into the notice, so the notice reads as fleet work although the reroute trigger deliberately leaves it with the owner',
  'OWNER-NOTICE-GATE-1 (migrations/2026-10-19-owner-notice-gate.sql): a card from source owner-request-issue grades as notice unless it carries an IDENTITY-BOUND: line, and readers that count fleet or owner cards no longer count it',
  'no card from source owner-request-issue grades as fleet in v_human_action_gate',
  'fm-owner-notice-counted-as-dispatch', '2026-10-19', 2376,
  'an owner-request issue closes and its notice card is graded fleet',
  'owner_dispatched_items_7d = 5 on 2026-10-19 (cards 103-107, all closure notices), METRIC-TRIGGER-3529 open as agent_issues 2376',
  'owner_dispatched_items_7d, owner_queue_fleet_cards_open, owner_dispatch_7d, autonomy_rate_7d and the doctrine scorecards');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-owner-notice-counted-as-dispatch', NULL, 'OWNER-NOTICE-GATE-1', 'failure-mode detector',
  'SELECT ''0'' AS expected, CAST((SELECT COUNT(*) FROM v_human_action_gate WHERE COALESCE(source, '''') = ''owner-request-issue'' AND gate = ''fleet'') AS TEXT) AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01X81kqL6v2eFPmyL3JayV1i',
  'a closure notice of the owner''s own request is information for the owner, not a decision the fleet routed to them, and it must still reach the owner',
  'OWNER-NOTICE-GATE-1: v_human_action_gate grades owner-request-issue cards as notice (IDENTITY-BOUND text stays owner)',
  'qnfo-audit 2026-10-19 05:55Z: the 5 fleet-graded, non-rerouted cards of the last 7 days (103-107) are all source owner-request-issue, open, posted by owner_request_requires_card when a loop closed the request',
  'migration merged', 'v_human_action_gate and its readers (alarm metrics and scorecards), no card row changes', 'the Rollback header (view text in bak_20261019_human_action_gate_def)',
  'the dispatch alarm measures only fleet work that reached the owner',
  'owner_dispatched_items_7d reads 0 within 10 minutes of the apply and METRIC-TRIGGER-3529 (agent_issues 2376) closes through TRIGGER-RECOVERY-1 within 120 minutes',
  'none', 'd1:qnfo-audit human_actions, v_human_action_gate, sqlite_master (readers of the view), metric_registry'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'OWNER-NOTICE-GATE-1:') = 1);
