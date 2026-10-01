-- ZENODO-VERSION-REQUESTS-1 (2026-10-01): queue drained by qnfo-research-exec (one row per cron run).
-- A row asks for a new version of an existing Zenodo record whose files are replaced by the listed files.
-- files_json: [{"name": "RESUME.md", "url": "https://raw.githubusercontent.com/rwnq8/resume/<40-hex sha>/RESUME.md"}, ...]
-- metadata_json: fields merged over the previous version's metadata (title, version, description, creators, ...).
-- status: pending -> publishing -> published | error. draft_id is kept on error so the draft can be inspected or discarded.
CREATE TABLE IF NOT EXISTS zenodo_version_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  record_id INTEGER NOT NULL,
  files_json TEXT NOT NULL,
  metadata_json TEXT NOT NULL DEFAULT '{}',
  requested_by TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  draft_id TEXT,
  result_doi TEXT,
  result_record_id INTEGER,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_zenodo_version_requests_status ON zenodo_version_requests (status, id);
