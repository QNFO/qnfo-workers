-- AUTONOMY-FIRST-1 (2026-10-08, pillar autonomy). Owner directive 2026-10-08, verbatim: "Implement autonomy-first protocol
-- system/fleet-wide and in all Claude operations". The protocol: decide, don't ask; the ONLY permitted owner interrupt is an
-- action that is both irreversible and identity-bound (a credential only the owner can mint, money, a legal or signing act,
-- the owner's own accounts, machine or personal data, publishing on a channel whose terms forbid automation); technical,
-- operational and reversible decisions, merge approvals included, are the fleet's (docs/AUTONOMY-DECISION-POLICY.md,
-- charter section 8 rule 11, CLAUDE.md "Autonomy-first protocol").
--
-- Enforced here, for every writer of the owner queue (qnfo-audit.human_actions): loops (qnfo-ai-search ASK-TUNE-1 and
-- ASK-FIX-1, qnfo-fleet-dashboard), the dashboard's /api/human route and sessions writing D1 directly.
-- (1) v_human_action_gate classifies each card 'owner' or 'fleet'. Order: an explicit "IDENTITY-BOUND:" marker in the card
--     text -> owner; a merge or PR-review request -> fleet (no merge approvals); a credential, password, sign-in, OAuth,
--     API key, the owner's own machine or accounts, legal, patent filing, payment, bank or signature -> owner; a technical
--     knob (kill band, threshold, cap, cadence, ops_config, fleet_budget, code loop, control-plane, worker.js, search
--     space, rules file, bulk edit) -> fleet; a weaker identity signal (account, licence, application, ORCID, LinkedIn,
--     profile, consent, personal, identity, inbox, deadline, public visibility, delete, a third-party site posting)
--     -> owner; anything else -> fleet. Measured at authoring against all 63 cards ever written: 18 historical cards
--     (merge PR 574/726/762/763, raise the q08 cap, the remedy window, control-plane scope, bulk edit of 417 records, ...)
--     read 'fleet'; every credential, legal, money and owner-account card read 'owner'; of the 7 open cards only #63
--     (ASK-TUNE-1 "tuning has not moved ask_grounded_share_7d", a search-space decision) reads 'fleet'.
-- (2) Trigger human_actions_autonomy_first_ai: a new open card that reads 'fleet' becomes an agent_issues row
--     (AUTONOMY-FIRST-REROUTE-1: <title>, source autonomy-first-gate, the card's why/default/action carried over and the
--     instruction to decide and execute) and the card is set status 'rerouted' with the issue id in its resolution. The
--     writer's INSERT still succeeds (no loop breaks); nothing reaches the owner. ops_config autonomy_first_gate = 'off'
--     stops the reroute without a deploy. A misread owner card is restored by UPDATE ... SET status='open' and an
--     "IDENTITY-BOUND:" line in its why, which the gate always keeps.
-- (3) Backfill: the open 'fleet' cards at apply time (#63) are rerouted the same way.
-- (4) Metric owner_queue_fleet_cards_open (guard, target 0): open cards that read 'fleet'. Refreshed by D1 triggers on every
--     open_agent_issues write (the AUTONOMY-UNCAPPED-1 pattern; the refresh triggers are defined once, after (5)). A non-zero value means the gate is off or a card was
--     re-opened past it; its trigger files one issue with the lever.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS human_actions_autonomy_first_ai; DROP TRIGGER IF EXISTS metric_autonomy_first_au; DROP TRIGGER IF EXISTS metric_autonomy_first_ai; DROP VIEW IF EXISTS v_autonomy_first_audit; DROP VIEW IF EXISTS v_human_action_gate; DELETE FROM metric_registry WHERE metric IN ('owner_queue_fleet_cards_open', 'session_dependent_issues_open'); DELETE FROM analytics_metric_triggers WHERE metric_key IN ('owner_queue_fleet_cards_open', 'session_dependent_issues_open', 'code_task_superseded_share_30d'); DELETE FROM ops_config WHERE key = 'autonomy_first_gate'; UPDATE human_actions SET status = 'open', resolved_at = NULL, resolution = NULL WHERE status = 'rerouted';

INSERT OR IGNORE INTO ops_config (key, value, note, updated_at) VALUES ('autonomy_first_gate', 'on',
  'AUTONOMY-FIRST-1 (migrations/2026-10-08-autonomy-first.sql): on = an owner card that is not irreversible and identity-bound is rerouted to agent_issues for the fleet to decide; off = cards stay in the owner queue as before.',
  datetime('now'));

CREATE VIEW IF NOT EXISTS v_human_action_gate AS
SELECT id, slug, status, source, title,
  CASE
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

-- Backfill (3) before the trigger exists, so each open 'fleet' card is rerouted exactly once.
INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
SELECT 'AUTONOMY-FIRST-REROUTE-1: ' || h.title,
  'AUTONOMY-FIRST-1 (migrations/2026-10-08-autonomy-first.sql): owner card #' || h.id || ' (' || COALESCE(h.slug, '') || ', from '
    || COALESCE(h.source, '?') || ') asked the owner for a decision that is not irreversible and identity-bound, so it is the fleet''s. '
    || 'Decide and execute: pick the best lever in the card''s action text (or a better one), apply it through the canonical path '
    || '(PR, migration, ops_config row), and close this issue with close_evidence naming the lever and a live measurement. '
    || 'Never re-open the card for the owner. Why: ' || COALESCE(h.why, '') || ' Default in effect: ' || COALESCE(h.default_in_effect, '')
    || ' Card action: ' || COALESCE(h.action, '') || ' Charter pillar: autonomy.',
  'autonomy-first-gate', 'governance', CASE h.sev WHEN 'urgent' THEN 'critical' WHEN 'high' THEN 'high' ELSE 'medium' END, 'open',
  CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000
FROM human_actions h JOIN v_human_action_gate g ON g.id = h.id
WHERE h.status = 'open' AND g.gate = 'fleet';

UPDATE human_actions SET status = 'rerouted', resolved_at = datetime('now'), updated_at = datetime('now'),
  resolution = 'AUTONOMY-FIRST-1: not irreversible and identity-bound; the fleet decides it as agent_issues #'
    || COALESCE((SELECT MAX(i.id) FROM agent_issues i WHERE i.source = 'autonomy-first-gate'
                   AND i.title = 'AUTONOMY-FIRST-REROUTE-1: ' || human_actions.title), 0)
WHERE status = 'open' AND id IN (SELECT id FROM v_human_action_gate WHERE gate = 'fleet');

CREATE TRIGGER IF NOT EXISTS human_actions_autonomy_first_ai AFTER INSERT ON human_actions
WHEN NEW.status = 'open'
  AND COALESCE((SELECT value FROM ops_config WHERE key = 'autonomy_first_gate'), 'on') <> 'off'
  AND (SELECT gate FROM v_human_action_gate WHERE id = NEW.id) = 'fleet'
BEGIN
  INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at)
  VALUES ('AUTONOMY-FIRST-REROUTE-1: ' || NEW.title,
    'AUTONOMY-FIRST-1 (migrations/2026-10-08-autonomy-first.sql): owner card #' || NEW.id || ' (' || COALESCE(NEW.slug, '') || ', from '
      || COALESCE(NEW.source, '?') || ') asked the owner for a decision that is not irreversible and identity-bound, so it is the fleet''s. '
      || 'Decide and execute: pick the best lever in the card''s action text (or a better one), apply it through the canonical path '
      || '(PR, migration, ops_config row), and close this issue with close_evidence naming the lever and a live measurement. '
      || 'Never re-open the card for the owner. Why: ' || COALESCE(NEW.why, '') || ' Default in effect: ' || COALESCE(NEW.default_in_effect, '')
      || ' Card action: ' || COALESCE(NEW.action, '') || ' Charter pillar: autonomy.',
    'autonomy-first-gate', 'governance', CASE NEW.sev WHEN 'urgent' THEN 'critical' WHEN 'high' THEN 'high' ELSE 'medium' END, 'open',
    CAST(strftime('%s', 'now') AS INTEGER) * 1000, CAST(strftime('%s', 'now') AS INTEGER) * 1000);
  UPDATE human_actions SET status = 'rerouted', resolved_at = datetime('now'), updated_at = datetime('now'),
    resolution = 'AUTONOMY-FIRST-1: not irreversible and identity-bound; the fleet decides it as agent_issues #'
      || COALESCE((SELECT MAX(i.id) FROM agent_issues i WHERE i.source = 'autonomy-first-gate'
                     AND i.title = 'AUTONOMY-FIRST-REROUTE-1: ' || NEW.title), 0)
  WHERE id = NEW.id;
END;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('owner_queue_fleet_cards_open', 'operational', 'guard',
  'COUNT of human_actions with status open whose v_human_action_gate.gate is fleet: owner cards that ask for a reversible, technical or operational decision (AUTONOMY-FIRST-1).',
  'qnfo-audit.v_human_action_gate (AUTONOMY-FIRST-1, migrations/2026-10-08-autonomy-first.sql), refreshed by D1 triggers metric_autonomy_first_au/_ai on every open_agent_issues write',
  '1 before the gate (card #63), 0 after the backfill', '0', 'qnfo-fleet-control',
  'trigger gt 0 -> one METRIC-TRIGGER issue: gate off or a card re-opened past it', 'hourly', '> 0', '> 2',
  CAST((SELECT COUNT(*) FROM v_human_action_gate WHERE status = 'open' AND gate = 'fleet') AS TEXT), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'MEASURED', 'computed');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'owner_queue_fleet_cards_open', 'Autonomy-first breach: the owner queue holds a card the fleet should decide', 'registry', 'gt', 0, 3,
  'Pillar autonomy (AUTONOMY-FIRST-1). Owner directive 2026-10-08: the only owner interrupt is an action that is both irreversible and identity-bound. Read SELECT id, slug, source, title FROM v_human_action_gate WHERE status = ''open'' AND gate = ''fleet''. For each card: if ops_config autonomy_first_gate is off, say why on this issue and turn it back on unless the reason still holds; if the card was re-opened past the gate, decide it as the fleet (take the best lever in its action text through the canonical path) and set the card rerouted with the issue id. If the card is genuinely irreversible and identity-bound and the classifier misread it, put an IDENTITY-BOUND: line in its why and add the missing keyword to v_human_action_gate by migration. Never dismiss a card to lower the count without doing its work. Definition of done: owner_queue_fleet_cards_open = 0 at a refresh.',
  'qnfo-fleet-control', 'agent_issues', 24, 1, 'AUTONOMY-FIRST-1 (migrations/2026-10-08-autonomy-first.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'owner_queue_fleet_cards_open');

-- (5) Systemwide autonomy-first audit (AUTONOMY-FIRST-AUDIT-1), measured 2026-10-08 by session_01CWLpf5v1NjC9GXbM6rnH4k:
--     owner cards a loop should decide 1 (#63, handled above); open issues whose next step needs a Claude session
--     (a session-task: line, or triage owner session*) 28 of 130, with no metric; code_task_superseded_share_30d 0.29
--     against a target of 0.10 with no trigger (a session redid the loop's work); code_task_success_rate_30d 0.24 and
--     watchmaker_index 1 already have open METRIC-TRIGGER issues. v_autonomy_first_audit is the one-row readout; the two
--     unmeasured gaps get a metric or a trigger here, so the hourly metric tick audits autonomy-first from now on with no
--     session and no claude.ai schedule (NO-CLAUDE-RUNTIME-DEPENDENCY-1).
CREATE VIEW IF NOT EXISTS v_autonomy_first_audit AS
SELECT
  (SELECT COUNT(*) FROM v_human_action_gate WHERE status = 'open' AND gate = 'fleet') AS owner_cards_fleet_open,
  (SELECT COUNT(*) FROM v_human_action_gate WHERE status = 'open' AND gate = 'owner') AS owner_cards_identity_open,
  (SELECT COUNT(*) FROM human_actions WHERE status = 'rerouted' AND resolved_at >= datetime('now', '-7 days')) AS cards_rerouted_7d,
  (SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND (COALESCE(a.description, '') LIKE '%session-task:%'
     OR EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = a.id AND t.owner LIKE 'session%'))) AS session_dependent_issues_open,
  (SELECT COUNT(*) FROM agent_issues WHERE status = 'open') AS open_issues,
  (SELECT last_value FROM metric_registry WHERE metric = 'code_task_success_rate_30d') AS code_task_success_rate_30d,
  (SELECT last_value FROM metric_registry WHERE metric = 'code_task_superseded_share_30d') AS code_task_superseded_share_30d,
  (SELECT last_value FROM metric_registry WHERE metric = 'watchmaker_index') AS watchmaker_index;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, last_value, last_refreshed, state, refresh_class) VALUES
 ('session_dependent_issues_open', 'operational', 'target',
  'v_autonomy_first_audit.session_dependent_issues_open: open agent_issues whose next step needs a Claude session (a session-task: line, or issue_triage.owner session*). AUTONOMY-FIRST-1 and NO-CLAUDE-RUNTIME-DEPENDENCY-1 both want 0.',
  'qnfo-audit.v_autonomy_first_audit (AUTONOMY-FIRST-AUDIT-1, migrations/2026-10-08-autonomy-first.sql), refreshed by D1 triggers metric_autonomy_first_au/_ai on every open_agent_issues write',
  '28 of 130 open issues on 2026-10-08', '0', 'qnfo-code-orchestrator',
  'trigger gt 0 -> one METRIC-TRIGGER issue naming the scope gap that parks the most issues', 'hourly', '> 0', '> 20',
  CAST((SELECT session_dependent_issues_open FROM v_autonomy_first_audit) AS TEXT), strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), 'MEASURED', 'computed');

CREATE TRIGGER IF NOT EXISTS metric_autonomy_first_au AFTER UPDATE ON metric_registry
WHEN NEW.metric = 'open_agent_issues'
BEGIN
  UPDATE metric_registry SET last_value = CAST((SELECT owner_cards_fleet_open FROM v_autonomy_first_audit) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'owner_queue_fleet_cards_open';
  UPDATE metric_registry SET last_value = CAST((SELECT session_dependent_issues_open FROM v_autonomy_first_audit) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'session_dependent_issues_open';
END;

CREATE TRIGGER IF NOT EXISTS metric_autonomy_first_ai AFTER INSERT ON metric_registry
WHEN NEW.metric = 'open_agent_issues'
BEGIN
  UPDATE metric_registry SET last_value = CAST((SELECT owner_cards_fleet_open FROM v_autonomy_first_audit) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'owner_queue_fleet_cards_open';
  UPDATE metric_registry SET last_value = CAST((SELECT session_dependent_issues_open FROM v_autonomy_first_audit) AS TEXT),
      last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED'
  WHERE metric = 'session_dependent_issues_open';
END;

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'session_dependent_issues_open', 'Autonomy-first gap: open issues still wait on a Claude session', 'registry', 'gt', 0, 3,
  'Pillar autonomy (AUTONOMY-FIRST-AUDIT-1). Read the issues: SELECT a.id, a.title, t.owner FROM agent_issues a LEFT JOIN issue_triage t ON t.issue_id = a.id WHERE a.status = ''open'' AND (a.description LIKE ''%session-task:%'' OR t.owner LIKE ''session%''). Group them by why the code loop refused them (control-plane worker, scripts/ path, several files, file size, untrusted source, governance). Lever, in order: (1) an issue whose change is one file the loop may edit gets a code-task: and code-anchor: line in place of its session-task line; (2) the group that parks the most issues gets its scope gap closed in qnfo-code-orchestrator (MULTI-FILE-CODE-TASKS-1 #2074, SCOPE-SCRIPTS-1 #2101 are the open ones; file the next if the top group has none); (3) an issue that only states a decision gets the decision taken and recorded on the issue (AUTONOMY-FIRST-1); an irreversible identity-bound step becomes a human_actions card with its default in effect. Never close an issue without its work to lower the count. Definition of done: session_dependent_issues_open lower than at filing at two refreshes 24 hours apart, then 0.',
  'qnfo-code-orchestrator', 'agent_issues', 168, 1, 'AUTONOMY-FIRST-AUDIT-1 (migrations/2026-10-08-autonomy-first.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'session_dependent_issues_open');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'code_task_superseded_share_30d', 'Autonomy-first gap: sessions redo work the code loop already has in flight', 'registry', 'gt', 0.10, 4,
  'Pillar autonomy (AUTONOMY-FIRST-AUDIT-1). code_task_superseded_share_30d read 0.29 on 2026-10-08 against a target of 0.10 and had no trigger: almost a third of code tasks were closed because a session shipped the same change. Read SELECT id, issue_id, merge_note FROM code_tasks WHERE status = ''closed'' AND merge_note LIKE ''superseded%'' AND updated_at >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 days''). For each, find whether the task held its WORK-CLAIM-1 claim when the session started (GET https://qnfo-deploy-guard.q08.workers.dev/work-locks history in work_claims). Lever: (1) when the task held no claim, fix the gap in CLAIMS-FIRST-1 (qnfo-code-orchestrator); (2) when it did and the session wrote anyway, make the deploy-guard /work-lock/acquire answer name the in-flight task in its refusal text and add the session to the reviewers instead; (3) when the loop task was stale (retries after failing checks), let the session task take it over and close the loop task as superseded at claim time, not after a duplicate PR. Definition of done: code_task_superseded_share_30d <= 0.10 at a refresh.',
  'qnfo-code-orchestrator', 'agent_issues', 168, 1, 'AUTONOMY-FIRST-AUDIT-1 (migrations/2026-10-08-autonomy-first.sql)'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers x WHERE x.metric_key = 'code_task_superseded_share_30d');
