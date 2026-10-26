-- APPLY-BY: manual (living-paper DDL: applied through the Cloudflare D1 API by the session after a scratch-D1 test; the qnfo-audit runner cannot target living-paper)
-- DB: living-paper
-- Rollback: DROP TRIGGER IF EXISTS paper_ledger_ai; DROP TRIGGER IF EXISTS paper_ledger_au; DROP TRIGGER IF EXISTS paper_ledger_ad; DROP TRIGGER IF EXISTS trg_papers_mass_withdraw_guard; DROP TRIGGER IF EXISTS trg_papers_mass_delete_guard; the ledger, body, archive and override tables are never dropped (they are the audit trail); the two ALTER TABLE columns stay.
-- PAPER-LEDGER-1 + PAPER-WITHDRAW-GUARD-1 (2026-10-26, charter pillars research and reach; owner directive 2026-10-26: "papers should never disappear en masse; versioning needs to preserve changes across multiple revisions for auditing and provenance").
--
-- What was wrong (measured in living-paper on 2026-10-26):
--   * papers_version_archive_upd and papers_version_archive_ver insert into paper_version_history only WHERE NOT EXISTS (same slug AND same version), so a
--     paper edited several times at one version keeps ONE earlier body: 140 (slug, version) pairs had been edited more than once in two days (up to 4 times);
--     134 papers revised since 1 October have no history row; 68 papers claim more versions than were ever archived.
--   * paper_body_backups (since 2026-10-24) keeps every replaced body but records no actor, no reason, no status, title, abstract or metadata change.
--   * A status change records nothing outside the writer's own audit table; a DELETE leaves nothing; nothing limits how many papers one writer can withdraw.
--
-- What this adds:
--   * paper_change_ledger: one immutable row per change to a paper (insert, update, delete): fields changed, before and after for version, status, gate
--     reason, body length and fingerprint, the prior title, abstract and metadata, the actor and the reason. paper_change_bodies keeps the full prior body
--     (seq-keyed); a body row can be removed only after paper_change_body_archive holds proof of an off-database copy (same byte count). Ledger rows, archive
--     rows and override rows can never be updated or deleted.
--   * papers.change_actor and papers.change_reason: a writer sets them in the same UPDATE ("<worker>:<run id>", a reason that differs from the last one). A
--     change that does not set them is recorded as actor "unattributed", which v_paper_ledger_health counts, so a writer that has not adopted this is visible.
--   * trg_papers_mass_withdraw_guard / trg_papers_mass_delete_guard: no writer can move more than 25 papers in an hour (80 in 24 hours) out of
--     published, distributed or external_preprint, and no more than 5 deletes an hour, unless paper_withdrawal_override holds an unexpired, reasoned row
--     (at most 500 papers, at most 24 hours). The refusal is RAISE(ABORT) and names the cap, so the batch fails whole and says why.
--   * Backfill: paper_body_backups (every replaced body since 2026-10-24), the 364 gate demotions of 2026-10-25/26 and the 2026-10-26 repair.
--
-- The ledger counts only withdrawals written by the live trigger (withdrawal = 1); backfilled rows carry backfilled = 1 and withdrawal = 0 so the incident
-- of 2026-10-25 does not freeze legitimate withdrawals for a day.

ALTER TABLE papers ADD COLUMN change_actor TEXT;

ALTER TABLE papers ADD COLUMN change_reason TEXT;

CREATE TABLE IF NOT EXISTS paper_change_ledger (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  slug TEXT NOT NULL,
  slug_before TEXT,
  identifier TEXT,
  kind TEXT NOT NULL CHECK (kind IN ('insert', 'update', 'delete')),
  fields_changed TEXT NOT NULL,
  actor TEXT NOT NULL,
  reason TEXT,
  withdrawal INTEGER NOT NULL DEFAULT 0,
  backfilled INTEGER NOT NULL DEFAULT 0,
  version_before TEXT,
  version_after TEXT,
  status_before TEXT,
  status_after TEXT,
  gate_reason_before TEXT,
  gate_reason_after TEXT,
  title_before TEXT,
  abstract_before TEXT,
  body_len_before INTEGER,
  body_fp_before TEXT,
  body_len_after INTEGER,
  body_fp_after TEXT,
  meta_before TEXT
);

CREATE INDEX IF NOT EXISTS idx_pcl_slug ON paper_change_ledger (slug, seq);

CREATE INDEX IF NOT EXISTS idx_pcl_ts ON paper_change_ledger (ts);

CREATE INDEX IF NOT EXISTS idx_pcl_withdrawal ON paper_change_ledger (withdrawal, ts);

CREATE INDEX IF NOT EXISTS idx_pcl_kind ON paper_change_ledger (kind, ts);

CREATE TABLE IF NOT EXISTS paper_change_bodies (
  seq INTEGER PRIMARY KEY,
  slug TEXT NOT NULL,
  body_md TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS paper_change_body_archive (
  seq INTEGER PRIMARY KEY,
  r2_key TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  fingerprint TEXT NOT NULL,
  archived_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS paper_withdrawal_override (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  expires_at TEXT NOT NULL,
  max_papers INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_by TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'withdraw' CHECK (scope IN ('withdraw', 'delete'))
);

CREATE TRIGGER IF NOT EXISTS paper_change_ledger_no_update BEFORE UPDATE ON paper_change_ledger
BEGIN SELECT RAISE(ABORT, 'PAPER-LEDGER-1: paper_change_ledger is append-only; insert a correcting row instead'); END;

CREATE TRIGGER IF NOT EXISTS paper_change_ledger_no_delete BEFORE DELETE ON paper_change_ledger
BEGIN SELECT RAISE(ABORT, 'PAPER-LEDGER-1: paper_change_ledger is append-only; rows are never deleted'); END;

CREATE TRIGGER IF NOT EXISTS paper_change_bodies_no_update BEFORE UPDATE ON paper_change_bodies
BEGIN SELECT RAISE(ABORT, 'PAPER-LEDGER-1: a stored body is never edited'); END;

CREATE TRIGGER IF NOT EXISTS paper_change_bodies_delete_needs_archive BEFORE DELETE ON paper_change_bodies
WHEN NOT EXISTS (SELECT 1 FROM paper_change_body_archive a WHERE a.seq = OLD.seq AND a.bytes = length(OLD.body_md))
BEGIN SELECT RAISE(ABORT, 'PAPER-LEDGER-1: a stored body is removed only after paper_change_body_archive holds an off-database copy of the same size'); END;

CREATE TRIGGER IF NOT EXISTS paper_change_body_archive_no_update BEFORE UPDATE ON paper_change_body_archive
BEGIN SELECT RAISE(ABORT, 'PAPER-LEDGER-1: archive proofs are append-only'); END;

CREATE TRIGGER IF NOT EXISTS paper_change_body_archive_no_delete BEFORE DELETE ON paper_change_body_archive
BEGIN SELECT RAISE(ABORT, 'PAPER-LEDGER-1: archive proofs are append-only'); END;

CREATE TRIGGER IF NOT EXISTS paper_withdrawal_override_no_update BEFORE UPDATE ON paper_withdrawal_override
BEGIN SELECT RAISE(ABORT, 'PAPER-WITHDRAW-GUARD-1: overrides are append-only; let it expire'); END;

CREATE TRIGGER IF NOT EXISTS paper_withdrawal_override_no_delete BEFORE DELETE ON paper_withdrawal_override
BEGIN SELECT RAISE(ABORT, 'PAPER-WITHDRAW-GUARD-1: overrides are append-only; let it expire'); END;

CREATE TRIGGER IF NOT EXISTS paper_withdrawal_override_valid BEFORE INSERT ON paper_withdrawal_override
WHEN trim(COALESCE(NEW.reason, '')) = '' OR trim(COALESCE(NEW.created_by, '')) = '' OR NEW.max_papers < 1 OR NEW.max_papers > 500
  OR NEW.expires_at <= strftime('%Y-%m-%dT%H:%M:%fZ', 'now') OR NEW.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+24 hours')
BEGIN SELECT RAISE(ABORT, 'PAPER-WITHDRAW-GUARD-1: an override needs a reason, a creator, 1 to 500 papers and an expiry within 24 hours'); END;

CREATE TRIGGER IF NOT EXISTS paper_ledger_ai AFTER INSERT ON papers
BEGIN
  INSERT INTO paper_change_ledger (slug, identifier, kind, fields_changed, actor, reason, version_after, status_after, gate_reason_after, body_len_after, body_fp_after)
  VALUES (NEW.slug, NEW.identifier, 'insert', 'new', COALESCE(NULLIF(NEW.change_actor, ''), 'unattributed'), NEW.change_reason, NEW.version, NEW.status, NEW.release_gate_reason,
          length(NEW.body_md), CASE WHEN NEW.body_md IS NULL THEN NULL ELSE length(NEW.body_md) || ':' || substr(NEW.body_md, 1, 40) || '..' || substr(NEW.body_md, -40) END);
END;

CREATE TRIGGER IF NOT EXISTS paper_ledger_au AFTER UPDATE ON papers
WHEN OLD.body_md IS NOT NEW.body_md OR OLD.status IS NOT NEW.status OR OLD.version IS NOT NEW.version OR OLD.title IS NOT NEW.title
  OR OLD.abstract IS NOT NEW.abstract OR OLD.slug IS NOT NEW.slug OR OLD.identifier IS NOT NEW.identifier OR OLD.authors IS NOT NEW.authors
  OR OLD.doi IS NOT NEW.doi OR OLD.zenodo_doi IS NOT NEW.zenodo_doi OR OLD.license IS NOT NEW.license OR OLD.keywords IS NOT NEW.keywords
  OR OLD.paper_type IS NOT NEW.paper_type OR OLD.journal IS NOT NEW.journal OR OLD.subtitle IS NOT NEW.subtitle OR OLD.categories IS NOT NEW.categories
  OR OLD."references" IS NOT NEW."references"
BEGIN
  INSERT INTO paper_change_ledger (slug, slug_before, identifier, kind, fields_changed, actor, reason, withdrawal, version_before, version_after, status_before, status_after,
                                   gate_reason_before, gate_reason_after, title_before, abstract_before, body_len_before, body_fp_before, body_len_after, body_fp_after, meta_before)
  VALUES (
    NEW.slug,
    CASE WHEN OLD.slug IS NOT NEW.slug THEN OLD.slug END,
    NEW.identifier,
    'update',
    rtrim(CASE WHEN OLD.body_md IS NOT NEW.body_md THEN 'body_md,' ELSE '' END || CASE WHEN OLD.status IS NOT NEW.status THEN 'status,' ELSE '' END
       || CASE WHEN OLD.version IS NOT NEW.version THEN 'version,' ELSE '' END || CASE WHEN OLD.title IS NOT NEW.title THEN 'title,' ELSE '' END
       || CASE WHEN OLD.abstract IS NOT NEW.abstract THEN 'abstract,' ELSE '' END || CASE WHEN OLD.slug IS NOT NEW.slug THEN 'slug,' ELSE '' END
       || CASE WHEN OLD.identifier IS NOT NEW.identifier THEN 'identifier,' ELSE '' END || CASE WHEN OLD.authors IS NOT NEW.authors THEN 'authors,' ELSE '' END
       || CASE WHEN OLD.doi IS NOT NEW.doi THEN 'doi,' ELSE '' END || CASE WHEN OLD.zenodo_doi IS NOT NEW.zenodo_doi THEN 'zenodo_doi,' ELSE '' END
       || CASE WHEN OLD.license IS NOT NEW.license THEN 'license,' ELSE '' END || CASE WHEN OLD.keywords IS NOT NEW.keywords THEN 'keywords,' ELSE '' END
       || CASE WHEN OLD.paper_type IS NOT NEW.paper_type THEN 'paper_type,' ELSE '' END || CASE WHEN OLD.journal IS NOT NEW.journal THEN 'journal,' ELSE '' END
       || CASE WHEN OLD.subtitle IS NOT NEW.subtitle THEN 'subtitle,' ELSE '' END || CASE WHEN OLD.categories IS NOT NEW.categories THEN 'categories,' ELSE '' END
       || CASE WHEN OLD."references" IS NOT NEW."references" THEN 'references,' ELSE '' END, ','),
    CASE WHEN NEW.change_actor IS NOT NULL AND trim(NEW.change_actor) <> '' AND (NEW.change_actor IS NOT OLD.change_actor OR NEW.change_reason IS NOT OLD.change_reason)
         THEN NEW.change_actor ELSE 'unattributed' END,
    CASE WHEN NEW.change_actor IS NOT NULL AND (NEW.change_actor IS NOT OLD.change_actor OR NEW.change_reason IS NOT OLD.change_reason) THEN NEW.change_reason END,
    CASE WHEN OLD.status IN ('published', 'distributed', 'external_preprint') AND COALESCE(NEW.status, '') NOT IN ('published', 'distributed', 'external_preprint') THEN 1 ELSE 0 END,
    OLD.version, NEW.version, OLD.status, NEW.status, OLD.release_gate_reason, NEW.release_gate_reason,
    CASE WHEN OLD.title IS NOT NEW.title THEN OLD.title END,
    CASE WHEN OLD.abstract IS NOT NEW.abstract THEN OLD.abstract END,
    length(OLD.body_md),
    CASE WHEN OLD.body_md IS NULL THEN NULL ELSE length(OLD.body_md) || ':' || substr(OLD.body_md, 1, 40) || '..' || substr(OLD.body_md, -40) END,
    length(NEW.body_md),
    CASE WHEN NEW.body_md IS NULL THEN NULL ELSE length(NEW.body_md) || ':' || substr(NEW.body_md, 1, 40) || '..' || substr(NEW.body_md, -40) END,
    CASE WHEN OLD.authors IS NOT NEW.authors OR OLD.doi IS NOT NEW.doi OR OLD.zenodo_doi IS NOT NEW.zenodo_doi OR OLD.license IS NOT NEW.license OR OLD.keywords IS NOT NEW.keywords
              OR OLD.paper_type IS NOT NEW.paper_type OR OLD.journal IS NOT NEW.journal OR OLD.subtitle IS NOT NEW.subtitle OR OLD.categories IS NOT NEW.categories
              OR OLD."references" IS NOT NEW."references"
         THEN json_object('authors', OLD.authors, 'doi', OLD.doi, 'zenodo_doi', OLD.zenodo_doi, 'license', OLD.license, 'keywords', OLD.keywords, 'paper_type', OLD.paper_type,
                          'journal', OLD.journal, 'subtitle', OLD.subtitle, 'categories', OLD.categories, 'references', OLD."references") END
  );
  INSERT INTO paper_change_bodies (seq, slug, body_md)
  SELECT last_insert_rowid(), OLD.slug, OLD.body_md WHERE OLD.body_md IS NOT NULL AND OLD.body_md IS NOT NEW.body_md;
END;

CREATE TRIGGER IF NOT EXISTS paper_ledger_ad AFTER DELETE ON papers
BEGIN
  INSERT INTO paper_change_ledger (slug, identifier, kind, fields_changed, actor, reason, withdrawal, version_before, status_before, gate_reason_before, title_before, abstract_before,
                                   body_len_before, body_fp_before, meta_before)
  VALUES (OLD.slug, OLD.identifier, 'delete', 'row', 'unattributed', 'DELETE FROM papers',
          CASE WHEN OLD.status IN ('published', 'distributed', 'external_preprint') THEN 1 ELSE 0 END,
          OLD.version, OLD.status, OLD.release_gate_reason, OLD.title, OLD.abstract, length(OLD.body_md),
          CASE WHEN OLD.body_md IS NULL THEN NULL ELSE length(OLD.body_md) || ':' || substr(OLD.body_md, 1, 40) || '..' || substr(OLD.body_md, -40) END,
          json_object('authors', OLD.authors, 'doi', OLD.doi, 'zenodo_doi', OLD.zenodo_doi, 'license', OLD.license, 'keywords', OLD.keywords, 'paper_type', OLD.paper_type,
                      'journal', OLD.journal, 'subtitle', OLD.subtitle, 'categories', OLD.categories, 'references', OLD."references"));
  INSERT INTO paper_change_bodies (seq, slug, body_md)
  SELECT last_insert_rowid(), OLD.slug, OLD.body_md WHERE OLD.body_md IS NOT NULL;
END;

CREATE TRIGGER IF NOT EXISTS trg_papers_mass_withdraw_guard BEFORE UPDATE OF status ON papers
FOR EACH ROW
WHEN OLD.status IN ('published', 'distributed', 'external_preprint') AND COALESCE(NEW.status, '') NOT IN ('published', 'distributed', 'external_preprint')
  AND ((SELECT COUNT(*) FROM paper_change_ledger WHERE withdrawal = 1 AND ts >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-60 minutes'))
         >= COALESCE((SELECT MAX(max_papers) FROM paper_withdrawal_override WHERE scope = 'withdraw' AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), 25)
    OR (SELECT COUNT(*) FROM paper_change_ledger WHERE withdrawal = 1 AND ts >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours'))
         >= COALESCE((SELECT MAX(max_papers) FROM paper_withdrawal_override WHERE scope = 'withdraw' AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), 80))
BEGIN SELECT RAISE(ABORT, 'MASS-WITHDRAWAL-BLOCKED PAPER-WITHDRAW-GUARD-1: more than 25 papers in an hour or 80 in a day have left public status; papers do not disappear en masse. A reasoned, expiring row in paper_withdrawal_override (at most 500 papers, 24 hours) lifts the cap.'); END;

CREATE TRIGGER IF NOT EXISTS trg_papers_mass_delete_guard BEFORE DELETE ON papers
FOR EACH ROW
WHEN (SELECT COUNT(*) FROM paper_change_ledger WHERE kind = 'delete' AND ts >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-60 minutes'))
       >= COALESCE((SELECT MAX(max_papers) FROM paper_withdrawal_override WHERE scope = 'delete' AND expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), 5)
BEGIN SELECT RAISE(ABORT, 'MASS-DELETE-BLOCKED PAPER-WITHDRAW-GUARD-1: more than 5 papers deleted in an hour; a paper row is deleted only a few at a time. A reasoned, expiring row in paper_withdrawal_override with scope delete lifts the cap.'); END;

CREATE VIEW IF NOT EXISTS v_paper_revisions AS
SELECT seq, ts, slug, slug_before, kind, fields_changed, actor, reason, backfilled,
       version_before, version_after, status_before, status_after,
       body_len_before, body_len_after,
       CASE WHEN body_len_before IS NOT NULL AND body_len_after IS NOT NULL THEN body_len_after - body_len_before END AS body_len_delta,
       gate_reason_before, gate_reason_after,
       EXISTS (SELECT 1 FROM paper_change_bodies b WHERE b.seq = paper_change_ledger.seq) AS body_kept
FROM paper_change_ledger;

CREATE VIEW IF NOT EXISTS v_paper_withdrawals_24h AS
SELECT actor, COUNT(*) AS papers, MIN(ts) AS first_ts, MAX(ts) AS last_ts, GROUP_CONCAT(DISTINCT status_after) AS to_status
FROM paper_change_ledger
WHERE withdrawal = 1 AND ts >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')
GROUP BY actor;

CREATE VIEW IF NOT EXISTS v_paper_ledger_health AS
SELECT
  (SELECT COUNT(*) FROM paper_change_ledger) AS ledger_rows,
  (SELECT COUNT(*) FROM paper_change_ledger WHERE backfilled = 0 AND ts >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')) AS changes_24h,
  (SELECT COUNT(*) FROM paper_change_ledger WHERE backfilled = 0 AND actor = 'unattributed' AND ts >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')) AS unattributed_24h,
  (SELECT COUNT(*) FROM paper_change_ledger WHERE withdrawal = 1 AND ts >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-60 minutes')) AS withdrawals_1h,
  (SELECT COUNT(*) FROM paper_change_ledger WHERE withdrawal = 1 AND ts >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-24 hours')) AS withdrawals_24h,
  (SELECT COUNT(*) FROM paper_change_bodies) AS bodies_kept,
  (SELECT COUNT(*) FROM paper_change_body_archive) AS bodies_archived,
  (SELECT MAX(ts) FROM paper_change_ledger WHERE backfilled = 0) AS last_live_change;

INSERT INTO paper_change_ledger (seq, ts, slug, kind, fields_changed, actor, reason, backfilled, version_before, status_before, title_before, body_len_before, body_fp_before)
SELECT id, replace(captured_at, ' ', 'T') || '.000Z', slug, 'update', 'body_md', 'backfill:paper_body_backups', reason, 1, version, status, title, length(body_md),
       length(body_md) || ':' || substr(body_md, 1, 40) || '..' || substr(body_md, -40)
FROM paper_body_backups;

INSERT INTO paper_change_bodies (seq, slug, body_md)
SELECT id, slug, body_md FROM paper_body_backups;

INSERT INTO paper_change_ledger (ts, slug, identifier, kind, fields_changed, actor, reason, backfilled, status_before, status_after, gate_reason_after)
SELECT replace(a.run_at, ' ', 'T') || '.000Z', a.slug, p.identifier, 'update', 'status,release_gate_reason',
       'qnfo-cloud-ops:' || a.run_id || ':' || a.gate_version, 'publication gate demote (backfilled from publication_gate_audit): ' || a.reason, 1,
       'published', 'quarantined', a.reason
FROM publication_gate_audit a LEFT JOIN papers p ON p.slug = a.slug
WHERE a.decision = 'demote' AND a.status = 'quarantined' AND a.gate_version = 'pub-gate-v2-structure';
