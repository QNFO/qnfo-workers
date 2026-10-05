-- GUARD-TRIGGER-REPAIRS-1 (2026-10-05, agent_issues #1629 GUARD-REGISTRY-36-UNVERIFIED-1, charter pillar: security).
--
-- Two guard_registry triggers failed their offline negative tests against the live DDL
-- (scripts/guard-registry-negative-tests.mjs, DDL snapshot scripts/guard-registry-ddl-2026-10-05.json):
--
--   trg_registry_audit_log  AFTER INSERT ON audit_workers. Its audit_trail insert leaves out task_id (NOT NULL) and uses
--                           action 'auto-audit', which audit_trail's CHECK does not allow. So every INSERT into
--                           audit_workers aborts (NOT NULL constraint failed: audit_trail.task_id). Live data agrees: 26
--                           workers, the last created 2026-07-13, and zero audit_trail rows with session_id 'registry-sync'.
--                           Repair: task_id = 'registry-sync:' || worker_name, action 'deployed' (the value qnfo-ops
--                           already writes for a worker deploy), worker_name = NEW.worker_name. session_id, project_id,
--                           phase, evidence and timestamp are unchanged. COALESCE keeps task_id non-NULL if a row arrives
--                           without a worker_name, so the audit log never blocks the registration it records.
--   trg_dns_pages_fk        AFTER INSERT ON dns_redirects. Registered as "a *.pages.dev CNAME with no audit_pages entry
--                           writes an fk-violation snapshot", but the body never reads audit_pages, so every *.pages.dev
--                           CNAME got a snapshot, registered projects included. Repair: fire only when no audit_pages row
--                           matches the target, case-insensitively, by subdomain (live format '<project>.pages.dev'), by
--                           project_name || '.pages.dev', or as a branch alias '<alias>.<subdomain>'. Any audit_pages row
--                           counts, whatever its status, as the registry row says. The snapshot it writes is unchanged.
--
-- Both repairs keep the trigger name, timing and table. Neither weakens a guard: the first makes the logging work at all,
-- the second makes the check match its registered claim. The harness tests the CREATE statements below against the
-- live DDL of the other tables, and the rollback block against the live sqlite_master text.
--
-- Not applied by the authoring session. Apply with wrangler d1 execute qnfo-audit --remote --file=<this file>, then
-- re-run the harness against a fresh sqlite_master read and set guard_registry.verified_at for both rows.
--
-- ROLLBACK (the live DDL as read from sqlite_master 2026-10-05T18:51:00Z, verbatim):
-- ROLLBACK-BEGIN trg_registry_audit_log
-- DROP TRIGGER IF EXISTS trg_registry_audit_log;
-- CREATE TRIGGER trg_registry_audit_log
--         AFTER INSERT ON audit_workers
--         BEGIN
--             INSERT INTO audit_trail (session_id, project_id, phase, action, evidence, timestamp)
--             VALUES ('registry-sync', 'QNFO.INFRA.WORK', 1, 'auto-audit', 'Worker registered: ' || NEW.worker_name, datetime('now'));
--         END;
-- ROLLBACK-END trg_registry_audit_log
-- ROLLBACK-BEGIN trg_dns_pages_fk
-- DROP TRIGGER IF EXISTS trg_dns_pages_fk;
-- CREATE TRIGGER trg_dns_pages_fk
--         AFTER INSERT ON dns_redirects
--         WHEN NEW.target LIKE '%.pages.dev'
--         BEGIN
--             INSERT INTO project_state (project_code, snapshot_at, session_id, current_phase, phase_progress, resource_counts)
--             VALUES ('QNFO.INFRA.DNS', datetime('now'), 'fk-violation', 0, 0.0, 
--             json_object('fk_violation', 'CNAME target ' || NEW.target || ' has no audit_pages entry', 'record_source', NEW.source, 'record_target', NEW.target));
--         END;
-- ROLLBACK-END trg_dns_pages_fk
--
-- Definition of done (after applying): node scripts/guard-registry-negative-tests.mjs passes both guards against a fresh
-- sqlite_master read, and SELECT COUNT(*) FROM guard_registry WHERE guard IN ('trg_registry_audit_log','trg_dns_pages_fk')
-- AND verified_at IS NULL returns 0.

DROP TRIGGER IF EXISTS trg_registry_audit_log;
CREATE TRIGGER trg_registry_audit_log
AFTER INSERT ON audit_workers
BEGIN
  INSERT INTO audit_trail (session_id, project_id, phase, task_id, action, evidence, worker_name, timestamp)
  VALUES ('registry-sync', 'QNFO.INFRA.WORK', 1, 'registry-sync:' || COALESCE(NEW.worker_name, ''), 'deployed', 'Worker registered: ' || NEW.worker_name, NEW.worker_name, datetime('now'));
END;

DROP TRIGGER IF EXISTS trg_dns_pages_fk;
CREATE TRIGGER trg_dns_pages_fk
AFTER INSERT ON dns_redirects
WHEN NEW.target LIKE '%.pages.dev'
  AND NOT EXISTS (
    SELECT 1 FROM audit_pages ap
    WHERE lower(ap.subdomain) = lower(NEW.target)
       OR lower(ap.project_name) || '.pages.dev' = lower(NEW.target)
       OR substr(lower(NEW.target), -(length(ap.subdomain) + 1)) = '.' || lower(ap.subdomain)
  )
BEGIN
  INSERT INTO project_state (project_code, snapshot_at, session_id, current_phase, phase_progress, resource_counts)
  VALUES ('QNFO.INFRA.DNS', datetime('now'), 'fk-violation', 0, 0.0,
  json_object('fk_violation', 'CNAME target ' || NEW.target || ' has no audit_pages entry', 'record_source', NEW.source, 'record_target', NEW.target));
END;
