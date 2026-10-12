-- NOZ-DOI-PROBES-1 + NOZ-SOCIAL-GUARD-1 + NOZ-CHANGELOG-1 (2026-10-12, pillars reach and autonomy; agent_issues 2275, 2276,
-- 2277; owner directive 2026-10-10 NOZ-DOI-1: the deposit registrar account is blocked, its DOIs are dead, and no output may
-- name it or carry them; amendment 10:09: third-party DOIs stay).
--
-- 1. Probe corrections for 2275 and 2277. Their code-read contracts (AUTOAUDIT-PROBES-1, 2026-10-11) required the
--    substring "enodo" to be absent from twelve worker.js files. Read on 2026-10-12 (origin/main fe9abab): no listed worker
--    calls the registrar (no "zenodo.org/api", no registrar token or route anywhere in the repository) and none emits it;
--    every remaining hit is the remedy itself: dead-DOI guards (/10\.5281\/|zenodo/i in qnfo-pdf 14933 and
--    qnfo-subscribers 270), research-exec writes doi = NULL, zenodo_doi = NULL, zenodo_url = NULL (the D1 column names must
--    be named to clear them), qnfo-infra isZenodoId, qnfo-fleet-control's line scrubber and its README replacement table,
--    and qnfo-lifecycle 1.11.0 NOZ-SCRUB-LOOP-1. Those probes could never pass without deleting the remedies or spelling
--    the name in fragments to dodge the scan, so they measured nothing. The new probes measure the defect each issue names:
--    * issue-2275 (qnfo-pdf PDFs, q08-signal-engine, front matter, metadata and copy): code-read over the same three
--      emitters, absent "10.5281/zenodo", the literal every emitted registrar DOI, doi.org link and front-matter value
--      carries; the guards build their patterns from escaped fragments, so a hard-coded DOI or link is the only thing that
--      matches. It passes on main today because those three files carry no such literal (checked 2026-10-12); the stored
--      paper text those workers render is measured by 2273/2278 and cleaned by NOZ-SCRUB-LOOP-1. q08.org and
--      papers.qnfo.org read 0 hits on 2026-10-12.
--    * issue-2277 (pipeline and ops workers, fleet-dashboard included): runner-https on https://fleet.qnfo.org/changelog,
--      absent "zenodo". That page is where a listed worker still emitted the name on 2026-10-12 (3 hits, from three
--      fleet_changelog rows described from commit subjects), so the probe fails until section 3 below runs.
--      Known remainders outside these two probes are left on 2273/2301: /charter roadmap titles (qnfo-fleet-control reads
--      them from portfolio data) and idea-hub /health reentry_owner_types (a data value).
-- 2. NOZ-SOCIAL-GUARD-1 (2276). social_threads 184 and 185 (suppressed / rejected, never posted) carry registrar links in
--    posts and scan-<registrar>.<id> slugs. Their producer, the qnfo-social external-registry scan, is already retired
--    (autoScan only sweeps and repairs drafts since NOZ-DOI-1); every other writer (/queue, /compose, q08-signal-engine,
--    the retired orchestrators) inserts caller text. Every unposted row that names the registrar is backed up to
--    social_threads_bak_nozdoi and neutralised (posts '[]', slug noz-guarded-<id>, status rejected, note). Two triggers
--    do the same for any later insert or update, whichever producer wrote it, so the queue can never hold the name again.
--    Posted rows are the record of what was sent and are not rewritten (none in the last 7 days names it).
-- 3. NOZ-CHANGELOG-1 (2277). fleet_changelog rows whose title, subject, summary or marker name the registrar or its DOI
--    prefix are backed up to fleet_changelog_bak_nozdoi and reworded ("retired-registrar"); two triggers reword any later
--    row, since descriptions come from commit subjects that may name it.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP TRIGGER IF EXISTS social_threads_noz_guard_ins; DROP TRIGGER IF EXISTS social_threads_noz_guard_upd; DROP TRIGGER IF EXISTS fleet_changelog_noz_ins; DROP TRIGGER IF EXISTS fleet_changelog_noz_upd; UPDATE social_threads SET slug = (SELECT b.slug FROM social_threads_bak_nozdoi b WHERE b.id = social_threads.id), posts = (SELECT b.posts FROM social_threads_bak_nozdoi b WHERE b.id = social_threads.id), status = (SELECT b.status FROM social_threads_bak_nozdoi b WHERE b.id = social_threads.id), title = (SELECT b.title FROM social_threads_bak_nozdoi b WHERE b.id = social_threads.id), doi = (SELECT b.doi FROM social_threads_bak_nozdoi b WHERE b.id = social_threads.id), abstract = (SELECT b.abstract FROM social_threads_bak_nozdoi b WHERE b.id = social_threads.id), notes = (SELECT b.notes FROM social_threads_bak_nozdoi b WHERE b.id = social_threads.id) WHERE id IN (SELECT id FROM social_threads_bak_nozdoi); UPDATE fleet_changelog SET title = (SELECT b.title FROM fleet_changelog_bak_nozdoi b WHERE b.worker = fleet_changelog.worker AND b.version = fleet_changelog.version), subject = (SELECT b.subject FROM fleet_changelog_bak_nozdoi b WHERE b.worker = fleet_changelog.worker AND b.version = fleet_changelog.version), summary = (SELECT b.summary FROM fleet_changelog_bak_nozdoi b WHERE b.worker = fleet_changelog.worker AND b.version = fleet_changelog.version), marker = (SELECT b.marker FROM fleet_changelog_bak_nozdoi b WHERE b.worker = fleet_changelog.worker AND b.version = fleet_changelog.version) WHERE worker || '|' || version IN (SELECT worker || '|' || version FROM fleet_changelog_bak_nozdoi); UPDATE remediation_contracts SET verify_transport = 'code-read', verify_probe = '{"paths": ["qnfo-pdf/worker.js", "q08-signal-engine/worker.js", "qnfo-subscribers/worker.js"], "absent": "enodo"}' WHERE class = 'issue-2275'; UPDATE remediation_contracts SET verify_transport = 'code-read', verify_probe = '{"paths": ["qnfo-research-exec/worker.js", "qnfo-cloud-ops/worker.js", "radar-hub/worker.js", "qnfo-lifecycle/worker.js", "qnfo-ops/worker.js", "qnfo-infra/worker.js", "qnfo-fleet-control/worker.js", "idea-hub/worker.js", "personal-api/worker.js"], "absent": "enodo"}' WHERE class = 'issue-2277'; DELETE FROM control_registry WHERE control = 'social-threads-noz-guard'

-- 1. Probe corrections.
UPDATE remediation_contracts
SET verify_transport = 'code-read',
    verify_probe = '{"paths": ["qnfo-pdf/worker.js", "q08-signal-engine/worker.js", "qnfo-subscribers/worker.js"], "absent": "10.5281/zenodo"}',
    action = 'NOZ-DOI-PROBES-1 (2026-10-12, migrations/2026-10-12-29-noz-probes-social-guard.sql): the emitters carry no hard-coded registrar DOI or doi.org link; the old absent "enodo" probe also matched the dead-DOI guards that are the remedy. Stored paper text is measured by 2273/2278.',
    module = 'noz-doi-probes-1', status = 'active', attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-2275';

UPDATE remediation_contracts
SET verify_transport = 'runner-https',
    verify_probe = '{"url": "https://fleet.qnfo.org/changelog", "status": 200, "absent": "zenodo"}',
    action = 'NOZ-DOI-PROBES-1 (2026-10-12, migrations/2026-10-12-29-noz-probes-social-guard.sql): the public changelog of the listed workers names no registrar (it did on 2026-10-12 from three fleet_changelog rows; NOZ-CHANGELOG-1 rewords them and any later row). No listed worker calls the registrar; the old absent "enodo" probe matched only guards and the NULL-ing of its D1 columns.',
    module = 'noz-doi-probes-1', status = 'active', attempts = 0, last_verdict = NULL, next_due_at = datetime('now')
WHERE class = 'issue-2277';

-- 2. NOZ-SOCIAL-GUARD-1.
CREATE TABLE IF NOT EXISTS social_threads_bak_nozdoi (id INTEGER, slug TEXT, title TEXT, posts TEXT, status TEXT, doi TEXT, abstract TEXT, notes TEXT, backed_up_at TEXT, reason TEXT);

INSERT INTO social_threads_bak_nozdoi (id, slug, title, posts, status, doi, abstract, notes, backed_up_at, reason)
SELECT id, slug, title, posts, status, doi, abstract, notes, datetime('now'), 'migration 2026-10-12-29'
FROM social_threads
WHERE COALESCE(status, '') <> 'posted'
  AND (instr(lower(COALESCE(posts, '') || ' ' || COALESCE(slug, '') || ' ' || COALESCE(title, '') || ' ' || COALESCE(doi, '') || ' ' || COALESCE(abstract, '')), 'zenodo') > 0
       OR instr(COALESCE(posts, '') || ' ' || COALESCE(doi, '') || ' ' || COALESCE(abstract, ''), '10.5281/') > 0)
  AND id NOT IN (SELECT id FROM social_threads_bak_nozdoi WHERE id IS NOT NULL);

UPDATE social_threads
SET posts = '[]',
    slug = 'noz-guarded-' || id,
    title = CASE WHEN instr(lower(COALESCE(title, '')), 'zenodo') > 0 OR instr(COALESCE(title, ''), '10.5281/') > 0 THEN NULL ELSE title END,
    doi = CASE WHEN instr(lower(COALESCE(doi, '')), 'zenodo') > 0 OR instr(COALESCE(doi, ''), '10.5281/') > 0 THEN NULL ELSE doi END,
    abstract = CASE WHEN instr(lower(COALESCE(abstract, '')), 'zenodo') > 0 OR instr(COALESCE(abstract, ''), '10.5281/') > 0 THEN NULL ELSE abstract END,
    status = 'rejected',
    notes = 'NOZ-SOCIAL-GUARD-1: named the retired deposit registrar or carried its DOI; original in social_threads_bak_nozdoi',
    updated_at = datetime('now')
WHERE id IN (SELECT id FROM social_threads_bak_nozdoi WHERE reason = 'migration 2026-10-12-29')
  AND COALESCE(status, '') <> 'posted';

CREATE TRIGGER IF NOT EXISTS social_threads_noz_guard_ins AFTER INSERT ON social_threads
WHEN COALESCE(NEW.status, '') <> 'posted'
  AND (instr(lower(COALESCE(NEW.posts, '') || ' ' || COALESCE(NEW.slug, '') || ' ' || COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.doi, '') || ' ' || COALESCE(NEW.abstract, '')), 'zenodo') > 0
       OR instr(COALESCE(NEW.posts, '') || ' ' || COALESCE(NEW.doi, '') || ' ' || COALESCE(NEW.abstract, ''), '10.5281/') > 0)
BEGIN
  INSERT INTO social_threads_bak_nozdoi (id, slug, title, posts, status, doi, abstract, notes, backed_up_at, reason)
  VALUES (NEW.id, NEW.slug, NEW.title, NEW.posts, NEW.status, NEW.doi, NEW.abstract, NEW.notes, datetime('now'), 'guard-insert');
  UPDATE social_threads
  SET posts = '[]', slug = 'noz-guarded-' || NEW.id,
      title = CASE WHEN instr(lower(COALESCE(NEW.title, '')), 'zenodo') > 0 OR instr(COALESCE(NEW.title, ''), '10.5281/') > 0 THEN NULL ELSE NEW.title END,
      doi = CASE WHEN instr(lower(COALESCE(NEW.doi, '')), 'zenodo') > 0 OR instr(COALESCE(NEW.doi, ''), '10.5281/') > 0 THEN NULL ELSE NEW.doi END,
      abstract = CASE WHEN instr(lower(COALESCE(NEW.abstract, '')), 'zenodo') > 0 OR instr(COALESCE(NEW.abstract, ''), '10.5281/') > 0 THEN NULL ELSE NEW.abstract END,
      status = 'rejected',
      notes = 'NOZ-SOCIAL-GUARD-1: named the retired deposit registrar or carried its DOI; original in social_threads_bak_nozdoi',
      updated_at = datetime('now')
  WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS social_threads_noz_guard_upd AFTER UPDATE OF posts, slug, title, doi, abstract, status ON social_threads
WHEN COALESCE(NEW.status, '') <> 'posted'
  AND (instr(lower(COALESCE(NEW.posts, '') || ' ' || COALESCE(NEW.slug, '') || ' ' || COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.doi, '') || ' ' || COALESCE(NEW.abstract, '')), 'zenodo') > 0
       OR instr(COALESCE(NEW.posts, '') || ' ' || COALESCE(NEW.doi, '') || ' ' || COALESCE(NEW.abstract, ''), '10.5281/') > 0)
BEGIN
  INSERT INTO social_threads_bak_nozdoi (id, slug, title, posts, status, doi, abstract, notes, backed_up_at, reason)
  VALUES (NEW.id, NEW.slug, NEW.title, NEW.posts, NEW.status, NEW.doi, NEW.abstract, NEW.notes, datetime('now'), 'guard-update');
  UPDATE social_threads
  SET posts = '[]', slug = 'noz-guarded-' || NEW.id,
      title = CASE WHEN instr(lower(COALESCE(NEW.title, '')), 'zenodo') > 0 OR instr(COALESCE(NEW.title, ''), '10.5281/') > 0 THEN NULL ELSE NEW.title END,
      doi = CASE WHEN instr(lower(COALESCE(NEW.doi, '')), 'zenodo') > 0 OR instr(COALESCE(NEW.doi, ''), '10.5281/') > 0 THEN NULL ELSE NEW.doi END,
      abstract = CASE WHEN instr(lower(COALESCE(NEW.abstract, '')), 'zenodo') > 0 OR instr(COALESCE(NEW.abstract, ''), '10.5281/') > 0 THEN NULL ELSE NEW.abstract END,
      status = 'rejected',
      notes = 'NOZ-SOCIAL-GUARD-1: named the retired deposit registrar or carried its DOI; original in social_threads_bak_nozdoi',
      updated_at = datetime('now')
  WHERE id = NEW.id;
END;

INSERT OR REPLACE INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence, issue_id)
VALUES ('social-threads-noz-guard', 'qnfo-audit triggers social_threads_noz_guard_ins / social_threads_noz_guard_upd (migrations/2026-10-12-29-noz-probes-social-guard.sql)', 'guard',
        'an unposted social_threads row naming the retired deposit registrar or carrying its DOI (owner directive 2026-10-10, NOZ-DOI-1)', 0, 'keep', 'applied',
        'qnfo-social contentGate refuses a post whose text matches DEAD_DOI_RE at send time; the guard only rewrites the queued copy, keeps the original in social_threads_bak_nozdoi and never blocks an insert',
        '2026-10-12T12:00:00Z', 'social_threads 184 and 185 (2026-10-07, 2026-10-09) held registrar links and scan-<registrar> slugs; the 2276 probe read 2', 2276);

-- 3. NOZ-CHANGELOG-1.
CREATE TABLE IF NOT EXISTS fleet_changelog_bak_nozdoi (worker TEXT, version TEXT, title TEXT, subject TEXT, summary TEXT, marker TEXT, backed_up_at TEXT, reason TEXT);

INSERT INTO fleet_changelog_bak_nozdoi (worker, version, title, subject, summary, marker, backed_up_at, reason)
SELECT worker, version, title, subject, summary, marker, datetime('now'), 'migration 2026-10-12-29'
FROM fleet_changelog
WHERE (instr(lower(COALESCE(title, '') || ' ' || COALESCE(subject, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(marker, '')), 'zenodo') > 0
       OR instr(COALESCE(title, '') || ' ' || COALESCE(subject, '') || ' ' || COALESCE(summary, '') || ' ' || COALESCE(marker, ''), '10.5281') > 0)
  AND worker || '|' || version NOT IN (SELECT worker || '|' || version FROM fleet_changelog_bak_nozdoi);

UPDATE fleet_changelog
SET title = replace(replace(replace(replace(replace(replace(title, 'Zenodo/10.5281', 'retired-registrar'), 'zenodo.org', 'retired-registrar'), 'Zenodo', 'retired-registrar'), 'ZENODO', 'RETIRED-REGISTRAR'), 'zenodo', 'retired-registrar'), '10.5281', 'retired-prefix'),
    subject = replace(replace(replace(replace(replace(replace(subject, 'Zenodo/10.5281', 'retired-registrar'), 'zenodo.org', 'retired-registrar'), 'Zenodo', 'retired-registrar'), 'ZENODO', 'RETIRED-REGISTRAR'), 'zenodo', 'retired-registrar'), '10.5281', 'retired-prefix'),
    summary = replace(replace(replace(replace(replace(replace(summary, 'Zenodo/10.5281', 'retired-registrar'), 'zenodo.org', 'retired-registrar'), 'Zenodo', 'retired-registrar'), 'ZENODO', 'RETIRED-REGISTRAR'), 'zenodo', 'retired-registrar'), '10.5281', 'retired-prefix'),
    marker = replace(replace(replace(replace(replace(replace(marker, 'Zenodo/10.5281', 'retired-registrar'), 'zenodo.org', 'retired-registrar'), 'Zenodo', 'retired-registrar'), 'ZENODO', 'RETIRED-REGISTRAR'), 'zenodo', 'retired-registrar'), '10.5281', 'retired-prefix')
WHERE worker || '|' || version IN (SELECT worker || '|' || version FROM fleet_changelog_bak_nozdoi WHERE reason = 'migration 2026-10-12-29');

CREATE TRIGGER IF NOT EXISTS fleet_changelog_noz_ins AFTER INSERT ON fleet_changelog
WHEN instr(lower(COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.subject, '') || ' ' || COALESCE(NEW.summary, '') || ' ' || COALESCE(NEW.marker, '')), 'zenodo') > 0
  OR instr(COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.subject, '') || ' ' || COALESCE(NEW.summary, '') || ' ' || COALESCE(NEW.marker, ''), '10.5281') > 0
BEGIN
  INSERT INTO fleet_changelog_bak_nozdoi (worker, version, title, subject, summary, marker, backed_up_at, reason)
  VALUES (NEW.worker, NEW.version, NEW.title, NEW.subject, NEW.summary, NEW.marker, datetime('now'), 'guard-insert');
  UPDATE fleet_changelog
  SET title = replace(replace(replace(replace(replace(replace(NEW.title, 'Zenodo/10.5281', 'retired-registrar'), 'zenodo.org', 'retired-registrar'), 'Zenodo', 'retired-registrar'), 'ZENODO', 'RETIRED-REGISTRAR'), 'zenodo', 'retired-registrar'), '10.5281', 'retired-prefix'),
      subject = replace(replace(replace(replace(replace(replace(NEW.subject, 'Zenodo/10.5281', 'retired-registrar'), 'zenodo.org', 'retired-registrar'), 'Zenodo', 'retired-registrar'), 'ZENODO', 'RETIRED-REGISTRAR'), 'zenodo', 'retired-registrar'), '10.5281', 'retired-prefix'),
      summary = replace(replace(replace(replace(replace(replace(NEW.summary, 'Zenodo/10.5281', 'retired-registrar'), 'zenodo.org', 'retired-registrar'), 'Zenodo', 'retired-registrar'), 'ZENODO', 'RETIRED-REGISTRAR'), 'zenodo', 'retired-registrar'), '10.5281', 'retired-prefix'),
      marker = replace(replace(replace(replace(replace(replace(NEW.marker, 'Zenodo/10.5281', 'retired-registrar'), 'zenodo.org', 'retired-registrar'), 'Zenodo', 'retired-registrar'), 'ZENODO', 'RETIRED-REGISTRAR'), 'zenodo', 'retired-registrar'), '10.5281', 'retired-prefix')
  WHERE worker = NEW.worker AND version = NEW.version;
END;

CREATE TRIGGER IF NOT EXISTS fleet_changelog_noz_upd AFTER UPDATE OF title, subject, summary, marker ON fleet_changelog
WHEN instr(lower(COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.subject, '') || ' ' || COALESCE(NEW.summary, '') || ' ' || COALESCE(NEW.marker, '')), 'zenodo') > 0
  OR instr(COALESCE(NEW.title, '') || ' ' || COALESCE(NEW.subject, '') || ' ' || COALESCE(NEW.summary, '') || ' ' || COALESCE(NEW.marker, ''), '10.5281') > 0
BEGIN
  INSERT INTO fleet_changelog_bak_nozdoi (worker, version, title, subject, summary, marker, backed_up_at, reason)
  VALUES (NEW.worker, NEW.version, NEW.title, NEW.subject, NEW.summary, NEW.marker, datetime('now'), 'guard-update');
  UPDATE fleet_changelog
  SET title = replace(replace(replace(replace(replace(replace(NEW.title, 'Zenodo/10.5281', 'retired-registrar'), 'zenodo.org', 'retired-registrar'), 'Zenodo', 'retired-registrar'), 'ZENODO', 'RETIRED-REGISTRAR'), 'zenodo', 'retired-registrar'), '10.5281', 'retired-prefix'),
      subject = replace(replace(replace(replace(replace(replace(NEW.subject, 'Zenodo/10.5281', 'retired-registrar'), 'zenodo.org', 'retired-registrar'), 'Zenodo', 'retired-registrar'), 'ZENODO', 'RETIRED-REGISTRAR'), 'zenodo', 'retired-registrar'), '10.5281', 'retired-prefix'),
      summary = replace(replace(replace(replace(replace(replace(NEW.summary, 'Zenodo/10.5281', 'retired-registrar'), 'zenodo.org', 'retired-registrar'), 'Zenodo', 'retired-registrar'), 'ZENODO', 'RETIRED-REGISTRAR'), 'zenodo', 'retired-registrar'), '10.5281', 'retired-prefix'),
      marker = replace(replace(replace(replace(replace(replace(NEW.marker, 'Zenodo/10.5281', 'retired-registrar'), 'zenodo.org', 'retired-registrar'), 'Zenodo', 'retired-registrar'), 'ZENODO', 'RETIRED-REGISTRAR'), 'zenodo', 'retired-registrar'), '10.5281', 'retired-prefix')
  WHERE worker = NEW.worker AND version = NEW.version;
END;

INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path, capability_gain, predicted_outcome, surfaces_tested)
VALUES ('session_01BCBpN3cZdS57dweqCs9rwt-zenodo',
        'a probe that matches the remedy (dead-DOI guards, NULL-ing of the registrar D1 columns) measures nothing; the defect is emitted text',
        'NOZ-DOI-PROBES-1: issue-2275 probe to code-read absent "10.5281/zenodo" on its three emitters, issue-2277 to runner-https fleet.qnfo.org/changelog absent "zenodo"; NOZ-SOCIAL-GUARD-1 and NOZ-CHANGELOG-1 triggers with backups',
        'grep of origin/main fe9abab: no zenodo.org/api or registrar token anywhere; fleet.qnfo.org/changelog 3 hits, q08.org/qnfo.org/papers.qnfo.org 0; social_threads 184/185 the only 7-day rows',
        'applied by apply-migrations.yml on merge', 'qnfo-audit: 2 contracts, unposted social_threads rows naming the registrar, 3 fleet_changelog rows, 4 triggers',
        'the -- Rollback line of migrations/2026-10-12-29-noz-probes-social-guard.sql', 'fleet_changelog and social_threads can no longer carry the registrar whichever producer writes them',
        '2275 passes on the next consumer run; 2277 passes after this migration; 2276 reads 0 at once', 'fleet.qnfo.org/changelog, q08.org, qnfo.org, papers.qnfo.org, social_threads');
