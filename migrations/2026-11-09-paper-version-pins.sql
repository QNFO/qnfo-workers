-- PAPER-PIDS-PIN-2 (issue 9790, 2026-11-09, charter pillar research): append-only pin of the body hash first served for each paper version, plus a drift log.
-- qnfo-gateway handlePaperVersion INSERT OR IGNOREs a pin the first time a version is served and answers X-Content-Pin-Status: pinned|new|drifted; a differing
-- hash is appended to paper_version_drift. Pins are never updated. The metric paper_version_drifted_7d (reads paper_version_drift) follows in its own migration.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TABLE IF EXISTS paper_version_drift; DROP TABLE IF EXISTS paper_version_pins;

CREATE TABLE IF NOT EXISTS paper_version_pins (
  slug TEXT NOT NULL,
  version TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  pinned_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  PRIMARY KEY (slug, version)
);

CREATE TABLE IF NOT EXISTS paper_version_drift (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL,
  version TEXT NOT NULL,
  pinned_sha256 TEXT NOT NULL,
  served_sha256 TEXT NOT NULL,
  seen_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE INDEX IF NOT EXISTS idx_paper_version_drift_seen ON paper_version_drift (seen_at);
