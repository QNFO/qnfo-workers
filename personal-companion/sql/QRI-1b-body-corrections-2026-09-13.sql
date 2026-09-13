-- QRI-1b — the body_md corrections QRI-1 omits, plus two hazard fixes for QRI-1.
-- Author: qnfo-ops, 2026-09-13. EXECUTOR: any principal with D1 write on PERSONAL.
--
-- WHY THIS FILE EXISTS
-- QRI-1 sets quality_json.gate='blocked-grounding' and records errata metadata. It does
-- not modify body_md. Verified against the live page and PERSONAL D1 on 2026-09-13:
-- after QRI-1 alone, reading.q08.org still serves every false statement. A flag is not
-- a correction. This file is the correction.
--
-- VERIFIED OCCURRENCE COUNTS (qnfo-ops, ops_d1_query on PERSONAL, 2026-09-13):
--   instr(body_md,'Rowan')                           = 289 ; 2nd occurrence = 0
--   instr(body_md,'Five days later')                 = 332
--   instr(body_md,'Quantum Programming Languages')   = 392
--   instr(body_md,'same week')                       = 489 ; 2nd occurrence = 0
--   instr(body_md,'roughly the same')                = 540
--   instr(body_md,'dining hall')                     = 27 ; 'forty people' = 76
-- Each false phrase occurs exactly once, so a single replace() pass per phrase is
-- sufficient. Both statements below are naturally idempotent: once applied, the
-- WHERE guard no longer matches and a re-run is a no-op.
--
-- SCOPE: id 8 only. Verified independently 2026-09-13: of ids 6,7,9,10,11,12 the
-- flagged markers (dining hall / five days later / Quantum Programming Languages /
-- Rowan rated / roughly the same) are all zero. Do not touch the other six rows.

-- ---------------------------------------------------------------------------
-- A1. The record-derived falsehoods, the wrong name, and the address to the reader.
--     Covers defects 1, 2, 3, 4 and 6 of ERRATA-2026-09-13.
-- ---------------------------------------------------------------------------
UPDATE companion_pieces
   SET body_md = replace(
         body_md,
         'Rowan rated it 5 out of 5 for felt energy. Five days later, at QPL 2026 in Amsterdam — the Workshop on Quantum Programming Languages, a status tournament with proceedings and citations — he rated the same week 1 out of 5. Drained. The two events cost roughly the same in travel and time.',
         'The record logs the first week 5 out of 5 for felt energy and the second 1 out of 5. The two events were seven days apart, not consecutive, and the record holds no cost for either.'
       ),
       quality_json = json_set(
         quality_json,
         '$.errata_applied', 'QRI-1b 2026-09-13',
         '$.errata_at',      '2026-09-13'
       )
 WHERE id = 8
   AND instr(body_md, 'Rowan rated it 5 out of 5 for felt energy.') > 0;

-- ---------------------------------------------------------------------------
-- A2. The invented scene (defect 5).
--     "dining hall" and "about forty people" appear in no record row; the record holds
--     venue "Wolfson College, Cambridge" and the dates only.
--
--     NOTE — deliberate deviation from ERRATA-2026-09-13, flagged for review:
--     the errata's proposed replacement restates the duration ("and ran five days"),
--     but the immediately following existing sentence already supplies it ("The occasion
--     was LoF26 ... and it ran five days on conversation, play, and free participation.").
--     Using the errata text verbatim would print the duration twice. This replacement
--     keeps the verified date and venue and drops the invented particulars; the existing
--     next sentence carries the rest. If the operator prefers the errata wording, swap
--     the second argument and delete the following sentence in the same pass.
-- ---------------------------------------------------------------------------
UPDATE companion_pieces
   SET body_md = replace(
         body_md,
         'On 10 August 2026, in the dining hall at Wolfson College, Cambridge, about forty people sat in a circle and took turns being wrong out loud.',
         'On 10 August 2026 LoF26 opened at Wolfson College, Cambridge.'
       )
 WHERE id = 8
   AND instr(body_md, 'dining hall') > 0;

-- Gate flag: QRI-1 sets 'blocked-grounding'. Choose ONE policy and uncomment.
--   (a) piece stays withdrawn after correction (most conservative):
-- UPDATE companion_pieces SET quality_json = json_set(quality_json,'$.gate','blocked-grounding')
--  WHERE id = 8;
--   (b) piece returns to service once corrected:
-- UPDATE companion_pieces SET quality_json = json_set(quality_json,'$.gate','passed')
--  WHERE id = 8;

-- ===========================================================================
-- B. Hazard fixes for QRI-1 itself. QRI-1 is correct in discipline and stale in two
--    mechanical details; both are executor failure modes, not disagreements.
-- ===========================================================================

-- B1. QRI-1 §3 runs:  ALTER TABLE companion_feedback ADD COLUMN source TEXT DEFAULT 'unknown';
--     SQLite has no ADD COLUMN IF NOT EXISTS. A second run aborts with
--     "duplicate column name: source", and every statement after it in the same
--     batch is then skipped — including the source tagging and the verification.
--     Check before running (expect 0 rows on a fresh database):
-- SELECT name FROM pragma_table_info('companion_feedback') WHERE name = 'source';
--     Run the ALTER once, only if that returns no row.

-- B2. QRI-1 hardcodes the human rows as ids 43,44,45. The table held 45 rows when that
--     was written; it now holds 48. Ids 46,47,48 would land as 'unknown' and be
--     silently excluded from continuity by the source filter, with no error.
--     Derive the split from the burst structure instead of from ids.
--     Verified 2026-09-13 (run_code over companion_feedback.created_at): three sub-second
--     bursts carry ids 1-42 — ids 1-6 span 132 ms, ids 7-12 span 51 ms, ids 13-42 span
--     724 ms — all before 09:00Z on 2026-09-12. Every later row is minutes or hours apart.
UPDATE companion_feedback SET source = 'probe'
 WHERE created_at < '2026-09-12T09:00:00.000Z';           -- expect 42 rows

UPDATE companion_feedback SET source = 'human'
 WHERE created_at >= '2026-09-12T09:00:00.000Z'
   AND id NOT IN (46, 47);                                 -- expect 4 rows: 43,44,45,48

-- B3. Ids 46 and 47 are 5.769 s apart on the SAME slug (2026-09-12-serial-08cce3e9e76e423a).
--     That is a double-submit signature, not two independent human reactions. Do not
--     count it as signal; review it as a client defect.
UPDATE companion_feedback SET source = 'review'
 WHERE id IN (46, 47);                                     -- expect 2 rows

-- B4. QRI-1 §3 also notes loadContinuity() uses LEFT JOIN and renders raw slugs for
--     orphan signals. Confirmed 2026-09-13: 42 feedback rows point at 5 slugs that are
--     in no companion_pieces row (c039c49b063c928c, dbee1757a2ccd8b1, dbfe847ab3520b42,
--     ce1fc4e42f49391d, 58450bd270190231) — every probe row is an orphan; every human row
--     points at a real piece. Apply in the worker, not here:
--       JOIN companion_pieces p ON p.slug = f.slug
--       AND (f.source IS NULL OR f.source = 'human')

-- ===========================================================================
-- C. Verification. Run after A and B. None of these should be taken on trust.
-- ===========================================================================
SELECT id, slug,
       instr(body_md,'Five days later')                 AS still_false_gap,
       instr(body_md,'Quantum Programming Languages')   AS still_wrong_name,
       instr(body_md,'dining hall')                     AS still_invented_scene,
       instr(body_md,'Rowan')                           AS still_names_reader,
       length(body_md)                                  AS len
  FROM companion_pieces
 ORDER BY id;
-- expect: id 8 has 0 in all four columns; ids 6,7,9,10,11,12 unchanged.

SELECT source, COUNT(*) AS n FROM companion_feedback GROUP BY source;
-- expect: probe 42, human 4, review 2. If any row reads 'unknown', B1 ran twice or the
-- ALTER was skipped and B2/B3 did not execute.

SELECT id, json_extract(quality_json,'$.gate')      AS gate,
           json_extract(quality_json,'$.verdict')   AS verdict,
           json_extract(quality_json,'$.errata_applied') AS errata_applied
  FROM companion_pieces ORDER BY id;
-- expect: errata_applied = 'QRI-1b 2026-09-13' on id 8 only.
-- Note: 6 of 7 pieces carry verdict='reject' — that is P_CRITIQUE's expected output, not
-- a withdrawal signal. Withdraw on measured violations, never on verdict alone.
