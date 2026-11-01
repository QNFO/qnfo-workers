-- APPLY-BY: ci
-- DB: living-paper
-- Rollback: DROP TRIGGER paper_change_bodies_no_update; CREATE TRIGGER paper_change_bodies_no_update BEFORE UPDATE ON paper_change_bodies BEGIN SELECT RAISE(ABORT, 'PAPER-LEDGER-1: a stored body is never edited'); END; DROP TRIGGER paper_change_body_archive_no_update; CREATE TRIGGER paper_change_body_archive_no_update BEFORE UPDATE ON paper_change_body_archive BEGIN SELECT RAISE(ABORT, 'PAPER-LEDGER-1: archive proofs are append-only'); END;
-- PAPER-PROVENANCE-TRACE-1: store the structured publication record beside each change and retain it when a body is archived.

ALTER TABLE paper_change_bodies ADD COLUMN metadata TEXT;
ALTER TABLE paper_change_body_archive ADD COLUMN metadata TEXT;

DROP TRIGGER paper_change_bodies_no_update;
CREATE TRIGGER paper_change_bodies_no_update BEFORE UPDATE ON paper_change_bodies
WHEN NOT (
  NEW.seq IS OLD.seq
  AND NEW.slug IS OLD.slug
  AND NEW.body_md IS OLD.body_md
  AND OLD.metadata IS NULL
  AND NEW.metadata IS NOT NULL
  AND json_valid(NEW.metadata)
)
BEGIN
  SELECT RAISE(ABORT, 'PAPER-LEDGER-1: a stored body is immutable; provenance metadata may be set once');
END;

DROP TRIGGER paper_change_body_archive_no_update;
CREATE TRIGGER paper_change_body_archive_no_update BEFORE UPDATE ON paper_change_body_archive
WHEN NOT (
  NEW.seq IS OLD.seq
  AND NEW.r2_key IS OLD.r2_key
  AND NEW.bytes IS OLD.bytes
  AND NEW.fingerprint IS OLD.fingerprint
  AND NEW.archived_at IS OLD.archived_at
  AND OLD.metadata IS NULL
  AND NEW.metadata IS NOT NULL
  AND json_valid(NEW.metadata)
)
BEGIN
  SELECT RAISE(ABORT, 'PAPER-LEDGER-1: archive proofs are immutable; provenance metadata may be set once');
END;
