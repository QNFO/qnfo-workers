-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: bak_20261019_owner_queue_triggers
-- Rollback: DELETE FROM control_registry WHERE control = 'owner-request-requires-card'; DELETE FROM remediation_contracts WHERE class = 'fm-owner-queue-objects-outside-repo'; DELETE FROM failure_modes WHERE fm_key = 'owner-queue-objects-outside-repo'; DELETE FROM queue_sla WHERE stuck_type = 'autonomy-reroute-undrained'; DROP VIEW IF EXISTS v_stuck_summary_kernel; CREATE VIEW v_stuck_summary_kernel AS SELECT (SELECT COUNT(*) FROM decision_predictions WHERE scored_at IS NULL AND due_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS predictions_unscored_over_sla, (SELECT COUNT(*) FROM doctrine_proposals WHERE status = 'proposed' AND ts < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS doctrine_proposals_waiting, (SELECT COUNT(*) FROM tick_runs WHERE ok = 0 AND tick_id = (SELECT MAX(tick_id) FROM tick_runs)) AS tick_steps_missed_last_slot
-- Rollback scope: it removes the registry rows this file adds and the queue_sla row, and restores the kernel view to its three live columns. It does not undo the closure trigger, the queue table, the drain task or the cron row, because each of them ran live before this file; the two trigger definitions as they were are in bak_20261019_owner_queue_triggers, which the Rollback line does not read.
-- spof-review: none added; the objects below already run live, this file only versions them (their text is the live text, whitespace aside, so no live behaviour moves). The drain's second path is SELF-AUDIT-SYSTEMWIDE-1 (SELF-AUDIT-CRONSTALE files an issue when this sub-daily cron has not fired for 3 hours).
--
-- OWNER-QUEUE-VERSIONED-1 (2026-10-19, pillar autonomy; agent_issues 2783, 2865, 2900, 2933, 99956, 100023 = QNFO/qnfo-workers#1696-1712, #1732,
-- #1880, #1927, #2402, #2585). Builds on OWNER-NOTICE-GATE-1 (migrations/2026-10-19-owner-notice-gate.sql, PR 2650).
-- WHAT IS ALREADY DONE (not repeated here)
-- OWNER-NOTICE-GATE-1 made v_human_action_gate read a card of source 'owner-request-issue' as 'notice' (unless it carries an IDENTITY-BOUND:
-- line), so the closure notices of the owner's own requests are counted by neither owner_queue_fleet_cards_open (gate fleet) nor
-- owner_dispatch_7d / autonomy_rate_7d (gate owner). The notices stay OPEN on fleet.qnfo.org: the owner keeps the review of them, and a
-- later attempt to post them pre-resolved was refused; that refusal stands. This file does not close, resolve or re-grade any card and does
-- not touch v_human_action_gate or the text of owner_request_requires_card.
-- WHAT IS LEFT, AND WHAT THIS FILE DOES
-- Four objects of the owner-queue path were created in D1 outside the repo and are in no file of main:
--   * trigger owner_request_requires_card (2026-10-17 closeout: "an owner request cannot close without a human_actions card"),
--   * table autonomy_reroute_queue and trigger human_actions_autonomy_first_ai in their QUEUE-BREAK-CYCLE-1 form (it writes the queue and
--     never agent_issues, because a static agent_issues <-> human_actions trigger cycle once made every agent_issues INSERT fail with
--     "nested too deep", agent_issues 99919 TRIGGER-CYCLE-INTAKE-DEAD-1), and its skip of source 'owner-request-issue',
--   * fleet_tasks autonomy-reroute-drain, which moves the queue into agent_issues, and the fleet_crons row autonomy-reroute-drain-10m
--     (id 55, */10 * * * *, UTC) that runs it; without the row a rebuilt database fills the queue and never drains it (a card is marked
--     rerouted, leaves the owner queue and no agent_issues row follows). Added in the second review, 2026-10-19.
-- A database rebuilt from migrations/ therefore got the cyclic 2026-10-08 form of human_actions_autonomy_first_ai and no closure trigger.
-- This file puts the live text under version control. On production it is a no-op in behaviour: owner_request_requires_card is created only
-- if absent (IF NOT EXISTS), the autonomy trigger is dropped and created again with the same text (same text modulo whitespace for the
-- closure trigger, which is one line live; exact for the autonomy trigger and the table; DROP then CREATE leaves a window of a few
-- statements, inside one migration run, in which a human_actions insert would skip the reroute), the table, the task and the cron row exist already.
-- QUEUE-SLA-1: autonomy_reroute_queue holds items between a card leaving the owner queue and an agent_issues row existing, so it gets a
-- queue_sla row (autonomy-reroute-undrained, 10-minute cycle, SLA 120 minutes, automatic fix = the cron's drain statements) and the column
-- reroute_queue_undrained_over_sla in v_stuck_summary_kernel (the live view text read 2026-10-19 plus that one column; v_sla_over_120m reads
-- the view with vsla_k.*, so the column reaches it without a change there; like code_tasks_unpublished_120m it is not added to total_over_120m).
-- The canary of the migration runner (D1-TRIGGER-DEPTH-1) compiles the trigger graph after each CREATE TRIGGER and restores the previous
-- definitions if it is refused. bak_20261019_owner_queue_triggers keeps the two trigger definitions and the kernel view as they were before this file.
-- Registries: control_registry (the closure guard, disposition keep), failure_modes + the fm-owner-queue-objects-outside-repo detector, and a
-- decision_log row. The 7 open owner-request-issue cards (103-108, 112 at 2026-10-19) are left open on purpose; see the decision_log row.

CREATE TABLE IF NOT EXISTS bak_20261019_owner_queue_triggers AS
  SELECT name, type, sql, strftime('%Y-%m-%dT%H:%M:%SZ', 'now') AS saved_at
    FROM sqlite_master
   WHERE (type = 'trigger' AND name IN ('owner_request_requires_card', 'human_actions_autonomy_first_ai'))
      OR (type = 'view' AND name = 'v_stuck_summary_kernel');

-- the closure guard as live (same text modulo whitespace; open card, source owner-request-issue); created only when a rebuilt database lacks it
CREATE TRIGGER IF NOT EXISTS owner_request_requires_card BEFORE UPDATE OF status ON agent_issues
WHEN NEW.category = 'owner-request' AND NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix')
  AND NOT EXISTS (SELECT 1 FROM human_actions h WHERE h.slug = 'issue-' || NEW.id)
BEGIN
  INSERT INTO human_actions (slug, title, why, default_in_effect, action, url, sev, status, source, created_at, updated_at)
  VALUES ('issue-' || NEW.id,
    substr(REPLACE(REPLACE(REPLACE(NEW.title,'Claude','owner agent'),'claude','owner agent'),'CLAUDE','OWNER AGENT'),1,120),
    substr(REPLACE(REPLACE(REPLACE(COALESCE(NEW.description,''),'Claude','owner agent'),'claude','owner agent'),'CLAUDE','OWNER AGENT'),1,400),
    '', 'Open fleet.qnfo.org and decide or dismiss this card.', 'https://fleet.qnfo.org/content', 'normal', 'open', 'owner-request-issue',
    strftime('%Y-%m-%dT%H:%M:%SZ','now'), strftime('%Y-%m-%dT%H:%M:%SZ','now'));
END;

-- the reroute path as live (QUEUE-BREAK-CYCLE-1; exact text)
CREATE TABLE IF NOT EXISTS autonomy_reroute_queue (id INTEGER PRIMARY KEY AUTOINCREMENT, human_action_id INTEGER NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, category TEXT, priority TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), drained_at TEXT, issue_id INTEGER);

DROP TRIGGER IF EXISTS human_actions_autonomy_first_ai;
CREATE TRIGGER human_actions_autonomy_first_ai AFTER INSERT ON human_actions
WHEN NEW.status = 'open'
  AND COALESCE((SELECT value FROM ops_config WHERE key = 'autonomy_first_gate'), 'on') <> 'off'
  AND (SELECT gate FROM v_human_action_gate WHERE id = NEW.id) = 'fleet'
  AND COALESCE(NEW.source, '') <> 'owner-request-issue'
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

INSERT OR IGNORE INTO fleet_tasks (id, name, type, definition, timeout_ms, retries, version, enabled, updated_at)
VALUES ('autonomy-reroute-drain', 'Autonomy reroute queue drain', 'workflow',
  '{"steps":[{"type":"sql","db":"AUDIT","sql":"INSERT INTO agent_issues (title, description, source, category, priority, status, created_at, updated_at) SELECT q.title, q.description, ''autonomy-first-gate'', COALESCE(q.category,''governance''), COALESCE(q.priority,''medium''), ''open'', CAST(strftime(''%s'',''now'') AS INTEGER) * 1000, CAST(strftime(''%s'',''now'') AS INTEGER) * 1000 FROM autonomy_reroute_queue q WHERE q.drained_at IS NULL"},{"type":"sql","db":"AUDIT","sql":"UPDATE autonomy_reroute_queue SET drained_at = datetime(''now''), issue_id = (SELECT a.id FROM agent_issues a WHERE a.title = autonomy_reroute_queue.title LIMIT 1) WHERE drained_at IS NULL AND EXISTS (SELECT 1 FROM agent_issues a WHERE a.title = autonomy_reroute_queue.title)"}]}',
  60000, 1, 1, 1, '2026-10-18 14:08:17');

-- the cron that runs the drain task, as live (fleet_crons id 55, read 2026-10-19; pattern of migrations/2026-09-29-self-audit-systemwide.sql).
-- next_fire stays NULL on a rebuilt database: fleet-exec fires a NULL next_fire at its next tick and then sets it. A row that exists under
-- the name or for the task is kept as the operator left it.
INSERT INTO fleet_crons (name, cron_expr, task_id, enabled, timezone, updated_at)
  SELECT 'autonomy-reroute-drain-10m', '*/10 * * * *', 'autonomy-reroute-drain', 1, 'UTC', datetime('now')
  WHERE NOT EXISTS (SELECT 1 FROM fleet_crons WHERE name = 'autonomy-reroute-drain-10m' OR task_id = 'autonomy-reroute-drain');

-- QUEUE-SLA-1: the queue's own row and stuck column. The automatic fix is the cron above, which runs the two statements of the drain task
-- every 10 minutes; if that cron stops, SELF-AUDIT-SYSTEMWIDE-1 files SELF-AUDIT-CRONSTALE within 3 hours and this column reads above 0
-- from 120 minutes on, which v_sla_over_120m shows next to the other queues.
INSERT OR IGNORE INTO queue_sla (stuck_type, queue, definition, cycle_min, sla_min, auto_fix, owner, summary_column, producer_cycle_min) VALUES
  ('autonomy-reroute-undrained', 'autonomy_reroute_queue',
   'a card the autonomy-first gate rerouted (human_actions status rerouted) whose queue row has no drained_at 120 min after it was written, so no agent_issues row exists for the fleet to act on',
   10, 120,
   'fleet_crons autonomy-reroute-drain-10m (every 10 min) runs the fleet task autonomy-reroute-drain: INSERT INTO agent_issues for every queue row with drained_at NULL, then UPDATE autonomy_reroute_queue to set drained_at and issue_id (revert: UPDATE autonomy_reroute_queue SET drained_at = NULL, issue_id = NULL WHERE id = <row>; the filed issue stays open for the fleet)',
   'qnfo-fleet-control', 'v_stuck_summary_kernel.reroute_queue_undrained_over_sla', 10);

DROP VIEW IF EXISTS v_stuck_summary_kernel;
CREATE VIEW v_stuck_summary_kernel AS
SELECT
  (SELECT COUNT(*) FROM decision_predictions WHERE scored_at IS NULL AND due_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS predictions_unscored_over_sla,
  (SELECT COUNT(*) FROM doctrine_proposals WHERE status = 'proposed' AND ts < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes')) AS doctrine_proposals_waiting,
  (SELECT COUNT(*) FROM tick_runs WHERE ok = 0 AND tick_id = (SELECT MAX(tick_id) FROM tick_runs)) AS tick_steps_missed_last_slot,
  (SELECT COUNT(*) FROM autonomy_reroute_queue WHERE drained_at IS NULL AND datetime(created_at) < datetime('now', '-120 minutes')) AS reroute_queue_undrained_over_sla;

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id) VALUES
 ('owner-request-requires-card', 'qnfo-audit D1 trigger owner_request_requires_card (agent_issues, BEFORE UPDATE OF status; versioned by migrations/2026-10-19-owner-queue-triggers-versioned.sql)', 'guard',
  'an owner-request issue closing without any record the owner can find (2026-10-17 closeout: "an owner request cannot close without a human_actions card")',
  0, 'keep', 'applied',
  'the closure is also recorded in issue_lifecycle and issue_triage.close_evidence, which do not depend on the trigger; the card is the owner''s review of a closed request and is graded notice by v_human_action_gate (OWNER-NOTICE-GATE-1), so no alarm metric counts it',
  NULL,
  'kept as live: the owner keeps the review of these notices on fleet.qnfo.org, and an attempt to post them pre-resolved was refused (OWNER-NOTICE-GATE-1 header). Its first form made the gate send 17 of them back to the fleet as duplicate issues on 2026-10-17; the reroute skip by source and the notice gate stopped that. migrations/owner-request-notice.test.mjs checks the notice grade and the open card.',
  NULL);

INSERT OR IGNORE INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
VALUES ('owner-queue-objects-outside-repo',
  'objects of the owner-queue path live only in D1, so a database rebuilt from migrations/ gets the cyclic agent_issues <-> human_actions trigger form and no closure trigger, drain task, drain cron or queue table',
  'owner_request_requires_card, autonomy_reroute_queue, the QUEUE-BREAK-CYCLE-1 form of human_actions_autonomy_first_ai, the fleet task autonomy-reroute-drain and its fleet_crons row were created by chat sessions directly in D1 (2026-10-17/18) and in no migration',
  'OWNER-QUEUE-VERSIONED-1 (migrations/2026-10-19-owner-queue-triggers-versioned.sql): the live text is in the repo; offline suite migrations/owner-request-notice.test.mjs rebuilds from the 2026-10-08 form and checks the trigger graph is acyclic',
  'the live autonomy trigger writes autonomy_reroute_queue and never agent_issues, the closure trigger, queue table, drain task and the enabled cron that runs it exist, and no open owner-request-issue card grades fleet (an IDENTITY-BOUND notice grades owner on purpose; fm-owner-notice-counted-as-dispatch grades that)',
  'fm-owner-queue-objects-outside-repo', '2026-10-19', 2783,
  'a database is rebuilt from migrations/, or a chat session amends one of these objects in D1 again',
  'rebuilt database: every agent_issues INSERT fails with "nested too deep" (agent_issues 99919); live: the owner-request notices were graded fleet and counted as dispatch until OWNER-NOTICE-GATE-1',
  'every writer of agent_issues, the owner queue and its alarm metrics');

INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module, budget_ms, max_items, requires_container, next_due_at)
VALUES ('fm-owner-queue-objects-outside-repo', NULL, 'OWNER-QUEUE-VERSIONED-1', 'failure-mode detector',
  'SELECT ''1'' AS expected, CASE WHEN EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''trigger'' AND name = ''human_actions_autonomy_first_ai'' AND sql LIKE ''%autonomy_reroute_queue%'' AND sql NOT LIKE ''%INTO agent_issues%'') AND EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''trigger'' AND name = ''owner_request_requires_card'') AND EXISTS (SELECT 1 FROM sqlite_master WHERE type = ''table'' AND name = ''autonomy_reroute_queue'') AND EXISTS (SELECT 1 FROM fleet_tasks WHERE id = ''autonomy-reroute-drain'') AND EXISTS (SELECT 1 FROM fleet_crons WHERE task_id = ''autonomy-reroute-drain'' AND enabled = 1) AND NOT EXISTS (SELECT 1 FROM v_human_action_gate WHERE COALESCE(source, '''') = ''owner-request-issue'' AND gate = ''fleet'' AND status = ''open'') THEN ''1'' ELSE ''0'' END AS observed',
  'd1-query', 3, 'qnfo-fleet-control', 1, 'active', 'failure-mode', 45000, 5, 0, datetime('now'));

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01QpQv19uh1padRwZ3u1r766',
  'the owner keeps the review of the closure notices of their own requests (OWNER-NOTICE-GATE-1: a later attempt to post them pre-resolved was refused and that refusal stands), so the open notices stay open and only the objects that lived outside the repo are versioned',
  'OWNER-QUEUE-VERSIONED-1: owner_request_requires_card, autonomy_reroute_queue, human_actions_autonomy_first_ai fleet task autonomy-reroute-drain and its fleet_crons row are put under version control with their live text, and the queue gets its queue_sla row and kernel-view column; no card is closed or re-graded; the 7 open owner-request-issue cards (103-108, 112) stay open for the owner as notices',
  'd1 qnfo-audit 2026-10-19: the 7 cards are open and grade notice in v_human_action_gate; sqlite_master holds the four objects, which no migration of main creates in this form',
  'migration merged', 'sqlite_master text (the live text, whitespace aside), one queue_sla row and one added column in v_stuck_summary_kernel; no card row, no gate view, no threshold, no worker',
  'the Rollback header removes the registry rows and the queue_sla row and restores the three-column kernel view; bak_20261019_owner_queue_triggers holds the two trigger definitions and the view as they were',
  'a database rebuilt from migrations/ matches production, so the cyclic trigger form of agent_issues 99919 cannot come back through a rebuild',
  'within 60 minutes the fm detector reads observed 1; no live behaviour or metric moves',
  'none', 'd1:qnfo-audit sqlite_master, human_actions, v_human_action_gate, fleet_tasks, fleet_crons, queue_sla (SELECT only); offline node:sqlite suite migrations/owner-request-notice.test.mjs'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'OWNER-QUEUE-VERSIONED-1:') = 1);
