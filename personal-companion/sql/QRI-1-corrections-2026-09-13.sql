-- QRI-1 corrections — PERSONAL (personal-life) D1
-- Author: qnfo-ops, 2026-09-13. EXECUTOR: any principal with D1 write on PERSONAL.
-- The qnfo-ops endpoint has READ-ONLY D1 access by contract, so this file is the
-- executable form of the correction; it is not applied by the endpoint that wrote it.
--
-- DISCIPLINE: withdrawal is decided by the VERIFIED gate result, not by the critic's
-- verdict. 6 of 7 live pieces carry verdict='reject'; that is the expected output of
-- P_CRITIQUE ("look for reasons this piece is worthless"). Withdrawing on verdict alone
-- would have withdrawn 6 pieces and left the page empty. Only piece 8 has measured
-- violations (2 grounding + 5 voice, re-run 2026-09-13 via run_code).

-- ---------------------------------------------------------------------------
-- 1. Piece 8 — "The Understimulated Interval" — withdraw and record the errata.
--    Measured violations (run_code, 2026-09-13, against PERSONAL.activity):
--      interval           "Five days later"  -> real gap is 7d (3d end-to-start)
--      comparative-equal  "cost roughly the same in travel and time" -> no cost row;
--                          QPL is the reader's city of residence (local)
--    Unsupported particulars (voice): "dining hall", "about forty people",
--                          "sat in a circle", "took turns being wrong"
--    Plus two errors no automated gate can see, corrected by hand:
--      "Workshop on Quantum Programming Languages" -> QPL = Quantum Physics and Logic
--      "he rated the same week 1 out of 5" -> LoF26 10-14 Aug vs QPL 17-21 Aug
-- ---------------------------------------------------------------------------
UPDATE companion_pieces
   SET quality_json = json_set(
         quality_json,
         '$.gate',        'blocked-grounding',
         '$.gate_reason', 'QRI-1: 2 unsupported record-derived claims, 5 unsupported particulars',
         '$.errata',      'QRI-1 2026-09-13: "Five days later" (gap is 7 days, 3 end-to-start); "cost roughly the same in travel and time" (no cost recorded; QPL was local to the reader); "Workshop on Quantum Programming Languages" (QPL is Quantum Physics and Logic); "same week" (LoF26 10-14 Aug, QPL 17-21 Aug); "dining hall" and "about forty people" appear in no record row.',
         '$.errata_at',   '2026-09-13'
       )
 WHERE id = 8
   AND json_extract(quality_json, '$.gate') <> 'blocked-grounding';   -- idempotent

-- ---------------------------------------------------------------------------
-- 2. Re-run the gate over the other published pieces and tag the result.
--    DO NOT run a blanket UPDATE ... WHERE verdict='reject'. Instead, export each
--    body_md and run lib/gate.js (auditPublishedPiece) over it, then apply:
--
--    UPDATE companion_pieces SET quality_json = json_set(quality_json,'$.gate','blocked-grounding')
--     WHERE id = <only the ids the gate actually blocks>;
--
--    Verified 2026-09-13 by qnfo-ops: of ids 6,7,9,10,11,12 the only piece with a
--    KB-anchored claim is id 8. The others are external-subject pieces (Antarctic
--    territory, forensic handwriting, Aristotle's Peripatos, Quiccheberg, Akkadian
--    cartography) and carry no record-derived quantities, so the gate does not block
--    them. That is the whole reason the gate checks claims and not verdicts.

-- ---------------------------------------------------------------------------
-- 3. Feedback provenance — 42 of 45 reactions are machine-written.
--    Evidence: ids 1-42 arrive in three sub-second bursts (132 ms, 51 ms, 724 ms);
--    ids 43-45 arrive minutes apart. loadContinuity() labels the newest 12 as
--    "HOW HE REACTED (this is the strongest signal you have)" and 9 of those 12
--    are burst rows. Re-label them; do not print "HE REACTED" over machine rows.
-- ---------------------------------------------------------------------------
ALTER TABLE companion_feedback ADD COLUMN source TEXT DEFAULT 'unknown';

UPDATE companion_feedback SET source = 'probe' WHERE id BETWEEN 1 AND 42;
UPDATE companion_feedback SET source = 'human' WHERE id IN (43, 44, 45);

-- Orphan signals (slug present in no piece) must not be joined into continuity.
-- loadContinuity() currently uses LEFT JOIN and falls back to rendering raw slugs.
-- Replace with:  JOIN companion_pieces p ON p.slug = f.slug
--   and add:     AND (f.source IS NULL OR f.source = 'human')

-- ---------------------------------------------------------------------------
-- 4. Verification (run after 1-3)
--    Expect: piece 8 gate=blocked-grounding; source split probe=42, human=3.
-- ---------------------------------------------------------------------------
SELECT id, slug, json_extract(quality_json,'$.gate') AS gate,
       json_extract(quality_json,'$.verdict')      AS verdict
  FROM companion_pieces
 ORDER BY id;

SELECT source, COUNT(*) AS n FROM companion_feedback GROUP BY source;
