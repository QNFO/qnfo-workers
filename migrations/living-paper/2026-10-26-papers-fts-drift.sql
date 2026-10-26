-- APPLY-BY: manual (living-paper DDL: applied through the Cloudflare D1 API by the session, each as one atomic call; the qnfo-audit runner had no living-paper target when it ran)
-- DB: living-paper
-- Rollback: DROP TRIGGER papers_au; then CREATE the previous definition from SELECT sql FROM trigger_bak_20261026 WHERE name = 'papers_au' (the row holds the exact previous text); then INSERT INTO papers_fts(papers_fts) VALUES('rebuild').
-- PAPERS-FTS-DRIFT-1 (2026-10-26, charter pillars research and reach). Found while testing the paper ledger (migrations/living-paper/2026-10-26-paper-change-ledger.sql) on a scratch D1.
--
-- The full-text index failed its own check in production: INSERT INTO papers_fts(papers_fts, rank) VALUES('integrity-check', 1) answered "database disk image is malformed:
-- SQLITE_CORRUPT_VTAB", and papers_fts_docsize held 1078 rows for 1077 papers. A scratch database built from production's own DDL failed on its very first INSERT INTO papers for the same
-- reason. Cause: papers_au was AFTER UPDATE ON papers for every column, so it ran an FTS5 delete and an insert on every update of any column (body, gate verdict, pdf path ...),
-- including the nested UPDATE inside papers_insert_meta. SQLite fires AFTER INSERT triggers newest first, so that nested UPDATE runs before papers_ai has indexed the new row: the delete is
-- for a row the index has never held. In a populated index that leaves a duplicate entry and a ghost docsize row (search drift), in an empty one it fails outright. papers_au now fires
-- only when title or abstract change (the two indexed columns), which removes the ordering hazard and most of the FTS write amplification. The index was rebuilt and now passes
-- integrity-check; search for "ultrametric" went from 76 to 77 papers (one paper the drifted index had been missing).
--
-- The publish-floor reinstatement that this session first applied with this change (quarantined by the gate, "quality:" reason, 8000 characters or more) was replaced at 07:08Z by
-- migrations/2026-10-26-publish-floor-reinstate.sql (MIN-PAPER-LENGTH-4, migration_runs 563), which covers it and more; it is not repeated here, so replaying this file does not undo it.

CREATE TABLE IF NOT EXISTS trigger_bak_20261026 (name TEXT, sql TEXT, saved_at TEXT);

INSERT INTO trigger_bak_20261026 (name, sql, saved_at) SELECT name, sql, datetime('now') FROM sqlite_master WHERE type = 'trigger' AND name = 'papers_au' AND name NOT IN (SELECT name FROM trigger_bak_20261026);

DROP TRIGGER papers_au;

CREATE TRIGGER papers_au AFTER UPDATE OF title, abstract ON papers WHEN OLD.title IS NOT NEW.title OR OLD.abstract IS NOT NEW.abstract BEGIN INSERT INTO papers_fts(papers_fts, rowid, title, abstract) VALUES ('delete', old.rowid, old.title, old.abstract); INSERT INTO papers_fts(rowid, title, abstract) VALUES (new.rowid, new.title, new.abstract); END;

INSERT INTO papers_fts(papers_fts) VALUES('rebuild');
