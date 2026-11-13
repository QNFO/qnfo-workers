-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS fleet_tick_debounce;
-- spof-review: no new component; one BEFORE INSERT trigger. It drops a fleet_tick row only when another row landed in the previous 8 minutes AND the same source has a row in the previous 55 minutes, so the table still gets a row in every 10-minute slot (tick_slot_coverage_24h, v_audit_freshness 30 min, the hourly :00-:09 trigger window) and every producer (orchestrator, fleet-control, dashboard, the chaos drill's two-distinct-sources proof) still lands a row at least hourly.
-- charter-pillar: cost
-- CAUSE-MAPPED: no metric registered.
-- Probe: qnfo-audit rows read per hour from d1AnalyticsAdaptiveGroups, target < 15 M within 3 h of apply; fleet_tick distinct sources in 24 h >= 2.
--
-- D1-READS-COST-9 (D1-ROWS-READ-COST-1, 2026-11-13). Measured live (d1QueriesAdaptiveGroups, qnfo-audit, 17:00 to 20:00 UTC): qnfo-audit still read 35 to 45 M rows an
-- hour after cut 7. The top statements are the fleet_tick inserts themselves: `INSERT INTO fleet_tick ... WHERE NOT EXISTS` 12 M rows over 106 calls and
-- `INSERT OR IGNORE INTO fleet_tick` 6 M over 6 calls. The insert's own plan is a covering-index seek; the rows are read by the 67 AFTER INSERT triggers on
-- fleet_tick (8 unguarded, 59 gated on minutes 0-9 or migration sources). About 65 inserts an hour (cron:qnfo-code-orchestrator 125, qnfo-fleet-control 63,
-- qnfo-fleet-dashboard 4 in 3 hours), each firing the unguarded ones (queue_sla_tick_10m and similar, about 0.6 M rows per insert).
-- The triggers are designed for a 10-minute cadence (their names say _10m), so the fix is the cadence: one accepted row per 8 minutes gives 7 to 8 an hour.
-- Review fix (Codex P2 on this PR): a global guard could starve the dashboard (*/15) and fleet-control (*/10) producers when the orchestrator's accepted
-- ticks align with their clocks, and the chaos-drill probe in 2026-10-12-39-chaos-drill-probes.sql needs two distinct sources within 24 h. The second
-- condition lets a source through once its own last row is older than 55 minutes, which adds at most two firings an hour.
-- Predicted: qnfo-audit rows read per hour < 15 M within 3 h (about 80% fewer trigger firings).
CREATE TRIGGER IF NOT EXISTS fleet_tick_debounce BEFORE INSERT ON fleet_tick
WHEN NEW.source NOT LIKE 'migration:%'
  AND EXISTS (SELECT 1 FROM fleet_tick WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-8 minutes'))
  AND EXISTS (SELECT 1 FROM fleet_tick WHERE source = NEW.source AND ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-55 minutes'))
BEGIN
  SELECT RAISE(IGNORE);
END;
