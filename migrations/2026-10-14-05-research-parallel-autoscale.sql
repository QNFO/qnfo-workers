-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS research_parallel_autoraise; DROP TRIGGER IF EXISTS research_parallel_autolower; UPDATE ops_config SET value = '2', note = 'RESEARCH-THROUGHPUT-1: paper slots per tick, 1..4 (RESEARCH-PARALLEL-AUTOSCALE-1 rolled back)', updated_at = datetime('now') WHERE key = 'research_parallel'; UPDATE queue_sla SET auto_fix = (SELECT auto_fix FROM bak_20261014_research_autoscale b WHERE b.stuck_type = queue_sla.stuck_type) WHERE stuck_type = 'research-queued-age'; DELETE FROM decision_log WHERE instr(action, 'RESEARCH-PARALLEL-AUTOSCALE-1:') = 1
-- RESEARCH-PARALLEL-AUTOSCALE-1 (2026-10-14, pillar research; agent_issues 2193 stuck_items_over_sla, 2487 research_deferred_pool, SPOF 2175).
-- A one-way trigger set research_parallel back to 2 at 2026-10-13 20:50 UTC, when no ready row had waited 180 minutes. Nothing raised
-- it again. With 2 slots qnfo-research-exec published 8 papers in 24 hours, down from 22-31 a day at 4 slots (2026-10-09 to 10-13).
-- Two ready rows have now waited about 4 hours, so research_queued_180m reads 2. The deferred pool holds 185 rows.
-- Two triggers on the fleet tick now scale the width both ways:
--   raise to 4 while a ready row has waited over 180 minutes (the SLA's own definition, research_ready.ready_at);
--   lower to 2 only when the deferred pool is empty and no ready row has waited 60 minutes.
-- The lower bound is set apart from the raise bound so the width does not flap. Each change is logged in queue_sla_actions and
-- names itself in the ops_config note. ops_config research_parallel_autoscale = off stops both triggers without a deploy.
-- The old research_parallel_autorevert only fires on its own 2026-10-09 note, so it stays inert.
-- At a breached ai_spend cap the stages already run on the lean models (BUDGET-SOFT-ROUTE-1), so width is no spend lever.
CREATE TABLE IF NOT EXISTS bak_20261014_research_autoscale AS SELECT * FROM queue_sla WHERE stuck_type = 'research-queued-age';
CREATE TRIGGER IF NOT EXISTS research_parallel_autoraise AFTER INSERT ON fleet_tick
WHEN COALESCE((SELECT lower(value) FROM ops_config WHERE key = 'research_parallel_autoscale'), 'on') != 'off'
  AND CAST(COALESCE((SELECT value FROM ops_config WHERE key = 'research_parallel'), '2') AS INTEGER) < 4
  AND (SELECT COUNT(*) FROM research_queue q LEFT JOIN research_ready r ON r.id = q.id
       WHERE q.status = 'queued' AND datetime(COALESCE(r.ready_at, q.created_at)) < datetime('now', '-180 minutes')) > 0
BEGIN
  INSERT INTO queue_sla_actions (stuck_type, n, note)
  SELECT 'research-parallel-autoraise', COUNT(*), 'RESEARCH-PARALLEL-AUTOSCALE-1: ' || COUNT(*) || ' ready row(s) waited over 180 minutes; research_parallel raised to 4'
  FROM research_queue q LEFT JOIN research_ready r ON r.id = q.id
  WHERE q.status = 'queued' AND datetime(COALESCE(r.ready_at, q.created_at)) < datetime('now', '-180 minutes');
  INSERT INTO ops_config (key, value, note, updated_at) VALUES ('research_parallel', '4',
    'RESEARCH-PARALLEL-AUTOSCALE-1: raised to 4 at ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' because a ready research row waited over 180 minutes; research_parallel_autolower restores 2 when the deferred pool is empty and no ready row has waited 60 minutes; ops_config research_parallel_autoscale = off stops both.',
    datetime('now'))
  ON CONFLICT(key) DO UPDATE SET value = excluded.value, note = excluded.note, updated_at = excluded.updated_at;
END;
CREATE TRIGGER IF NOT EXISTS research_parallel_autolower AFTER INSERT ON fleet_tick
WHEN COALESCE((SELECT lower(value) FROM ops_config WHERE key = 'research_parallel_autoscale'), 'on') != 'off'
  AND (SELECT value FROM ops_config WHERE key = 'research_parallel') = '4'
  AND (SELECT instr(note, 'RESEARCH-PARALLEL-AUTOSCALE-1: raised') FROM ops_config WHERE key = 'research_parallel') = 1
  AND (SELECT COUNT(*) FROM research_queue WHERE status = 'deferred') = 0
  AND (SELECT COUNT(*) FROM research_queue q LEFT JOIN research_ready r ON r.id = q.id
       WHERE q.status = 'queued' AND datetime(COALESCE(r.ready_at, q.created_at)) < datetime('now', '-60 minutes')) = 0
BEGIN
  INSERT INTO queue_sla_actions (stuck_type, n, note) VALUES ('research-parallel-autolower', 0, 'RESEARCH-PARALLEL-AUTOSCALE-1: deferred pool empty and no ready row waited 60 minutes; research_parallel restored 4 -> 2');
  UPDATE ops_config SET value = '2', updated_at = datetime('now'),
    note = 'RESEARCH-PARALLEL-AUTOSCALE-1: lowered to 2 at ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' (deferred pool empty, no ready row waited 60 minutes); research_parallel_autoraise raises it again when a ready row waits over 180 minutes.'
  WHERE key = 'research_parallel';
END;
UPDATE queue_sla SET auto_fix = auto_fix || ' | RESEARCH-PARALLEL-AUTOSCALE-1 (2026-10-14): while a ready row has waited over 180 minutes, the fleet tick raises ops_config research_parallel to 4 (trigger research_parallel_autoraise); it returns to 2 when the deferred pool is empty and no ready row has waited 60 minutes (research_parallel_autolower). Revert: ops_config research_parallel_autoscale = off.'
WHERE stuck_type = 'research-queued-age' AND instr(auto_fix, 'RESEARCH-PARALLEL-AUTOSCALE-1') = 0;
UPDATE control_registry SET evidence = evidence || ' | 2026-10-14 RESEARCH-PARALLEL-AUTOSCALE-1: the width had fallen back to 2 on 2026-10-13 20:50 UTC (8 papers in 24 h, rows waiting 4 h); triggers research_parallel_autoraise and research_parallel_autolower now set it from the ready-row wait and the deferred pool.', reviewed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now')
WHERE control = 'research-single-flight-lease' AND instr(evidence, 'RESEARCH-PARALLEL-AUTOSCALE-1') = 0;
INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, reach_gain, surfaces_tested)
SELECT 'session_01Kddqwk5gQT5qSSHVKjT2EA', 'a research row ready for an executor should be taken within the 180-minute SLA; the executor ran four slots for four days without a defect, so its width follows the backlog instead of a one-way revert',
  'RESEARCH-PARALLEL-AUTOSCALE-1: fleet-tick triggers raise ops_config research_parallel to 4 while a ready row waits over 180 minutes and lower it to 2 when the deferred pool is empty and no ready row waits 60 minutes',
  'ops_config research_parallel 2 since 2026-10-13T20:50:59Z (research_parallel_autorevert); research_queue published 8 in 24 h; rows 37adccd7 and 85dcc091 ready since 2026-10-13 22:20 and 22:40 UTC; deferred pool 185; control_registry research-single-flight-lease: 4 slots from 2026-10-12',
  'merged through the canonical path (migration runner)', 'qnfo-research-exec throughput and Workers AI volume (lean models at a breached cap)', 'ops_config research_parallel_autoscale = off, or the rollback line',
  'research throughput follows the backlog both ways instead of staying at the floor after one quiet moment',
  'research_queued_180m reads 0 within 6 hours of the merge and papers published in the following 24 hours are at least 16',
  'more QNFO papers published per day', 'd1:research_queue, research_ready, ops_config, queue_sla_actions, cloud_ops_events qnfo-research-exec'
WHERE NOT EXISTS (SELECT 1 FROM decision_log WHERE instr(action, 'RESEARCH-PARALLEL-AUTOSCALE-1:') = 1);
