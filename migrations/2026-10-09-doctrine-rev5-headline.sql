-- DOCTRINE-HEADLINE-1 (2026-10-09, pillar autonomy). The owner's doctrine text of 2026-10-09 (the restructured revision with
-- Parts I-V; adopted as revision 5 by session_01FV1AbyS259scB15jYHP9Fo) names three scorecard lines in section 24 that no
-- metric measured: tick completion, initiation rate ("the headline metric") and dispatch by the user ("the user number is 0").
-- Measured 2026-10-09 09:55Z:
--   tick_completion_24h  100.0  (106 of 107 ten-minute slots since fleet_tick began carry a heartbeat; two feeders,
--                                qnfo-code-orchestrator */10 and qnfo-fleet-dashboard */15, each skip a slot already filled)
--   initiation_rate_7d    46.8  (191 of 408 agent_issues of 7 days were filed by a loop, worker or CI job; 217 came from a
--                                session, a chat, an owner request or an intent, which all start from an instruction)
--   owner_dispatch_7d     25    (human_actions opened in 7 days that v_human_action_gate leaves with the owner)
-- Definitions are proxies and say so: initiation counts work items by the label of whoever filed them, not decisions; a
-- loop label containing "owner" or "session" is counted as instructed. owner_dispatch counts cards routed to the owner,
-- including those he dismissed (each one still asked him).
-- Thresholds: tick_completion lt 95 (target 100, a regression guard); initiation lt 40 (baseline 46.8, target >= 75; a
-- regression guard, because the lever that raises it, loops filing work sessions file today, is broad); owner_dispatch gt 5
-- (baseline 25, target 0, in breach at birth with a concrete lever).
-- Idempotent: CREATE ... IF NOT EXISTS, INSERT OR IGNORE, guarded INSERT, UPDATE. No DELETE or DROP outside the rollback.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS doctrine_headline_tick; DELETE FROM analytics_metric_triggers WHERE metric_key IN ('tick_completion_24h', 'initiation_rate_7d', 'owner_dispatch_7d'); DELETE FROM metric_registry WHERE metric IN ('tick_completion_24h', 'initiation_rate_7d', 'owner_dispatch_7d'); DROP VIEW IF EXISTS v_doctrine_headline; DROP VIEW IF EXISTS v_issue_initiation;

CREATE VIEW IF NOT EXISTS v_issue_initiation AS
SELECT id, source, created_at,
  CASE WHEN COALESCE(source, '') = ''
         OR instr(lower(source), 'session') > 0 OR instr(lower(source), 'claude') > 0
         OR lower(source) LIKE 'chat%' OR instr(lower(source), 'owner') > 0
         OR instr(lower(source), 'intent') > 0 OR instr(lower(source), 'human') > 0
       THEN 0 ELSE 1 END AS self_initiated
FROM agent_issues;

CREATE VIEW IF NOT EXISTS v_doctrine_headline AS
SELECT
  (SELECT ROUND(100.0 * COUNT(DISTINCT substr(ts, 1, 15))
            / MAX(1, CAST((julianday('now') - julianday(MAX(strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'), (SELECT MIN(ts) FROM fleet_tick)))) * 144 AS INTEGER)), 1)
     FROM fleet_tick
     WHERE ts >= MAX(strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-24 hours'), (SELECT MIN(ts) FROM fleet_tick))) AS tick_completion_24h,
  (SELECT ROUND(100.0 * SUM(self_initiated) / MAX(1, COUNT(*)), 1)
     FROM v_issue_initiation
     WHERE created_at >= CAST(strftime('%s', 'now', '-7 days') AS INTEGER) * 1000) AS initiation_rate_7d,
  (SELECT COUNT(*) FROM human_actions h JOIN v_human_action_gate g ON g.id = h.id
     WHERE g.gate = 'owner' AND h.created_at >= datetime('now', '-7 days')) AS owner_dispatch_7d;

INSERT OR IGNORE INTO metric_registry (metric, layer, kind, formula, source_of_truth, baseline, target, owner, disposition_actor, refresh_cadence, warning_band, kill_band, state, refresh_class) VALUES
 ('tick_completion_24h', 'system', 'guard', '100 * distinct ten-minute slots with a fleet_tick row / ten-minute slots elapsed, over the last 24h (or since the first tick); doctrine section 24 tick completion, section 1 step 11', 'qnfo-audit.fleet_tick (v_doctrine_headline)', '100.0 on 2026-10-09', '100', 'qnfo-fleet-control', 'its own trigger: restore the missing heartbeat feeder', '10m', '< 98', '< 95', 'UNMEASURED', 'computed'),
 ('initiation_rate_7d', 'system', 'leading', '100 * agent_issues of 7 days filed by a loop, worker or CI job / all agent_issues of 7 days (v_issue_initiation: a session, chat, owner, intent or human label counts as instructed); doctrine section 24 headline, proxy by filer label', 'qnfo-audit.agent_issues (v_issue_initiation, v_doctrine_headline)', '46.8 on 2026-10-09 (191 of 408)', '>= 75', 'qnfo-fleet-control', 'its own trigger: move a recurring session-filed issue class into a loop', '10m', '< 45', '< 40', 'UNMEASURED', 'computed'),
 ('owner_dispatch_7d', 'system', 'lagging', 'human_actions opened in 7 days that v_human_action_gate leaves with the owner (gate owner), whatever their later status; doctrine section 24 dispatch rate (the user number is 0)', 'qnfo-audit.human_actions + v_human_action_gate (v_doctrine_headline)', '25 on 2026-10-09', '0', 'qnfo-fleet-control', 'its own trigger: reroute or automate the card class', '10m', '> 2', '> 5', 'UNMEASURED', 'computed');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'tick_completion_24h', 'Heartbeat gap: under 95% of ten-minute slots in 24h carry a fleet tick', 'registry', 'lt', 95, 8,
  'Pillar core. A missing fleet_tick slot means every AFTER INSERT ON fleet_tick trigger (doctrine scorecard, SLA ladder, reconcile, WIP self-tune) skipped that slot. Check: SELECT source, MAX(ts) FROM fleet_tick GROUP BY source; the feeders are qnfo-code-orchestrator (*/10, worker.js INSERT INTO fleet_tick) and qnfo-fleet-dashboard (*/15). A feeder whose MAX(ts) is over 20 min old has a stalled cron: read its /health and Workers Logs and redeploy through the canonical path. Definition of done: tick_completion_24h >= 95 in metric_registry, before and after values in issue_triage.close_evidence.',
  'qnfo-fleet-control', 'agent_issues', 24, 1, 'DOCTRINE-HEADLINE-1 2026-10-09'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'tick_completion_24h');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'initiation_rate_7d', 'Initiation regression: under 40% of new work items were filed by the fleet itself', 'registry', 'lt', 40, 6,
  'Pillar autonomy. Run: SELECT source, COUNT(*) FROM v_issue_initiation WHERE self_initiated = 0 AND created_at >= CAST(strftime(''%s'', ''now'', ''-7 days'') AS INTEGER) * 1000 GROUP BY source ORDER BY 2 DESC. Take the largest instructed class whose issues a loop could have detected (a metric, a probe, a log signature) and give that loop the detector, so the next such issue is filed by the loop. Do not relabel sources to move this number. Definition of done: initiation_rate_7d >= 40, with the detector named in issue_triage.close_evidence.',
  'qnfo-fleet-control', 'agent_issues', 24, 1, 'DOCTRINE-HEADLINE-1 2026-10-09'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'initiation_rate_7d');

INSERT INTO analytics_metric_triggers (metric_key, title, source_table, operator, threshold, priority, action, owner, queue_target, cooldown_hours, enabled, notes)
SELECT 'owner_dispatch_7d', 'Owner dispatch: more than 5 cards in 7 days asked the owner to act', 'registry', 'gt', 5, 7,
  'Pillar autonomy. Run: SELECT h.slug, h.status, substr(h.title, 1, 80) FROM human_actions h JOIN v_human_action_gate g ON g.id = h.id WHERE g.gate = ''owner'' AND h.created_at >= datetime(''now'', ''-7 days''). For each card class: if it is not identity-bound (doctrine section 6: irreversible and identity-bound with no reversible path), give a loop the step and stop filing the card; if it is, it must carry an IDENTITY-BOUND line with its default in effect. Never dismiss a card to lower this number: dismissed cards still count for 7 days. Definition of done: owner_dispatch_7d <= 5, then 0.',
  'qnfo-fleet-control', 'agent_issues', 24, 1, 'DOCTRINE-HEADLINE-1 2026-10-09'
WHERE NOT EXISTS (SELECT 1 FROM analytics_metric_triggers WHERE metric_key = 'owner_dispatch_7d');

CREATE TRIGGER IF NOT EXISTS doctrine_headline_tick AFTER INSERT ON fleet_tick
BEGIN
  UPDATE metric_registry SET last_value = CAST((SELECT tick_completion_24h FROM v_doctrine_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'tick_completion_24h';
  UPDATE metric_registry SET last_value = CAST((SELECT initiation_rate_7d FROM v_doctrine_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'initiation_rate_7d';
  UPDATE metric_registry SET last_value = CAST((SELECT owner_dispatch_7d FROM v_doctrine_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'owner_dispatch_7d';
END;

UPDATE metric_registry SET last_value = CAST((SELECT tick_completion_24h FROM v_doctrine_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'tick_completion_24h';
UPDATE metric_registry SET last_value = CAST((SELECT initiation_rate_7d FROM v_doctrine_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'initiation_rate_7d';
UPDATE metric_registry SET last_value = CAST((SELECT owner_dispatch_7d FROM v_doctrine_headline) AS TEXT), last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED' WHERE metric = 'owner_dispatch_7d';
