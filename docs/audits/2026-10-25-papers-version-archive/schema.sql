
CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_version_history_slug_version ON paper_version_history(slug, version);
CREATE TRIGGER IF NOT EXISTS papers_version_archive_upd AFTER UPDATE OF body_md ON papers
WHEN OLD.body_md IS NOT NULL AND length(trim(OLD.body_md)) >= 40 AND NEW.body_md IS NOT OLD.body_md
BEGIN
  INSERT INTO paper_version_history(slug, version, title, abstract, body_md, archived_at, superseded_by)
  SELECT OLD.slug, OLD.version, OLD.title, OLD.abstract, OLD.body_md, datetime('now'), NEW.version
  WHERE OLD.slug IS NOT NULL AND NOT EXISTS (SELECT 1 FROM paper_version_history h WHERE h.slug = OLD.slug AND h.version IS OLD.version);
END;
CREATE TRIGGER IF NOT EXISTS papers_version_archive_ver AFTER UPDATE OF version ON papers
WHEN NEW.version IS NOT OLD.version AND OLD.body_md IS NOT NULL AND length(trim(OLD.body_md)) >= 40
BEGIN
  INSERT INTO paper_version_history(slug, version, title, abstract, body_md, archived_at, superseded_by)
  SELECT OLD.slug, OLD.version, OLD.title, OLD.abstract, OLD.body_md, datetime('now'), NEW.version
  WHERE OLD.slug IS NOT NULL AND NOT EXISTS (SELECT 1 FROM paper_version_history h WHERE h.slug = OLD.slug AND h.version IS OLD.version);
END;
