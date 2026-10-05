-- GUARD-TRIGGER-ORDER-1 + GUARD-SHADOW-DROP-1 (2026-10-05, agent_issues #1629, charter pillar: security).
-- Applied live 2026-10-05 ~19:35Z by session_01KzS1yjXATqG3KDBSEyNTAs. Found by the offline negative tests
-- (scripts/guard-registry-negative-tests.mjs, GUARD-VERIFY-OFFLINE-1).
--
-- 1. living-paper (70a58cb3-b2cd-498d-877f-ecca86859a22): trg_papers_doi_converge_ins (sqlite_master rowid 62) fired before
--    papers_ai (rowid 9; SQLite runs the newest trigger first). Its UPDATE ran papers_au, whose FTS5 'delete' targeted a row
--    papers_ai had not indexed yet, so INSERT of a paper with a Zenodo DOI and missing or inconsistent zenodo fields failed
--    with SQLITE_CORRUPT_VTAB ("database disk image is malformed"). Reproduced in node:sqlite with the live DDL; with
--    papers_ai re-created after the converge trigger the insert passes, the zenodo fields converge, FTS finds the row and
--    the FTS5 integrity-check passes. Repair: re-create papers_ai with identical DDL (now rowid 73). Live papers_fts
--    integrity-check passed after the change. Old trigger order: living-paper bak_20261005_papers_trigger_ddl.
--    A future re-creation of trg_papers_doi_converge_ins must be followed by re-creating papers_ai again.
DROP TRIGGER IF EXISTS papers_ai;
CREATE TRIGGER papers_ai AFTER INSERT ON papers BEGIN
  INSERT INTO papers_fts(rowid, title, abstract) VALUES (new.rowid, new.title, new.abstract);
END;
--
-- 2. qnfo-audit: self_heal_reap_stale_ins (12h, REAPER-SELFHEAL-STALE-1) is fully shadowed by self_heal_reap_stale_v2_ins
--    (2h, REAPER-SELFHEAL-STALE-2): same event, same WHEN, same UPDATE, stricter age, created later so it fires first. Every
--    row older than 12h is older than 2h, so v1's outcome never occurs. Dropped; v2 keeps the enforcement. Its guard_registry
--    row was removed (the #1629 definition of done: verified by a negative test, or the row is removed); the row is kept in
--    qnfo-audit bak_20261005_guard_registry_3 and the DDL in bak_20261005_trigger_ddl.
--    (Run against qnfo-audit, not living-paper.)
-- DROP TRIGGER IF EXISTS self_heal_reap_stale_ins;
--
-- Rollback: re-create the dropped trigger from bak_20261005_trigger_ddl; for 1, no rollback is needed (identical DDL).
