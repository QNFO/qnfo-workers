-- PROJECT-STATE-SECOND-COLLISION-1 (2026-10-06, agent_issues #1998, charter pillar: core).
--
-- project_state had PRIMARY KEY (project_code, snapshot_at) and the two fk-violation triggers wrote
-- snapshot_at = datetime('now'), which has one-second resolution. Two violation snapshots for the same project_code
-- inside the same second collided on that key, and because the INSERT runs inside the trigger, the second parent write
-- (INSERT INTO dns_redirects, or INTO cf_pages_domain_mappings) aborted with "UNIQUE constraint failed", so a bulk DNS
-- or Pages sync could lose rows. Found by GUARD-VERIFY-OFFLINE-1 (#1629) against the live DDL; latent so far
-- (project_state held 0 rows at 2026-10-06T05:46Z, dns_redirects 45). No worker or script reads or writes project_state
-- apart from these two triggers (grep of the repository 2026-10-06), so the new shape changes no reader.
--
-- Repair, two parts, so a batch cannot collide at any resolution:
--   1. project_state is rebuilt with its own snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT; (project_code, snapshot_at)
--      becomes an ordinary index. Every column, type, default and the projects foreign key are kept; the 0 rows are
--      copied. Two snapshots in the same instant are now two rows.
--   2. both triggers write snapshot_at = strftime('%Y-%m-%d %H:%M:%f','now') (millisecond resolution, same prefix as
--      datetime('now') so ORDER BY and date() keep working), so snapshots in one second still sort in order.
-- Trigger names, timing, WHEN clauses and the snapshot payload are unchanged. Neither guard is weakened: the same
-- violations are recorded, and a parent write is no longer aborted by the record of a sibling violation.
-- Offline negative test: scripts/project-state-collision.test.mjs (two violating rows in one statement batch succeed for
-- both parents with this DDL and the live DDL loses the second; a registered target still writes no snapshot).
--
-- ROLLBACK (the live DDL as read from sqlite_master 2026-10-06T05:46Z, verbatim):
-- ROLLBACK-BEGIN project_state
-- DROP TABLE IF EXISTS project_state;
-- CREATE TABLE project_state (
--         project_code TEXT NOT NULL REFERENCES projects(project_code),
--         snapshot_at TEXT NOT NULL DEFAULT (datetime('now')),
--         session_id TEXT,
--         current_phase INTEGER,
--         phase_progress REAL,
--         resource_counts TEXT,
--         git_branch TEXT,
--         git_commit TEXT,
--         r2_snapshot_path TEXT,
--         PRIMARY KEY (project_code, snapshot_at)
--     )
-- ROLLBACK-END project_state
-- ROLLBACK-BEGIN trg_dns_pages_fk
-- DROP TRIGGER IF EXISTS trg_dns_pages_fk;
-- CREATE TRIGGER trg_dns_pages_fk AFTER INSERT ON dns_redirects WHEN NEW.target LIKE '%.pages.dev' AND NOT EXISTS (SELECT 1 FROM audit_pages ap WHERE lower(ap.subdomain) = lower(NEW.target) OR lower(ap.project_name) || '.pages.dev' = lower(NEW.target) OR substr(lower(NEW.target), -(length(ap.subdomain) + 1)) = '.' || lower(ap.subdomain)) BEGIN INSERT INTO project_state (project_code, snapshot_at, session_id, current_phase, phase_progress, resource_counts) VALUES ('QNFO.INFRA.DNS', datetime('now'), 'fk-violation', 0, 0.0, json_object('fk_violation', 'CNAME target ' || NEW.target || ' has no audit_pages entry', 'record_source', NEW.source, 'record_target', NEW.target)); END
-- ROLLBACK-END trg_dns_pages_fk
-- ROLLBACK-BEGIN trg_pages_domain_check
-- DROP TRIGGER IF EXISTS trg_pages_domain_check;
-- CREATE TRIGGER trg_pages_domain_check
--         AFTER INSERT ON cf_pages_domain_mappings
--         WHEN (SELECT COUNT(*) FROM dns_redirects WHERE source = NEW.custom_domain AND deleted_on IS NULL) = 0
--         BEGIN
--             INSERT INTO project_state (project_code, snapshot_at, session_id, current_phase, phase_progress, resource_counts)
--             VALUES ('QNFO.INFRA.PAGE', datetime('now'), 'fk-violation', 0, 0.0,
--             json_object('fk_violation', 'Pages domain ' || NEW.custom_domain || ' has no active CNAME in dns_redirects', 'domain', NEW.custom_domain));
--         END
-- ROLLBACK-END trg_pages_domain_check
--
-- Definition of done: node scripts/project-state-collision.test.mjs passes, the CREATE statements below are the live
-- sqlite_master text, and guard_registry.verified_at is set for both guards.

-- Order: the triggers are dropped before the table they insert into is dropped (D1 refuses the DROP TABLE while a
-- trigger body still names project_state), then the table is rebuilt, then the triggers are re-created.
DROP TRIGGER IF EXISTS trg_dns_pages_fk;
DROP TRIGGER IF EXISTS trg_pages_domain_check;
CREATE TABLE IF NOT EXISTS project_state_v2 (
  snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_code TEXT NOT NULL REFERENCES projects(project_code),
  snapshot_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f','now')),
  session_id TEXT,
  current_phase INTEGER,
  phase_progress REAL,
  resource_counts TEXT,
  git_branch TEXT,
  git_commit TEXT,
  r2_snapshot_path TEXT
);
INSERT INTO project_state_v2 (project_code, snapshot_at, session_id, current_phase, phase_progress, resource_counts, git_branch, git_commit, r2_snapshot_path)
  SELECT project_code, snapshot_at, session_id, current_phase, phase_progress, resource_counts, git_branch, git_commit, r2_snapshot_path FROM project_state ORDER BY snapshot_at;
DROP TABLE project_state;
ALTER TABLE project_state_v2 RENAME TO project_state;
CREATE INDEX IF NOT EXISTS idx_project_state_code_at ON project_state (project_code, snapshot_at);

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
  VALUES ('QNFO.INFRA.DNS', strftime('%Y-%m-%d %H:%M:%f','now'), 'fk-violation', 0, 0.0,
  json_object('fk_violation', 'CNAME target ' || NEW.target || ' has no audit_pages entry', 'record_source', NEW.source, 'record_target', NEW.target));
END;

CREATE TRIGGER trg_pages_domain_check
AFTER INSERT ON cf_pages_domain_mappings
WHEN (SELECT COUNT(*) FROM dns_redirects WHERE source = NEW.custom_domain AND deleted_on IS NULL) = 0
BEGIN
  INSERT INTO project_state (project_code, snapshot_at, session_id, current_phase, phase_progress, resource_counts)
  VALUES ('QNFO.INFRA.PAGE', strftime('%Y-%m-%d %H:%M:%f','now'), 'fk-violation', 0, 0.0,
  json_object('fk_violation', 'Pages domain ' || NEW.custom_domain || ' has no active CNAME in dns_redirects', 'domain', NEW.custom_domain));
END;

-- APPLIED 2026-10-06T05:52Z to qnfo-audit by session_01ECGThLZjUCXYH4EdsUTUiB (D1 query API, 9 statements, project_state
-- held 0 rows); sqlite_master re-read 05:52Z shows the rebuilt table, the index and both triggers with the millisecond
-- snapshot_at; guard_registry.verified_at set for both guards with this evidence.
