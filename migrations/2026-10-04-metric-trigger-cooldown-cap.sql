-- CYCLE-TIME-1 (2026-10-04, issue 1961 item H6): cap a metric trigger's cooldown_hours at 24.
--
-- New metric triggers kept arriving with cooldown_hours of 168 or 336 (ids 1214, 1234, 1235 and 1238 were
-- reset by hand on 2026-10-04). evaluateMetricTriggers re-files a still-breaching trigger after its
-- cooldown, so a >24h cooldown lets a breach sit un-actioned for days. These two triggers cap the column
-- at the database, so neither an INSERT nor an UPDATE can store more than 24h and the metric loop re-files
-- at most daily - matching the 12-24h cycle-time bound.
--
-- Applied directly to qnfo-audit on 2026-10-04 (both triggers verified present); kept here so a rebuilt
-- database converges. CREATE TRIGGER IF NOT EXISTS makes re-application a no-op.
--
-- Definition of done: SELECT COUNT(*) FROM analytics_metric_triggers WHERE cooldown_hours > 24 stays 0.
CREATE TRIGGER IF NOT EXISTS trg_metric_trigger_cooldown_cap_ins
AFTER INSERT ON analytics_metric_triggers
FOR EACH ROW WHEN NEW.cooldown_hours > 24
BEGIN
  UPDATE analytics_metric_triggers SET cooldown_hours = 24 WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS trg_metric_trigger_cooldown_cap_upd
AFTER UPDATE OF cooldown_hours ON analytics_metric_triggers
FOR EACH ROW WHEN NEW.cooldown_hours > 24
BEGIN
  UPDATE analytics_metric_triggers SET cooldown_hours = 24 WHERE id = NEW.id;
END;
