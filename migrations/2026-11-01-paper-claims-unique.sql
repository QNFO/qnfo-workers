-- PAPER-CLAIMS-UNIQUE-1 (2026-11-01): the citation-gate ledger must stay one row per (slug, claim_kind, source_ref), even when
-- overlapping publish retries race. The writer uses an atomic UPSERT against this index.
-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: DROP INDEX IF EXISTS idx_paper_claims_source_unique;

CREATE UNIQUE INDEX IF NOT EXISTS idx_paper_claims_source_unique ON paper_claims (slug, claim_kind, source_ref);
