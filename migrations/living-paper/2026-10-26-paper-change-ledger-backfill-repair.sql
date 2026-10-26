-- APPLY-BY: manual (living-paper data backfill: applied through the Cloudflare D1 API by the session after the ledger DDL; the qnfo-audit runner cannot target living-paper)
-- DB: living-paper
-- Rollback: none needed: ledger rows are append-only by design; a wrong backfilled row is corrected by inserting a correcting row (backfilled = 1) that says so.
-- PAPER-LEDGER-1 backfill, part 2 (2026-10-26). The ledger triggers did not exist yet when the leaked-appendix repair of PUB-GATE-BULK-DEMOTION-1 ran, so its status changes are
-- written afterwards from the two repair backup tables: 135 papers moved quarantined -> published (trailing Appendix A and B removed), then 23 of them moved back to
-- quarantined because their prose cites the removed appendices. Every body replacement of that repair is already in the ledger through the paper_body_backups backfill.
-- Timestamps come from the matching paper_body_backups captured_at (first replacement for the restore, last for the put-back), so they are to the second the body change, not
-- a guess. Backfilled rows carry backfilled = 1 and withdrawal = 0.

INSERT INTO paper_change_ledger (ts, slug, identifier, kind, fields_changed, actor, reason, backfilled, status_before, status_after, gate_reason_before, gate_reason_after)
SELECT replace(COALESCE((SELECT MIN(captured_at) FROM paper_body_backups b WHERE b.slug = x.slug AND b.captured_at >= '2026-10-26 06:00:00'), '2026-10-26 06:36:00'), ' ', 'T') || '.000Z', x.slug, p.identifier, 'update', 'status,release_gate_reason', 'session_017ikgFYTJ6HPpquENrmyWHJ', 'PUB-GATE-BULK-DEMOTION-1: trailing Appendix A and B removed, paper restored to published (backfilled from the repair backups)', 1, 'quarantined', 'published', 'quality:internal-artifact', CASE WHEN p.status = 'published' THEN p.release_gate_reason ELSE 'ok' END
FROM papers_artifact_repair_pdf_bak_20261026 x JOIN papers p ON p.slug = x.slug;

INSERT INTO paper_change_ledger (ts, slug, identifier, kind, fields_changed, actor, reason, backfilled, status_before, status_after, gate_reason_before, gate_reason_after)
SELECT replace(COALESCE((SELECT MAX(captured_at) FROM paper_body_backups b WHERE b.slug = x.slug AND b.captured_at >= '2026-10-26 06:00:00'), '2026-10-26 06:44:00'), ' ', 'T') || '.000Z', x.slug, p.identifier, 'update', 'status,release_gate_reason', 'session_017ikgFYTJ6HPpquENrmyWHJ', 'PUB-GATE-BULK-DEMOTION-1: put back to quarantine because the prose cites the removed appendices (backfilled from the repair backups)', 1, 'published', 'quarantined', 'ok', 'quality:internal-artifact'
FROM papers_artifact_repair_pdf_bak_20261026 x JOIN papers p ON p.slug = x.slug WHERE p.status = 'quarantined';
