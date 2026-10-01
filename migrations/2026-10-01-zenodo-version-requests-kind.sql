-- ZENODO-METADATA-EDITS-1 (2026-10-01): one queue, two kinds (folding beats adding a table family, charter s8 rule 2).
-- kind='version'  : new version of record_id with files_json replacing every file (ZENODO-VERSION-REQUESTS-1).
-- kind='metadata' : in-place metadata edit of record_id; files_json is '[]' and metadata_json carries the patch, e.g.
--   {"creator_by_orcid": {"orcid": "0009-0002-4317-5604", "name": "Quni-Gudzinas, Rowan Brad",
--                         "affiliation": "QNFO (independent research)"}}
--   status: pending -> publishing -> published | unchanged | error.
ALTER TABLE zenodo_version_requests ADD COLUMN kind TEXT NOT NULL DEFAULT 'version';
CREATE INDEX IF NOT EXISTS idx_zenodo_version_requests_kind ON zenodo_version_requests (kind, status, id);
