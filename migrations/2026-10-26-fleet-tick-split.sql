-- FLEET-TICK-SPLIT-1 (2026-10-26, charter pillar autonomy; fixes the outage BREACH-SELFHEAL-1, PR 4263, caused).
-- What happened: migrations/2026-10-26-breach-selfheal.sql added breach_selfheal_tick as the 53rd AFTER INSERT trigger on fleet_tick.
-- It read v_breach_selfheal about twelve times inside the one statement that fires every tick trigger, and from 04:42Z that statement
-- failed with "out of memory: SQLITE_NOMEM": no fleet_tick row landed from 04:32:44Z until 06:12Z, so none of the 52 other 10-minute
-- fixers ran (audits_stale caught it as fleet_tick 93 minutes old). Proven at 06:12Z: INSERT INTO fleet_tick failed with SQLITE_NOMEM,
-- the session dropped breach_selfheal_tick by hand, and the same INSERT then succeeded (5.1 s, 1.16M rows read, 532 changes).
-- Fix: a heavy step gets its own statement. fleet_tick_heavy is a second heartbeat table; qnfo-code-orchestrator 0.28.0 inserts it as a
-- separate statement right after fleet_tick (9-minute guard), so a heavy trigger here can fail without taking fleet_tick down, and
-- fleet_tick's memory budget is untouched. qnfo-fleet-dashboard was under two live work claims, so its second producer is an agent_issues
-- row (FLEET-TICK-HEAVY-SECOND-PRODUCER-1); until then a missed heavy tick only delays self-heal, never the fixers on fleet_tick. breach_selfheal_heavy_tick reads
-- each view once into a snapshot table and every step reads the snapshot.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: breach_selfheal_actions
-- Rollback: DROP TRIGGER IF EXISTS breach_selfheal_heavy_tick; DROP TABLE IF EXISTS breach_selfheal_state; DROP TABLE IF EXISTS breach_selfheal_inputs_state; fleet_tick_heavy stays (an empty heartbeat table) until the two producers stop writing it. Never recreate breach_selfheal_tick on fleet_tick.
-- spof-review: fleet_tick_heavy has one producer until FLEET-TICK-HEAVY-SECOND-PRODUCER-1 lands; a failure here is logged and does not stop fleet_tick.
DROP TRIGGER IF EXISTS breach_selfheal_tick;
CREATE TABLE IF NOT EXISTS fleet_tick_heavy (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), source TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_fleet_tick_heavy_ts ON fleet_tick_heavy(ts);
CREATE TABLE IF NOT EXISTS breach_selfheal_state (check_class TEXT NOT NULL, subject TEXT NOT NULL, hit INTEGER, diagnosis TEXT, evidence TEXT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE IF NOT EXISTS breach_selfheal_inputs_state AS SELECT * FROM v_breach_selfheal_inputs WHERE 0;
CREATE TRIGGER IF NOT EXISTS breach_selfheal_heavy_tick AFTER INSERT ON fleet_tick_heavy
BEGIN
  -- (0) read each view once: every step below reads these two snapshots, not the views.
  DELETE FROM breach_selfheal_state;
  INSERT INTO breach_selfheal_state (check_class, subject, hit, diagnosis, evidence)
    SELECT check_class, subject, hit, diagnosis, evidence FROM v_breach_selfheal;
  DELETE FROM breach_selfheal_inputs_state;
  INSERT INTO breach_selfheal_inputs_state SELECT * FROM v_breach_selfheal_inputs;
  -- (a) errata rate down: a member other than the stages over 35% of the budget, or the backlog drained under 50.
  INSERT INTO breach_selfheal_actions (check_class, subject, action, revert, evidence)
    SELECT 'errata-rate', 'errata-confirm', 'errata_confirm_max ' || i.errata_confirm_max || ' -> 12', 'ops_config errata_confirm_max = ' || i.errata_confirm_max,
      CASE WHEN b.hit = 1 THEN 'budget share: ' || b.evidence WHEN i.budget_spent_today >= i.research_daily_neurons THEN 'research budget spent: ' || CAST(i.budget_spent_today AS INTEGER) ELSE 'backlog drained: backlog=' || i.errata_backlog END
    FROM breach_selfheal_inputs_state i, breach_selfheal_state b
    WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'breach_selfheal'), 'on') <> 'off'
      AND b.check_class = 'budget-share' AND i.errata_confirm_max > 12 AND (b.hit = 1 OR i.errata_backlog < 50 OR i.budget_spent_today >= i.research_daily_neurons);
  UPDATE ops_config SET value = '12', updated_at = datetime('now'), note = substr('BREACH-SELFHEAL-1 lowered at ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || '. ' || COALESCE(note, ''), 1, 600)
    WHERE key = 'errata_confirm_max' AND COALESCE((SELECT value FROM ops_config WHERE key = 'breach_selfheal'), 'on') <> 'off'
      AND CAST(value AS INTEGER) > 12
      AND ((SELECT hit FROM breach_selfheal_state WHERE check_class = 'budget-share') = 1 OR (SELECT errata_backlog FROM breach_selfheal_inputs_state) < 50
        OR (SELECT budget_spent_today >= research_daily_neurons FROM breach_selfheal_inputs_state) = 1);
  -- (a) errata rate up: the backlog is old, the confirm is settling (not failing), the budget share is fine; once an hour, at most 48.
  INSERT INTO breach_selfheal_actions (check_class, subject, action, revert, evidence)
    SELECT 'errata-rate', 'errata-confirm', 'errata_confirm_max ' || i.errata_confirm_max || ' -> ' || MIN(48, MAX(12, i.errata_confirm_max) * 2), 'ops_config errata_confirm_max = ' || i.errata_confirm_max, k.evidence
    FROM breach_selfheal_inputs_state i, breach_selfheal_state k
    WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'breach_selfheal'), 'on') <> 'off'
      AND k.check_class = 'chain-backlog' AND k.subject = 'errata-confirm' AND k.hit = 1
      AND i.errata_settled_2h > 0 AND i.errata_confirm_max < 48 AND i.budget_spent_today < i.research_budget_pace_now
      AND (SELECT hit FROM breach_selfheal_state WHERE check_class = 'budget-share') = 0
      AND NOT EXISTS (SELECT 1 FROM breach_selfheal_actions a WHERE a.check_class = 'errata-rate' AND a.ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-60 minutes'));
  UPDATE ops_config SET value = CAST(MIN(48, MAX(12, CAST(value AS INTEGER)) * 2) AS TEXT), updated_at = datetime('now'),
      note = substr('BREACH-SELFHEAL-1 raised at ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' (backlog old, budget share fine). ' || COALESCE(note, ''), 1, 600)
    WHERE key = 'errata_confirm_max' AND CAST(value AS INTEGER) < 48
      AND EXISTS (SELECT 1 FROM breach_selfheal_actions a
                    WHERE a.id = (SELECT MAX(id) FROM breach_selfheal_actions WHERE check_class = 'errata-rate')
                      AND a.ts >= strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 minutes')
                      AND a.action = 'errata_confirm_max ' || ops_config.value || ' -> ' || MIN(48, MAX(12, CAST(ops_config.value AS INTEGER)) * 2));
  -- (b) research stall: a claim 120 minutes past its last heartbeat goes back to the queue at the same stage.
  INSERT INTO breach_selfheal_actions (check_class, subject, action, revert, evidence)
    SELECT 'chain-stall', 'research', 'requeued ' || COUNT(*) || ' dead claims at their stage: ' || group_concat(substr(id, 1, 12), ','), 'status researching, claimed_at as before', (SELECT evidence FROM breach_selfheal_state WHERE check_class = 'chain-stall' AND subject = 'research')
    FROM (SELECT id FROM research_queue WHERE status = 'researching' AND claimed_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes') ORDER BY claimed_at LIMIT 6)
    WHERE COALESCE((SELECT value FROM ops_config WHERE key = 'breach_selfheal'), 'on') <> 'off'
      AND (SELECT hit FROM breach_selfheal_state WHERE check_class = 'chain-stall' AND subject = 'research') = 1
    HAVING COUNT(*) > 0;
  UPDATE research_queue SET
      status = CASE WHEN COALESCE(recover_count, 0) < 3 THEN 'queued' ELSE 'wontfix' END,
      stage = CASE WHEN COALESCE(recover_count, 0) < 3 THEN stage ELSE 'parked' END,
      recover_count = COALESCE(recover_count, 0) + 1,
      error = substr('BREACH-SELFHEAL-1 dead claim (no heartbeat since ' || COALESCE(claimed_at, '?') || ', no ok stage fleet-wide in 60 min; revert: status researching): ' || COALESCE(error, ''), 1, 300),
      claimed_at = NULL
    WHERE id IN (SELECT id FROM research_queue WHERE status = 'researching' AND claimed_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-120 minutes') ORDER BY claimed_at LIMIT 6)
      AND COALESCE((SELECT value FROM ops_config WHERE key = 'breach_selfheal'), 'on') <> 'off'
      AND (SELECT hit FROM breach_selfheal_state WHERE check_class = 'chain-stall' AND subject = 'research') = 1;
  -- (c) the metrics the triggers judge.
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
      last_value = CAST((SELECT hit FROM breach_selfheal_state WHERE check_class = 'chain-stall' AND subject = 'errata-confirm') AS TEXT)
    WHERE metric = 'errata_confirm_stalled';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
      last_value = CAST((SELECT hit FROM breach_selfheal_state WHERE check_class = 'chain-stall' AND subject = 'research') AS TEXT)
    WHERE metric = 'research_stage_stalled';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
      last_value = CAST((SELECT CASE WHEN published_daily_base_7d < 5 THEN 1 ELSE ROUND(published_24h / published_daily_base_7d, 3) END FROM breach_selfheal_inputs_state) AS TEXT)
    WHERE metric = 'publish_rate_ratio_24h';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
      last_value = CAST((SELECT COUNT(*) FROM breach_selfheal_state WHERE check_class = 'post-deploy-errors' AND hit = 1) AS TEXT)
    WHERE metric = 'post_deploy_error_workers';
  UPDATE metric_registry SET last_refreshed = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), state = 'MEASURED',
      last_value = CAST((SELECT CASE WHEN budget_spent_today > 0 THEN ROUND(budget_members_today * 1.0 / budget_spent_today, 3) ELSE 0 END FROM breach_selfheal_inputs_state) AS TEXT)
    WHERE metric = 'research_budget_member_share';
END;

INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id, trigger_condition, symptom, blast_radius)
SELECT 'fleet-tick-trigger-oom', 'a new AFTER INSERT trigger on fleet_tick pushes the tick statement out of memory and every 10-minute fixer stops',
  'all fleet_tick triggers run inside one statement; breach_selfheal_tick read a heavy view about twelve times and the statement hit SQLITE_NOMEM',
  'heavy steps go on fleet_tick_heavy (its own statement, two producers); a trigger on fleet_tick reads no view more than once',
  'audits_stale (fleet_tick older than 30 min) and fm-fleet-tick-trigger-oom', 'fm-fleet-tick-trigger-oom', '2026-10-26', NULL,
  'fleet_tick has no row for 30 minutes', 'fleet_tick age over 30 min; producer logs fleet-cron-tick-error with SQLITE_NOMEM', 'every 10-minute D1 fixer'
WHERE NOT EXISTS (SELECT 1 FROM failure_modes WHERE fm_key = 'fleet-tick-trigger-oom');
INSERT INTO remediation_contracts (class, issue_id, verify_probe, verify_transport, max_attempts, expected_cadence_h, status, precondition, action, escalate_to)
SELECT 'fm-fleet-tick-trigger-oom', NULL, 'SELECT ''0'' AS expected, CASE WHEN (SELECT MAX(ts) FROM fleet_tick) >= strftime(''%Y-%m-%dT%H:%M:%SZ'', ''now'', ''-30 minutes'') THEN ''0'' ELSE ''1'' END AS observed', 'd1-query', 3, 1, 'active', 'FLEET-TICK-SPLIT-1', 'failure-mode detector', 'qnfo-fleet-control'
WHERE NOT EXISTS (SELECT 1 FROM remediation_contracts WHERE class = 'fm-fleet-tick-trigger-oom');
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
SELECT 'session_01RdDA76KLvqYHYBjL9C2be5', 'the fleet_tick statement is near its memory limit; heavy steps need their own statement',
  'moved BREACH-SELFHEAL-1 off fleet_tick onto fleet_tick_heavy (FLEET-TICK-SPLIT-1)',
  'INSERT INTO fleet_tick failed SQLITE_NOMEM 04:42-06:12Z; succeeded once breach_selfheal_tick was dropped', 'applied', 'fleet_tick heartbeat',
  'the Rollback line of migrations/2026-10-26-fleet-tick-split.sql', 'a heavy fixer can fail without stopping the heartbeat',
  'fleet_tick age under 15 min and breach_selfheal_state refreshed within 15 min', 'live insert with and without the trigger'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'FLEET-TICK-SPLIT-1') > 0);
