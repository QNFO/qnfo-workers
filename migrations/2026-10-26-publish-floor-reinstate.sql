-- APPLY-BY: ci
-- DB: living-paper
-- Rollback: DROP TRIGGER IF EXISTS trg_papers_pub_floor_upd3; CREATE TRIGGER trg_papers_pub_floor_upd3 BEFORE UPDATE ON papers FOR EACH ROW WHEN NEW.status = 'published' AND ((COALESCE(OLD.status,'') <> 'published' AND (LOWER(COALESCE(NEW.paper_type,'')) IN ('poster','abstract','slides','section','fragment') OR (LENGTH(TRIM(COALESCE(NEW.body_md,''))) < 20000 AND NOT (COALESCE(OLD.status,'') = 'retracted' AND COALESCE(OLD.release_gate_pass,0) = 1 AND OLD.release_gate_at IS NOT NULL AND LENGTH(TRIM(COALESCE(NEW.body_md,''))) >= 8000)))) OR (COALESCE(OLD.status,'') = 'published' AND (LENGTH(TRIM(COALESCE(NEW.body_md,''))) < 8000 OR LENGTH(TRIM(COALESCE(NEW.body_md,'')))*2 < LENGTH(TRIM(COALESCE(OLD.body_md,'')))))) BEGIN SELECT RAISE(ABORT, 'PUBLISH-FLOOR-BLOCKED MIN-PAPER-LENGTH-3 (update): cannot publish below 20000 chars or as a non-paper artifact type, and cannot stub or halve an existing published paper (reinstatement exception: retracted row that passed the release gate, body >= 8000)'); END
-- BACKUP: bak_20261026_pub_floor_trigger
-- PUBLISH-FLOOR-REINSTATE-1 (2026-10-26, pillar research and reach; owner 2026-10-26: no gates or hold-backs the owner did not ask for,
-- and the fleet never withdraws the owner's own papers). Measured on living-paper 2026-10-26 07:00Z: 371 papers quarantined (97 of them
-- the owner's qnfo-2025-*), 162 by the publication gate (reason quality:...). qnfo-cloud-ops 1.36.0 restores those, but this trigger let
-- a paper return to published under 20,000 chars only from retracted with a passing gate, so 11 of the 162 (8k-20k chars) were refused,
-- and the owner papers noticeRepairTick restores from paper_integrity_backups (agent_issues 100274; backups are 8.3k-19k) were refused
-- too. The same rule also aborted any later write to a published paper whose body was already short (a gate verdict update), because it
-- compared the new body to 8,000 chars whether or not the body changed.
-- Now: (1) a new pipeline paper still needs 20,000 chars and a paper type (the publish floor in qnfo-research-exec is unchanged);
-- (2) a paper going back from quarantined or retracted needs 8,000 chars; (3) the owner's papers (qnfo-2025-*) are never refused for
-- length or type; (4) a published paper is refused only when the write shortens it below 8,000 chars or to under half. The blank-body
-- trigger trg_papers_no_shell_served_upd still refuses an empty body. trg_papers_pub_floor_ins2 (insert) is unchanged.
CREATE TABLE IF NOT EXISTS bak_20261026_pub_floor_trigger AS SELECT name, sql, datetime('now') AS captured_at FROM sqlite_master WHERE type = 'trigger' AND name = 'trg_papers_pub_floor_upd3';
DROP TRIGGER IF EXISTS trg_papers_pub_floor_upd3;
CREATE TRIGGER trg_papers_pub_floor_upd3 BEFORE UPDATE ON papers FOR EACH ROW
WHEN NEW.status = 'published' AND (
  (COALESCE(OLD.status, '') <> 'published'
    AND substr(COALESCE(NEW.identifier, ''), 1, 10) <> 'qnfo-2025-'
    AND COALESCE(OLD.status, '') NOT IN ('quarantined', 'retracted')
    AND (LOWER(COALESCE(NEW.paper_type, '')) IN ('poster', 'abstract', 'slides', 'section', 'fragment')
      OR LENGTH(TRIM(COALESCE(NEW.body_md, ''))) < 20000))
  OR (COALESCE(OLD.status, '') IN ('quarantined', 'retracted')
    AND substr(COALESCE(NEW.identifier, ''), 1, 10) <> 'qnfo-2025-'
    AND LENGTH(TRIM(COALESCE(NEW.body_md, ''))) < 8000)
  OR (COALESCE(OLD.status, '') = 'published'
    AND LENGTH(TRIM(COALESCE(NEW.body_md, ''))) < LENGTH(TRIM(COALESCE(OLD.body_md, '')))
    AND (LENGTH(TRIM(COALESCE(NEW.body_md, ''))) < 8000 OR LENGTH(TRIM(COALESCE(NEW.body_md, ''))) * 2 < LENGTH(TRIM(COALESCE(OLD.body_md, '')))))
)
BEGIN
  SELECT RAISE(ABORT, 'PUBLISH-FLOOR-BLOCKED MIN-PAPER-LENGTH-4 (update): a new paper needs 20000 chars and a paper type, a reinstated pipeline paper 8000, and a published paper cannot be cut below 8000 chars or to half its length; owner papers (qnfo-2025-*) are never refused for length or type');
END;
