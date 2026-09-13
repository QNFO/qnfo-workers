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
--
-- ---------------------------------------------------------------------------
-- REVISION 2 (2026-09-13, same day) — three defects in revision 1
-- ---------------------------------------------------------------------------
-- Revision 1 was written but never run. Verifying its guards against live PERSONAL
-- data before handoff found three defects, two of which fail SILENTLY. A correction
-- script that silently no-ops is worse than no script: the operator reads success
-- and the page is unchanged. Measured this session:
--
-- (1) SECTION 1 GUARD WAS NULL-UNSAFE.
--     Rev 1:  WHERE id = 8 AND json_extract(quality_json,'$.gate') <> 'blocked-grounding'
--     `NULL <> 'x'` evaluates to NULL, not true, so on any row where the gate key is
--     absent the UPDATE silently no-ops. Live measurement: all seven pieces (ids 6-12)
--     currently read gate='passed', so the defect is latent here rather than active —
--     but the comparison is still wrong and would bite on a row with no gate key.
--     Fixed:  COALESCE(json_extract(...), '') <> 'blocked-grounding'
--
-- (2) SECTION 3 CLASSIFIED 3 OF 6 HUMAN ROWS — and would have hit a NOT NULL failure.
--     Rev 1:  UPDATE companion_feedback SET source='human' WHERE id IN (43,44,45);
--     Live:   companion_feedback holds 48 rows, not 45. Ids 46,47,48 postdate the
--             machine burst and were left NULL by rev 1, on a NOT NULL column, so the
--             statement would have raised "NOT NULL constraint failed:
--             companion_feedback.source".
--     Fixed:  ids 43-48.
--
-- (3) THE 'human' CLASSIFICATION NOW HAS A STATED BASIS, not an assumption.
--     Machine burst: ids 1-42 arrive inside ONE 23.4-minute window,
--       2026-09-12T07:58:07.433Z .. 2026-09-12T08:21:29.869Z (three sub-second bursts).
--     Ids 43-48 arrive hours apart on 2026-09-12: 12:13:47, 12:52:49, 13:12:58,
--       17:49:14, 17:49:20, 22:17:29 — a human cadence, not a burst.
--     Corroboration: id=45 targets slug 2026-09-12-essay-3bf32c8a197d2196, which is
--       companion_pieces.id=8 — the one piece this whole correction is about.
--     RESIDUAL, not resolved: ids 46 and 47 share ONE slug
--       (2026-09-12-serial-08cce3e9e76e423a) six seconds apart. Consistent with a human
--       reacting twice in quick succession; also the shape a retry would take.
--
-- IDEMPOTENCY: section 3's ALTER TABLE is the one non-idempotent statement — re-running
-- it raises "duplicate column name: source". Sections 1, 2 and section 3's UPDATEs are
-- safe to re-run.
-- ---------------------------------------------------------------------------

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
--
--    NOTE: this tags quality_json only. It does NOT change what a reader sees —
--    body_md is what reading.q08.org serves, and v1.1.0 has no gate call at all.
--    The reader-visible correction is sql/QRI-2-body-corrections-2026-09-13.sql.
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
   -- REV 2: NULL-safe. Rev 1 used `<> 'blocked-grounding'`, which is NULL (not true)
   -- when the gate key is absent, so the UPDATE would silently no-op on such a row.
   AND COALESCE(json_extract(quality_json, '$.gate'), '') <> 'blocked-grounding';

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
--    (Live gate values, measured this session: all seven pieces read 'passed'.)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 3. Feedback provenance — 42 of 48 reactions are machine-written.
--    Evidence: ids 1-42 arrive in three sub-second bursts inside a 23.4-minute window
--    (2026-09-12T07:58:07.433Z .. 08:21:29.869Z); ids 43-48 arrive hours apart.
--    loadContinuity() labels the newest 12 as "HOW HE REACTED (this is the strongest
--    signal you have)" and 9 of those 12 are burst rows. Re-label them; do not print
--    "HE REACTED" over machine rows.
--
--    REV 2: ids 43-48, not 43-45. Rev 1 left 46-48 NULL on a NOT NULL column.
-- ---------------------------------------------------------------------------
ALTER TABLE companion_feedback ADD COLUMN source TEXT DEFAULT 'unknown';

UPDATE companion_feedback SET source = 'probe' WHERE id BETWEEN 1 AND 42;
UPDATE companion_feedback SET source = 'human' WHERE id BETWEEN 43 AND 48;

-- Orphan signals (slug present in no piece) must not be joined into continuity.
-- loadContinuity() currently uses LEFT JOIN and falls back to rendering raw slugs.
-- Replace with:  JOIN companion_pieces p ON p.slug = f.slug
--   and add:     AND (f.source IS NULL OR f.source = 'human')

-- ---------------------------------------------------------------------------
-- 4. Verification (run after 1-3)
--    Expect: piece 8 gate=blocked-grounding; source split probe=42, human=6,
--            unknown=0. Any non-zero 'unknown' means section 3 did not cover every
--            row, which is exactly how rev 1 failed.
-- ---------------------------------------------------------------------------
SELECT id, slug, json_extract(quality_json,'$.gate') AS gate,
       json_extract(quality_json,'$.verdict')      AS verdict
  FROM companion_pieces
 ORDER BY id;

SELECT source, COUNT(*) AS n FROM companion_feedback GROUP BY source;

-- Orphan check. Measured 2026-09-13: 42 of 48 feedback rows reference a slug that no
-- piece carries. Those must not reach loadContinuity() as "HE REACTED" evidence.
SELECT COUNT(*) AS orphan_feedback_rows
  FROM companion_feedback f
  LEFT JOIN companion_pieces p ON p.slug = f.slug
 WHERE p.slug IS NULL;
