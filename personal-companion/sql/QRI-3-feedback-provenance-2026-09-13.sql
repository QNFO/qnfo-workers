-- QRI-3 — feedback provenance, CORRECTED (supersedes QRI-1 section 3)
-- Author: qnfo-ops, 2026-09-13. EXECUTOR: any principal with D1 write on PERSONAL.
--
-- WHY THIS FILE EXISTS
-- `sql/QRI-1-corrections-2026-09-13.sql` section 3 labels provenance with hardcoded id ranges
-- written against a 45-row snapshot:
--
--     UPDATE companion_feedback SET source = 'probe' WHERE id BETWEEN 1 AND 42;
--     UPDATE companion_feedback SET source = 'human' WHERE id IN (43, 44, 45);
--
-- The table now holds 48 rows. Executing that verbatim leaves ids 46, 47 and 48 at the
-- ALTER TABLE default 'unknown' -- three real reader signals silently dropped from
-- loadContinuity(), which is the exact defect section 3 exists to fix. It would under-fix
-- while appearing to succeed.
--
-- EVIDENCE (live queries + run_code, 2026-09-13 ~06:42Z)
--
-- Two INDEPENDENT signals agree on the same partition, which is why the corrected rule below
-- is defensible where QRI-1's fixed range is not:
--
--   A. Timestamp bursts (consecutive gaps < 2 s = one machine burst):
--        ids  1- 6   0.132 s
--        ids  7-12   0.051 s
--        ids 13-42   0.724 s
--      All six remaining rows are isolated, gaps: 39 min, 39 min, 20 min, 276.3 min,
--      5.769 s, 268.1 min.
--
--   B. Orphan status (LEFT JOIN companion_pieces ON p.slug = f.slug):
--        total 48 | orphans 42 | linked 6
--      and the split is EXACTLY aligned:
--        ids  1-42  -> 42 rows, ALL orphans  (slug exists in no piece)
--        ids 43-48  ->  6 rows, ALL linked   (slug exists in a real piece)
--
-- So the machine-written rows are the ones pointing at slugs that were never published. The
-- 5.769 s gap between ids 46 and 47 is therefore a double-tap on a REAL piece, not machine
-- generation -- resolved by signal B, which timing alone could not decide.
--
-- LIMIT OF THE EVIDENCE, STATED: "linked" is not by itself proof of human authorship. A human
-- could have tapped an orphan slug and a probe could have hit a real one. The claim rests on
-- the JOINT agreement of A and B over the same partition, not on either alone.
--
-- ---------------------------------------------------------------------------
-- 0. Add the column. Run ONCE -- SQLite has no ADD COLUMN IF NOT EXISTS, and re-running
--    this statement errors. If `source` already exists, skip to step 1.
-- ---------------------------------------------------------------------------
ALTER TABLE companion_feedback ADD COLUMN source TEXT DEFAULT 'unknown';

-- ---------------------------------------------------------------------------
-- 1. Provenance. Both statements are naturally idempotent.
-- ---------------------------------------------------------------------------
UPDATE companion_feedback SET source = 'probe' WHERE id BETWEEN 1 AND 42;   -- 42 rows, all orphans
UPDATE companion_feedback SET source = 'human' WHERE id BETWEEN 43 AND 48;  --  6 rows, all linked

-- ---------------------------------------------------------------------------
-- 2. Continuity must not render machine rows or orphan slugs as reader reactions.
--    loadContinuity() currently uses LEFT JOIN and falls back to printing raw slugs, so
--    orphan slugs (and the "HOW HE REACTED (this is the strongest signal you have)" label
--    over machine rows) reach the generator as if they were the reader's verdict.
--
--    Replace the join with an INNER JOIN plus a source filter:
--
--      FROM companion_feedback f
--      JOIN companion_pieces p ON p.slug = f.slug
--     WHERE f.source = 'human'
--
--    This is a worker-source change, not SQL. It cannot be applied from qnfo-ops.
-- ---------------------------------------------------------------------------
-- 3. Verification. Run after 0-1.
--    EXPECT: probe 42 | human 6 | unknown 0
--            and the second query MUST return 0.
-- ---------------------------------------------------------------------------
SELECT source, COUNT(*) AS n FROM companion_feedback GROUP BY source ORDER BY source;

SELECT COUNT(*) AS non_probe_orphans
  FROM companion_feedback f
  LEFT JOIN companion_pieces p ON p.slug = f.slug
 WHERE p.slug IS NULL AND f.source <> 'probe';

-- ---------------------------------------------------------------------------
-- 4. STILL OPEN
-- ---------------------------------------------------------------------------
-- (a) QRI-2 (`QRI-2-body-corrections-2026-09-13.sql`) is verified correct and safe to apply
--     verbatim -- every anchor, both span lengths (287/287), the character geometry
--     (instr = 1 and 289, ending at 575), the recomputed word_count (2504) and the resulting
--     length (15278) all reproduce exactly against the live row. ORDER MATTERS: its step 3
--     (`word_count = 2504`) is guarded by `instr(body_md, 'Five days later') = 0`, true only
--     AFTER step 2 commits. Run it as one sequential script; step 3 alone silently no-ops and
--     leaves word_count = 2539 against a corrected body.
--
-- (b) QRI-2's stated reason for dropping the QPL expansion is superseded. It drops it as
--     "NOT tool-verified", but `companion-pieces/2026-09-13-ERRATA-reading-q08-id8.md` later
--     verified it from https://qpl2026.github.io/ : "The 23rd International Conference on
--     Quantum Physics and Logic (QPL 2026) ... August 17th to August 21st 2026 in Amsterdam."
--     Dropping it remains the safe edit; the correct expansion is available if restored.
--
-- (c) Nothing here is deployed. Live is v1.1.0 (`/health`: pieces 7). Correcting body_md fixes
--     the text of ONE piece; it does not stop the next piece repeating the defect. That needs a
--     deploy with runGate() wired at the insert site and a gate filter on `/`, `/p/<slug>`,
--     `/api/pieces` and `feed.xml`.
--
-- (d) /api/pieces is public with no key and returns anchor_json and quality_json while the
--     masthead reads "Private.". Do NOT make --fail-closed the default before COMPANION_KEY is
--     set: the key is unset on the live deployment, so inverting authorized() would black out
--     the page on the next deploy. Set the key first, or drop the label.
