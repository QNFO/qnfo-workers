-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS closed_loop_tick; DROP VIEW IF EXISTS v_human_wait_states; DELETE FROM analytics_metric_triggers WHERE metric_key = 'human_wait_states' AND notes = 'CLOSED-LOOP-1 2026-11-12'; DELETE FROM metric_breach_cause WHERE metric_key = 'human_wait_states'; DELETE FROM metric_registry WHERE metric = 'human_wait_states'; DELETE FROM ops_config WHERE key IN ('OWNER_DIRECTIVE_2026_11_12_CLOSED_LOOP_1', 'closed_loop_policy');
-- spof-review: one view, one measuring trigger on the fleet_tick heartbeat, one metric with its trigger, two ops_config rows. Measurement only:
-- a stopped trigger delays detection of a wait on a person; it never stops a loop. No new cron, binding, host or credential.
-- CAUSE-MAPPED: human_wait_states maps to the existing cause key `issue-backlog` in this same file.
--
-- CLOSED-LOOP-1 (owner, 2026-11-12, charter pillar autonomy): "Never assume that an external ... you need to close all of your own code loops
-- and never assume that anything is needed externally ... documents and memories are useless ... Everything must be translated into something
-- that can be executed by code ... Don't ever assume that anything will ever be reviewed ... All of your loops must be closed by you."
-- A human-wait state is any open item that parks work for a person to read, review, approve or decide. Only a credential, money, a legal
-- signature or the owner's own account may wait on the owner, as a card with an IDENTITY-BOUND: line and a stated default the loop runs on.
-- v_human_wait_states lists every other wait; human_wait_states counts it (target 0) and its trigger hands each one to the fleet.

INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('OWNER_DIRECTIVE_2026_11_12_CLOSED_LOOP_1',
  'Never assume that an external, you need to close all of your own code loops and never assume that anything is needed externally. Documents and memories are useless. Everything must be translated into something that can be executed by code. Don''t ever assume that anything will ever be reviewed. All of your loops must be closed by you.',
  'CLOSED-LOOP-1 (migrations/2026-11-12-closed-loop-1.sql): v_human_wait_states, metric human_wait_states, scripts/closed_loop_guard.py on every PR, scripts/doc_audit.py for orphan documents, Ultrastable foundation closedloop.');
INSERT OR IGNORE INTO ops_config (key, value, note) VALUES ('closed_loop_policy',
  '{"assume_human_reader":false,"assume_human_review":false,"assume_owner_decision":false,"assume_external_input":false,"memory_or_document_is_storage":false,"wait_on_person_allowed_only_for":["credential","money","legal_signature","owner_account"],"wait_requires_default_in_effect":true,"loop_proceeds_on_default_while_waiting":true}',
  'CLOSED-LOOP-1 policy values, read by v_human_wait_states (classes) and the guards; same values as ultrastable doctrine/closed-loop.json.');

CREATE VIEW IF NOT EXISTS v_human_wait_states AS
  SELECT 'human_actions' AS source, CAST(id AS TEXT) AS ref, title, 'card waits on the owner without an IDENTITY-BOUND: line' AS why, created_at
  FROM human_actions
  WHERE status NOT IN ('done', 'resolved', 'rerouted', 'dismissed', 'closed') AND COALESCE(why, '') NOT LIKE '%IDENTITY-BOUND:%'
  UNION ALL
  SELECT 'human_actions', CAST(id AS TEXT), title, 'identity-bound card states no default the loop runs on', created_at
  FROM human_actions
  WHERE status NOT IN ('done', 'resolved', 'rerouted', 'dismissed', 'closed') AND COALESCE(why, '') LIKE '%IDENTITY-BOUND:%'
    AND COALESCE(default_in_effect, '') = '' AND lower(COALESCE(why, '')) NOT LIKE '%default%'
  UNION ALL
  SELECT 'agent_issues', CAST(id AS TEXT), title, 'issue parks work on a person (review, decision or approval)', created_at
  FROM agent_issues
  WHERE status = 'open' AND COALESCE(description, '') NOT LIKE '%IDENTITY-BOUND:%' AND (
    lower(description) LIKE '%owner decides%' OR lower(description) LIKE '%owner decision%' OR lower(description) LIKE '%awaiting review%'
    OR lower(description) LIKE '%awaiting approval%' OR lower(description) LIKE '%human review%' OR lower(description) LIKE '%waiting on the owner%'
    OR lower(description) LIKE '%needs owner approval%' OR lower(description) LIKE '%manual review%');

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('human_wait_states', 'system', 'guard', 'COUNT(*) FROM v_human_wait_states: open cards and issues that park work on a person without an identity-bound class and a default (CLOSED-LOOP-1)', 'qnfo-audit.v_human_wait_states over human_actions and agent_issues', '2 on 2026-11-12 (agent_issues 1000140 and 1000341 name an owner decision or review)', '= 0', 'qnfo-fleet-control', 'analytics_metric_triggers human_wait_states', '1h', '> 0', '> 10', 'UNMEASURED', 'd1-trigger');

INSERT OR IGNORE INTO metric_breach_cause (metric_key, cause_key, note) VALUES
 ('human_wait_states', 'issue-backlog', 'CLOSED-LOOP-1: open items that wait on a person instead of closing by the system');

CREATE TRIGGER IF NOT EXISTS closed_loop_tick AFTER INSERT ON fleet_tick
WHEN strftime('%M', 'now') < '10'
BEGIN
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
    last_value = CAST((SELECT COUNT(*) FROM v_human_wait_states) AS TEXT)
  WHERE metric = 'human_wait_states';
END;

UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
  last_value = CAST((SELECT COUNT(*) FROM v_human_wait_states) AS TEXT)
WHERE metric = 'human_wait_states';

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'human_wait_states', 'CLOSED-LOOP-1: work waits on a person instead of closing by the system', 'registry', 'gt', 0, 2,
  'Pillar autonomy. Read SELECT * FROM v_human_wait_states. For each row decide as the fleet and execute: an issue that names an owner decision or review takes the recommended option (DECISION-AUTOPROCEED-1), states it in one line and proceeds through the canonical path with its probe; a card without an IDENTITY-BOUND: line is rerouted to agent_issues (AUTONOMY-FIRST-1) and done by the fleet; an identity-bound card gets its default written into its why so the loop runs on it. Rewrite the producer that created the wait so it no longer does. Never dismiss a row to lower the count without doing its work. Definition of done: human_wait_states = 0 at a refresh; record before and after in issue_triage.close_evidence.',
  'qnfo-fleet-control', 'agent_issues', 6, 1, 'CLOSED-LOOP-1 2026-11-12'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'human_wait_states' AND enabled = 1);
