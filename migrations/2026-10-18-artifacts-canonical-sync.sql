-- ARTIFACTS-CANONICAL-SYNC-1 (2026-10-18)
-- Owner directive: all repositories live in Cloudflare Artifacts AND stay canonically in sync
-- with GitHub automatically; repository content is integrated with the fleet's Workers,
-- databases, graph and AI indices.
--
-- Context measured before this migration: 180 repos were imported into Artifacts namespaces
-- qnfo + rwnq8 once, on 2026-10-18, and never advanced afterwards (artifacts_probes stale since
-- 2026-09-25, no sync ledger, no content index). artifact_repos already held the inventory.
--
-- Idempotent: CREATE IF NOT EXISTS + additive ALTERs guarded by the applier.

CREATE TABLE IF NOT EXISTS artifact_sync_state (
  repo_id               TEXT PRIMARY KEY,          -- artifact_repos.id
  namespace             TEXT NOT NULL,
  repo                  TEXT NOT NULL,
  branch                TEXT NOT NULL DEFAULT 'main',
  github_sha            TEXT,
  artifacts_sha         TEXT,
  in_sync               INTEGER NOT NULL DEFAULT 0,
  github_committed_at   TEXT,
  artifacts_committed_at TEXT,
  last_checked          TEXT,
  last_error            TEXT,
  drift_since           TEXT,
  repair_count          INTEGER NOT NULL DEFAULT 0,
  last_repaired         TEXT
);

CREATE INDEX IF NOT EXISTS idx_artifact_sync_drift
  ON artifact_sync_state(in_sync, drift_since);

CREATE TABLE IF NOT EXISTS artifact_sync_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  checked INTEGER DEFAULT 0,
  in_sync INTEGER DEFAULT 0,
  drifted INTEGER DEFAULT 0,
  repaired INTEGER DEFAULT 0,
  failed INTEGER DEFAULT 0,
  detail TEXT
);

-- Repository CONTENT index: one row per indexed file, the join key between a repo file and its
-- Vectorize vector(s). Kept beside artifact_repos so "which file is that chunk from?" is a query,
-- not a re-fetch.
CREATE TABLE IF NOT EXISTS repo_file_index (
  id            TEXT PRIMARY KEY,                  -- namespace/repo#path@sha
  repo_id       TEXT NOT NULL,
  namespace     TEXT NOT NULL,
  repo          TEXT NOT NULL,
  path          TEXT NOT NULL,
  blob_sha      TEXT,
  bytes INTEGER, lines INTEGER, lang TEXT,
  vector_ids    TEXT,                              -- JSON array of Vectorize ids
  chunks        INTEGER DEFAULT 0,
  indexed_at    TEXT,
  error         TEXT
);

CREATE INDEX IF NOT EXISTS idx_repo_file_index_repo
  ON repo_file_index(namespace, repo);
CREATE INDEX IF NOT EXISTS idx_repo_file_index_sha
  ON repo_file_index(blob_sha);

-- Semantics of the replica, recorded rather than assumed.
INSERT OR IGNORE INTO failure_modes
  (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, trigger_condition, symptom, blast_radius)
VALUES (
  'artifacts-mirror-drift',
  'Artifacts replica silently ages out of sync with GitHub',
  'Artifacts copies are created by a one-shot import and the import route refuses an existing repo (10201: repo already exists), so a replica never advances unless something compares HEADs and rebuilds it.',
  'scripts/artifacts_canonical_sync.py --repair (HEAD-vs-HEAD compare; delete+import repair, verified by re-probe)',
  'scripts/artifacts_canonical_sync.py (artifact_sync_state.in_sync = 0)',
  'head-drift',
  datetime('now'),
  'A repository changes on GitHub after its Artifacts replica was imported',
  'Artifacts HEAD sha != GitHub HEAD sha; downstream readers (workers, repo_file_index, qnfo-repos vectors, Repository graph nodes) serve a stale tree',
  'every consumer of repository content: worker source reads, code agents, paper repos, file/vector search'
);

INSERT OR IGNORE INTO remediation_contracts
  (class, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, module, status)
VALUES (
  'artifacts-canonical-sync',
  'artifact_repos holds a row for the repo and both GitHub and Cloudflare credentials are present',
  'python scripts/artifacts_canonical_sync.py --repair --limit 10',
  'SELECT COUNT(*) FROM artifact_sync_state WHERE in_sync = 0 AND drift_since < datetime(''now'', ''-2 hours'')',
  'd1',
  'owner',
  6,
  'artifacts_canonical_sync',
  'active'
);
