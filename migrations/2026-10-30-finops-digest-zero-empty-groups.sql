-- APPLY-BY: ci
-- DB: qnfo-audit
-- Rollback: none needed: finops_digest is derived data. The statement only zeroes digest rows that have no ai_spend_ledger row, the ledger is untouched, the triggers keep every other row current, and re-running it changes nothing.
-- FINOPS-DIGEST-ZERO-EMPTY-1 (charter pillar cost; follow-up to the review of #5366, refs #5253, #5266).
-- The 2026-10-30 triggers already upsert a zero-valued row for a (week, caller) group that a move or a delete empties: an aggregate SELECT without GROUP BY
-- returns one row even over no input rows, and migrations/finops-digest-upsert.test.mjs checks the digest against the ledger after random moves and deletes.
-- What they cannot repair is a group stranded BEFORE them: 2026-10-29-finops-digest.sql recomputed only the NEW group on UPDATE and had no DELETE trigger,
-- and the 2026-10-30 backfill groups the ledger, so a digest group with no ledger rows kept its old totals.
-- This zeroes such groups once. The ledger is read once (not once per digest row), the key list skips NULLs (NOT IN over a NULL key matches nothing),
-- and a second run changes no row, not even updated_at.
UPDATE finops_digest SET calls = 0, usd = 0, downgraded = 0, updated_at = datetime('now')
WHERE (calls <> 0 OR usd <> 0 OR downgraded <> 0)
  AND (week, caller) NOT IN (SELECT strftime('%Y-W%W', day), caller FROM ai_spend_ledger WHERE caller IS NOT NULL AND strftime('%Y-W%W', day) IS NOT NULL);
