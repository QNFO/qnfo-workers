-- JOBSEARCH-1 (2026-10-27, charter pillar reach): tables for the qnfo-jobsearch worker (verified-claims job matcher).
-- Holds public job postings and drafts built only from the owner's claim ledger; no secrets, no recruiter personal data.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TABLE IF EXISTS jobsearch_matches; DROP TABLE IF EXISTS jobsearch_runs;
CREATE TABLE IF NOT EXISTS jobsearch_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL, finished_at TEXT,
  feeds INTEGER, fetched INTEGER, passed INTEGER, stored INTEGER, blocked INTEGER,
  excluded_json TEXT, errors_json TEXT
);
CREATE TABLE IF NOT EXISTS jobsearch_matches (
  id TEXT PRIMARY KEY,
  first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, run_id INTEGER,
  company TEXT, title TEXT, location TEXT, url TEXT,
  tier TEXT, score INTEGER, why_json TEXT, flags_json TEXT,
  verified INTEGER NOT NULL DEFAULT 0, blocked_reason TEXT, resume_md TEXT, note_md TEXT,
  status TEXT NOT NULL DEFAULT 'pending_owner_approval', decided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_jobsearch_matches_rank ON jobsearch_matches (score DESC, last_seen DESC);
