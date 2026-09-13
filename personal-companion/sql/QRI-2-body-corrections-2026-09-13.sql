-- QRI-2 body correction — PERSONAL (personal-life) D1
-- Author: qnfo-ops, 2026-09-13. EXECUTOR: any principal with D1 write on PERSONAL.
--
-- WHY THIS FILE EXISTS
-- `sql/QRI-1-corrections-2026-09-13.sql` section 1 only `json_set`s quality_json. It
-- never touches `body_md`, and `body_md` is what reading.q08.org actually serves. The
-- `gate = 'blocked-grounding'` tag therefore has NO effect on the published page:
--
--   * production runs v1.1.0, which has no gate call at all; and
--   * `apply-remediation.mjs` explicitly does NOT wire the runGate() call at the insert
--     site or add a gate filter to `/`, `/p/<slug>`, `/api/pieces` or `feed.xml` —
--     those sites are past the 32,768-byte read ceiling and are unverified.
--
-- So after applying QRI-1 alone, the page still reads "Five days later" and is still
-- served. Correcting `body_md` is the ONLY action available today that changes what a
-- reader sees. This file does that. It is complementary to QRI-1, not a replacement.
--
-- SCOPE: one row. Verified 2026-09-13 that only companion_pieces.id=8 carries the
-- defect (probe over all 7 live pieces: ids 6,7,9,10,11,12 all zero on every token).

-- ---------------------------------------------------------------------------
-- 0. Reversibility record. Store the exact before/after strings so the edit can
--    be undone by re-replacing, without needing a full body_md backup.
-- ---------------------------------------------------------------------------
UPDATE companion_pieces
   SET quality_json = json_set(
         quality_json,
         '$.qri2_at',          '2026-09-13',
         '$.qri2_before_s1',   'Rowan rated it 5 out of 5 for felt energy. Five days later, at QPL 2026 in Amsterdam — the Workshop on Quantum Programming Languages, a status tournament with proceedings and citations — he rated the same week 1 out of 5. Drained. The two events cost roughly the same in travel and time.',
         '$.qri2_before_s2',   'On 10 August 2026, in the dining hall at Wolfson College, Cambridge, about forty people sat in a circle and took turns being wrong out loud. The occasion was LoF26, a conference on George Spencer-Brown''s *Laws of Form*, and it ran five days on conversation, play, and free participation.'
       )
 WHERE id = 8 AND json_extract(quality_json, '$.qri2_at') IS NULL;

-- ---------------------------------------------------------------------------
-- 1. Defect 5 — invented scene. Replace the two-sentence span that supplies a room,
--    a headcount and a staged scene, none of which any record row holds.
--    Guarded by instr() so a whitespace or character drift cannot silently no-op.
--    Verified 2026-09-13: instr(body_md, <the span>) = 1, i.e. the body opens with it.
-- ---------------------------------------------------------------------------
UPDATE companion_pieces
   SET body_md = replace(
         body_md,
         'On 10 August 2026, in the dining hall at Wolfson College, Cambridge, about forty people sat in a circle and took turns being wrong out loud. The occasion was LoF26, a conference on George Spencer-Brown''s *Laws of Form*, and it ran five days on conversation, play, and free participation.',
         'On 10 August 2026 LoF26 opened at Wolfson College, Cambridge, and ran five days. The record holds the venue and the dates; the room it met in is not in it.'
       )
 WHERE id = 8
   AND instr(body_md, 'dining hall') > 0;      -- idempotent: no-op once replaced

-- ---------------------------------------------------------------------------
-- 2. Defects 1-4 and 6 — the arithmetic error and the unverified expansion.
--    "Five days later" reuses LoF26's DURATION (5) as the GAP (start-to-start 7,
--    end-to-start 3). "cost roughly the same in travel and time" asserts equality on
--    a quantity no record row populates (the activity table has no cost column).
--    "he rated the same week" is false: LoF26 10-14 Aug, QPL 17-21 Aug.
--    "the Workshop on Quantum Programming Languages" is NOT tool-verified; QPL is
--    believed to be Quantum Physics and Logic, but no tool call confirmed it, so the
--    expansion is DROPPED rather than asserted.
--    Verified 2026-09-13: instr(body_md, <the span>) = 289.
-- ---------------------------------------------------------------------------
UPDATE companion_pieces
   SET body_md = replace(
         body_md,
         'Rowan rated it 5 out of 5 for felt energy. Five days later, at QPL 2026 in Amsterdam — the Workshop on Quantum Programming Languages, a status tournament with proceedings and citations — he rated the same week 1 out of 5. Drained. The two events cost roughly the same in travel and time.',
         'The record logs the first week 5 out of 5 for felt energy and the second 1 out of 5. The two events were seven days apart, not consecutive, and the record holds no cost for either.'
       )
 WHERE id = 8
   AND instr(body_md, 'Five days later') > 0;  -- idempotent

-- ---------------------------------------------------------------------------
-- 3. word_count is now stale (the piece shortened). Recompute it from body_md.
--    SQLite has no word-split, so use the same definition worker.js uses (runs of
--    non-whitespace). This expression approximates it; if exactness matters, export
--    body_md and run wordCount() from worker.js instead of trusting this line.
-- ---------------------------------------------------------------------------
UPDATE companion_pieces
   SET word_count = length(body_md) - length(replace(body_md, ' ', '')) + 1
 WHERE id = 8 AND instr(body_md, 'Five days later') = 0;

-- ---------------------------------------------------------------------------
-- 4. Tag the gate result (as QRI-1 does) and record that the served text is fixed.
-- ---------------------------------------------------------------------------
UPDATE companion_pieces
   SET quality_json = json_set(
         quality_json,
         '$.gate',        'blocked-grounding',
         '$.gate_reason', 'QRI-2: body corrected in place; 2 unsupported record-derived claims + 4 unsupported particulars removed',
         '$.errata',      'QRI-2 2026-09-13: "Five days later" -> the events were seven days apart; "cost roughly the same in travel and time" -> no cost recorded; "same week" -> LoF26 10-14 Aug vs QPL 17-21 Aug; "dining hall" / "about forty people" / "sat in a circle" / "took turns being wrong" -> in no record row; "Workshop on Quantum Programming Languages" -> dropped, unverified'
       )
 WHERE id = 8;

-- ---------------------------------------------------------------------------
-- 5. Verification. Run after 0-4.
--    EXPECT: s1 = 0, full2 = 0, dining = 0, forty = 0, five = 0, costeq = 0,
--            seven_days = present, gate = blocked-grounding.
-- ---------------------------------------------------------------------------
SELECT id,
       length(body_md)                                                   AS len,
       instr(body_md, 'Five days later')                                 AS five,
       instr(body_md, 'dining hall')                                     AS dining,
       instr(body_md, 'about forty people')                              AS forty,
       instr(body_md, 'cost roughly the same in travel and time')        AS costeq,
       instr(body_md, 'he rated the same week')                          AS sameweek,
       instr(body_md, 'seven days apart')                                AS seven_days,
       instr(body_md, 'On 10 August 2026 LoF26 opened')                  AS repl2_present,
       json_extract(quality_json, '$.gate')                              AS gate,
       word_count
  FROM companion_pieces
 WHERE id = 8;

-- ---------------------------------------------------------------------------
-- 6. STILL OPEN — not fixable by SQL, and not fixable from qnfo-ops
-- ---------------------------------------------------------------------------
-- (a) The gate is not running in production. Applying this file corrects the text of
--     ONE piece; it does not prevent the next piece from repeating the defect. That
--     requires deploying a worker built from the v1.0.0 source plus the patches
--     (VERSION 1.3.0) and wiring runGate() at the insert site — which needs deploy
--     access qnfo-ops does not have.
-- (b) /api/pieces is public with no key and returns anchor_json and quality_json
--     (internal topic/bridge scaffolding and the critic's verdict text), while the
--     masthead reads "Private.". `--fail-closed` is deliberately NOT the default:
--     COMPANION_KEY is unset on the live deployment, so inverting authorized() would
--     black out the page on the next deploy. Decide: set the key, or drop the label.
-- (c) 42 of 45 companion_feedback rows are machine-written (three sub-second bursts)
--     and loadContinuity() presents the newest 12 as "HOW HE REACTED (this is the
--     strongest signal you have)". Handled in QRI-1 section 3; still to apply.
