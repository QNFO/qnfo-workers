-- RESEARCH-PARALLEL-AUTOREVERT-1 (2026-10-09, pillar research and cost; QUEUE-SLA-1, BUDGET-SOFT-ROUTE-1). The 2026-10-08
-- hold release queued 53 research rows past the 180-min queue SLA, so ops_config research_parallel was raised from the
-- default 2 to its maximum 4 on 2026-10-09 (decision_log). A raise with no automatic way back is a loose end: this trigger
-- restores 2 on the first fleet tick that finds no row queued for more than 180 minutes, and only while the value is the
-- one this raise set (its note names it), so a later deliberate setting is left alone. The restore is logged in
-- queue_sla_actions.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS research_parallel_autorevert

CREATE TRIGGER IF NOT EXISTS research_parallel_autorevert AFTER INSERT ON fleet_tick
WHEN (SELECT value FROM ops_config WHERE key = 'research_parallel') = '4'
  AND (SELECT instr(note, 'Set 4 on 2026-10-09') FROM ops_config WHERE key = 'research_parallel') > 0
  AND (SELECT COUNT(*) FROM research_queue WHERE status = 'queued' AND datetime(created_at) < datetime('now', '-180 minutes')) = 0
BEGIN
  INSERT INTO queue_sla_actions (stuck_type, n, note) VALUES ('research-parallel-autorevert', 0, 'research_queued_180m reached 0; research_parallel restored 4 -> 2');
  UPDATE ops_config SET value = '2', updated_at = datetime('now'),
      note = 'RESEARCH-THROUGHPUT-1: paper slots per tick, 1..4. Restored to the default 2 by research_parallel_autorevert on ' || strftime('%Y-%m-%dT%H:%M:%SZ', 'now') || ' when no research row had been queued over 180 minutes.'
  WHERE key = 'research_parallel';
END;
