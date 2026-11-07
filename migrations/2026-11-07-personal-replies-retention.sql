-- APPLY-BY: ci
-- DB: qnfo-audit
-- BACKUP: none (deletes old rows only, no schema change)
-- Rollback: none (deletions are intentional hygiene, not recoverable)
--
-- KERNEL-EVERYWHERE-1 follow-up: bound personal_replies growth (#8474)
--
-- personal_replies mirrors every personal-api twin reply for false-stop scanning.
-- It was unbounded (one row per reply, kept forever). This adds a 30-day retention
-- sweep so the table stays bounded while preserving the 7-day false_stops_7d window.

-- Scheduled cleanup: delete personal_replies rows older than 30 days.
-- Runs every 10 minutes off the fleet heartbeat.
CREATE TRIGGER IF NOT EXISTS personal_replies_retention_sweep
AFTER INSERT ON fleet_heartbeat
FOR EACH ROW
WHEN NEW.tick_min_10 = 1
BEGIN
  DELETE FROM personal_replies
  WHERE replied_at < datetime('now', '-30 days');
END;

-- Immediate cleanup: remove existing rows beyond the 30-day window
DELETE FROM personal_replies
WHERE replied_at < datetime('now', '-30 days');
