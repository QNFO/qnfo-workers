-- REMOVAL-LEDGER-WRITE-PATH-1 (2026-10-01, agent_issues 1674). Applied to qnfo-audit.
--
-- worker_removals was created and backfilled once (19 rows from worker_consolidation), but nothing
-- appended to it at runtime, so a worker removed tomorrow would leave no trace again. Removals happen
-- through several paths (consolidation RETIRED transition, wrangler delete, API delete), so the
-- producer lives in the data layer where every path converges:
--   1. worker_consolidation row becomes RETIRED/RETIRE (insert or status/action update)  -> decided removal
--   2. worker_live_audit row moves from a live note (SYNC/DRIFT/CRON_ONLY) to NOT_DEPLOYED -> observed removal
-- Each insert is idempotent per (worker, source) so replays and re-audits do not duplicate rows.

CREATE TRIGGER IF NOT EXISTS worker_removals_from_consolidation_upd
AFTER UPDATE OF status, action ON worker_consolidation
WHEN (UPPER(COALESCE(NEW.status,'')) LIKE '%RETIR%' OR UPPER(COALESCE(NEW.action,'')) LIKE '%RETIR%')
 AND NOT (UPPER(COALESCE(OLD.status,'')) LIKE '%RETIR%' OR UPPER(COALESCE(OLD.action,'')) LIKE '%RETIR%')
 AND NOT EXISTS (SELECT 1 FROM worker_removals r WHERE r.worker = NEW.worker)
BEGIN
  INSERT INTO worker_removals (worker, removed_at, action, target, rationale, evidence, source)
  VALUES (NEW.worker, datetime('now'), NEW.action, NEW.target, NEW.rationale,
          'worker_consolidation status=' || COALESCE(NEW.status,'') || ' action=' || COALESCE(NEW.action,''),
          'trigger:worker_consolidation');
END;

CREATE TRIGGER IF NOT EXISTS worker_removals_from_consolidation_ins
AFTER INSERT ON worker_consolidation
WHEN (UPPER(COALESCE(NEW.status,'')) LIKE '%RETIR%' OR UPPER(COALESCE(NEW.action,'')) LIKE '%RETIR%')
 AND NOT EXISTS (SELECT 1 FROM worker_removals r WHERE r.worker = NEW.worker)
BEGIN
  INSERT INTO worker_removals (worker, removed_at, action, target, rationale, evidence, source)
  VALUES (NEW.worker, datetime('now'), NEW.action, NEW.target, NEW.rationale,
          'worker_consolidation status=' || COALESCE(NEW.status,'') || ' action=' || COALESCE(NEW.action,''),
          'trigger:worker_consolidation');
END;

CREATE TRIGGER IF NOT EXISTS worker_removals_from_live_audit
AFTER UPDATE OF note ON worker_live_audit
WHEN NEW.note = 'NOT_DEPLOYED' AND OLD.note IN ('SYNC','DRIFT','CRON_ONLY')
 AND NOT EXISTS (SELECT 1 FROM worker_removals r WHERE r.worker = NEW.worker AND r.removed_at > datetime('now','-1 day'))
BEGIN
  INSERT INTO worker_removals (worker, removed_at, action, target, rationale, evidence, source)
  VALUES (NEW.worker, COALESCE(NEW.probed_at, datetime('now')), 'OBSERVED-REMOVED', NULL,
          'live audit saw the worker go from ' || OLD.note || ' to NOT_DEPLOYED',
          'worker_live_audit http=' || COALESCE(NEW.http,'') || ' last live_version=' || COALESCE(OLD.live_version,''),
          'trigger:worker_live_audit');
END;
