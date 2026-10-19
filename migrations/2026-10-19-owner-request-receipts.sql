-- OWNER-REQUEST-RECEIPT-1 (2026-10-19, qnfo-fleet-dashboard 1.46.0, charter pillar: autonomy): a receipt is not fleet work owed to the owner.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_gate_def
-- Rollback: DROP VIEW v_human_action_gate; then run the sql column of bak_20261019_gate_def (the view without the receipt branch); DELETE FROM control_registry WHERE control = 'owner-request-receipt-gate';
--
-- WHY (measured 2026-10-19 06:20Z in qnfo-audit)
-- The trigger owner_request_requires_card writes a human_actions card, source 'owner-request-issue', when an agent_issues row of category
-- owner-request closes ("Open fleet.qnfo.org and decide or dismiss this card"): the owner's receipt that the fleet closed their request.
-- human_actions_autonomy_first_ai skips that source (since the 2026-10-18 trigger-cycle fix, agent_issues 99919), so nothing reroutes it,
-- and v_human_action_gate then judges the card by its text: 5 of 7 open receipts read 'fleet' (2 read 'owner' on words such as "token" or
-- "account"). Result: owner_queue_fleet_cards_open = 5 and owner_dispatched_items_7d = 5 (both target 0, RM-678 and RM-679, #2376) and
-- 7 of the 11 cards the page showed "waiting on you" were receipts for issues the fleet had closed with close_evidence (2783, 2811, 2865,
-- 2900, 2933, 99956, 100023). A receipt asks the owner for no decision, so it is neither a fleet decision pushed to the owner nor an owner
-- stop. The gate gets a third value for it: 'receipt'. The three counts that read 'fleet' (the reroute trigger, the two metrics) and the
-- ones that read 'owner' (owner_stops_justified, autonomy_rate_7d) no longer see it. The dashboard lists receipts apart from what waits on the
-- owner (qnfo-fleet-dashboard 1.46.0). The card stays open until the owner dismisses it; nothing is deleted or closed here.
-- control_registry: the gate is a gate; this narrows what it judges and keeps its alternate path (ops_config autonomy_first_gate = off).

CREATE TABLE IF NOT EXISTS bak_20261019_gate_def AS
  SELECT name, sql FROM sqlite_master WHERE type = 'view' AND name = 'v_human_action_gate';

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

INSERT OR IGNORE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, evidence, issue_id) VALUES
  ('owner-request-receipt-gate', 'qnfo-audit.v_human_action_gate (first branch: source owner-request-issue reads receipt)', 'gate',
   'a receipt for an owner-request issue the fleet closed being counted as fleet work owed to the owner (owner_queue_fleet_cards_open, owner_dispatched_items_7d) or as an owner stop',
   0, 'keep', 'applied', 'ops_config autonomy_first_gate = off stops the reroute; the view branch is one WHEN line',
   '2026-10-19: 5 of 7 open receipts read fleet and 2 read owner on incidental words; both headline metrics read 5; all seven issues were closed with close_evidence (OWNER-REQUEST-RECEIPT-1, migrations/2026-10-19-owner-request-receipts.sql)', 2376);
