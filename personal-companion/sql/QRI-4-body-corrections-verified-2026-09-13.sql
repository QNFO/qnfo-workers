-- QRI-4 — VERIFIED body correction, companion_pieces.id=8
-- Author: qnfo-ops, 2026-09-13. EXECUTOR: any principal holding D1 write on PERSONAL.
-- Supersedes, for the body text and the word count:
--   sql/QRI-2-body-corrections-2026-09-13.sql  steps 1-3   (text OK, one phrase dropped, count wrong for THIS text)
--   sql/QRI-1b-body-corrections-2026-09-13.sql             (marked DO NOT RUN; still correct to skip)
--   sql/QRI-1-corrections-2026-09-13.sql                   (quality_json only; complementary, apply it too)
--
-- WHY A FOURTH FILE EXISTS
-- QRI-2 and QRI-3 disagree about the post-state (word_count 2503 vs 2504; length 15276 vs 15278) and
-- QRI-1b §DISCREPANCY says to recompute rather than trust either. Recomputed 2026-09-13 with two
-- independent counters (worker.js's own wordCount() algorithm, and a /\S+/g counter), both agreeing,
-- on boundary-safe spans (every span begins and ends on non-whitespace, so no token merges across a
-- replacement boundary). The result: for QRI-2's text the correct pair is 2503 / 15276, so QRI-3's
-- 2504 / 15278 is falsified. For THIS file's text the correct pair is:
--
--     word_count = 2511      length(body_md) = 15323
--
-- The deltas are, per span: A 49w -> 31w (-18), B 54w -> 45w (-9), C 4w -> 3w (-1) = -28 words;
-- characters -132, -60, -2 = -194. 2539 - 28 = 2511. 15517 - 194 = 15323.
--
-- NEVER carry a word count over from a file whose replacement text you did not apply. QRI-4's span B
-- is 45 words; QRI-2's was 37. The 8-word difference is the phrase restored in §A.1.
--
-- §A. THREE CORRECTIONS TO THE STAGED FILES, each verified live 2026-09-13
--
-- A.1  "a status tournament" is RECORD-SUPPORTED and QRI-2 dropped it.
--      PERSONAL.events id='evt-qpl26'.notes = "Epistemic rigidity; motive currency = status.
--        Draining despite local."
--      PERSONAL.profile id='dislikes.status-venues' (conf 0.95) = "Large status-currency tournaments
--        drain him: QPL 2026 logged energy 1 (drained); TSC (~3k) and CCS (~1k+) avoided."
--      QRI-1b §"ONE FINDING HERE IS IN NEITHER QRI-2 NOR QRI-3" flagged this as a silent loss and left
--      it to the operator. It is restored below. What is dropped instead is "with proceedings and
--      citations": "proceedings" is defensible (QPL 2026 uses EPTCS proceedings) but "citations" is in
--      no record row and adds nothing the sentence needs.
--
-- A.2  The QPL expansion is no longer unverified, so the reason for removing the name changed.
--      Primary source, fetched 2026-09-13, https://qpl2026.github.io/ (HTTP 200):
--        "The 23rd International Conference on Quantum Physics and Logic (QPL 2026) will take place
--         from August 17th to August 21st 2026 in Amsterdam, The Netherlands."
--        "Weekend workshops : August 15 - August 16"
--      So the essay's "the Workshop on Quantum Programming Languages" is not a bare invention: it is a
--      real adjacent component (the weekend workshop block) misapplied as the event's name, plus a
--      wrong expansion of the acronym. That resolves the caveat in QRI-2 §7 and the open item in
--      ADDENDUM-2026-09-13-gate-wiring.md §6.7.
--      The name is nonetheless removed below — not because it is unknown, but because the reader's
--      STANDING FILTER forbids it. Verified live:
--        PERSONAL.profile id='standing:no-qpl-cwi', conf 0.95,
--        "Do not bring up QPL or CWI summer school topics in personal recommendations or reminders
--         as of 2026-08-25."
--      A piece written for him to read is a personal recommendation. The filter also covers the second
--      occurrence in the closing section, which QRI-2 step 2b already handled; §2b keeps that edit.
--
-- A.3  The cost claim. The staged note "there is no cost column" is wrong about the SCHEMA:
--        events = (id, category, title, venue, city, country, start_date, end_date, amount REAL,
--                  currency TEXT, booking_ref, source, source_subject, energy, energy_label, notes,
--                  ingested_at)
--      amount and currency exist. They are simply unpopulated: SELECT COUNT(*) FROM events WHERE
--      amount IS NOT NULL -> 0, out of 71 rows. The CONCLUSION survives ("the record holds no cost for
--      either") for a better reason than the one recorded. It is also contradicted in the reader's own
--      words: evt-qpl26.notes says "Draining despite local" — QPL was in Amsterdam, his city of
--      residence (profile logistics.amsterdam), while LoF26 required travel to Cambridge.
--
-- §0. PRE-FLIGHT — run first. Expected on an unmodified row:
--     len 15517 | word_count 2539 | open_at 1 | rowan_span_at 289 | qplroom_at 13950
--     qpl1 352 | qpl2_rel 13602 | rowan2_rel 0 | qpl3_rel 0 | qpl_exp 0 | cwi 0
--     Any other value means the row has already been edited: STOP and reconcile before applying.
SELECT length(body_md) AS len, word_count,
       instr(body_md,'On 10 August 2026, in the dining hall') AS open_at,
       instr(body_md,'Rowan rated it 5 out of 5')              AS rowan_span_at,
       instr(body_md,'the QPL 2026 room')                      AS qplroom_at,
       instr(body_md,'QPL')                                    AS qpl1,
       instr(substr(body_md, instr(body_md,'QPL')+1),'QPL')     AS qpl2_rel,
       instr(substr(body_md, instr(body_md,'Rowan')+1),'Rowan') AS rowan2_rel,
       instr(body_md,'Quantum Physics and Logic')              AS qpl_exp,
       instr(body_md,'CWI')                                    AS cwi
  FROM companion_pieces WHERE id = 8;

-- ---------------------------------------------------------------------------
-- 1. Defect: invented scene. A room, a headcount and a staged scene, none of
--    which any record row holds. Corroborated against PERSONAL.notes (490 rows,
--    column `content`): matches for 'dining hall' 0, 'forty' 0, 'circle' 0.
--    Geometry: span length 287, at body offset 1 (the body opens with it).
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
-- 2. Defects: the arithmetic error and the standing-filter violation.
--    "Five days later" reuses LoF26's DURATION (5) as the GAP (start-to-start 7,
--    end-to-start 3). "he rated the same week" is false (10-14 Aug vs 17-21 Aug).
--    "cost roughly the same in travel and time" asserts equality on a quantity
--    no row populates. "the Workshop on Quantum Programming Languages" is wrong,
--    and the event name itself is forbidden by the standing filter (§A.2).
--    Geometry: span length 287, at body offset 289 (one separator space after
--    span 1). Verified: only ONE 'Rowan' in the body (offset 289, rowan2_rel 0),
--    so this span carries the whole name exposure; after it, instr('Rowan') = 0.
-- ---------------------------------------------------------------------------
UPDATE companion_pieces
   SET body_md = replace(
         body_md,
         'Rowan rated it 5 out of 5 for felt energy. Five days later, at QPL 2026 in Amsterdam — the Workshop on Quantum Programming Languages, a status tournament with proceedings and citations — he rated the same week 1 out of 5. Drained. The two events cost roughly the same in travel and time.',
         'The record logs the first week 5 out of 5 for felt energy and the second 1 out of 5, and records the second as a status tournament. The two events were seven days apart, not consecutive, and the record holds no cost for either.'
       )
 WHERE id = 8
   AND instr(body_md, 'Five days later') > 0;  -- idempotent

-- ---------------------------------------------------------------------------
-- 2b. STANDING FILTER — the second occurrence (carried over from QRI-2 §2b).
--     Verified: 'QPL' occurs exactly TWICE, at 352 (inside §2's span) and at
--     absolute 13954 (qpl2_rel 13602). The closing sentence reads "Return to
--     Cambridge and Amsterdam. The LoF26 room and the QPL 2026 room differed in
--     what they did to attention." The preceding sentence names both cities, so
--     "the second room" resolves without re-introducing the forbidden name.
--     After this, instr(body_md,'QPL') = 0 and instr(body_md,'CWI') = 0.
-- ---------------------------------------------------------------------------
UPDATE companion_pieces
   SET body_md = replace(body_md, 'the QPL 2026 room', 'the second room')
 WHERE id = 8
   AND instr(body_md, 'QPL') > 0;              -- idempotent

-- ---------------------------------------------------------------------------
-- 3. word_count is now stale. Set the EXACT recomputed value for THIS text.
--    Do NOT compute it as length(body_md) - length(replace(body_md,' ','')) + 1:
--    that counts only spaces, ignoring the paragraph newlines, and undercounts
--    badly ("one two\n\nthree four\nfive" -> 3 where the true count is 5).
-- ---------------------------------------------------------------------------
UPDATE companion_pieces
   SET word_count = 2511
 WHERE id = 8 AND instr(body_md, 'QPL') = 0 AND instr(body_md, 'dining hall') = 0;

-- ---------------------------------------------------------------------------
-- 4. Reversibility record + gate tag.
-- ---------------------------------------------------------------------------
UPDATE companion_pieces
   SET quality_json = json_set(
         quality_json,
         '$.qri4_at',          '2026-09-13',
         '$.qri4_before_s1',   'On 10 August 2026, in the dining hall at Wolfson College, Cambridge, about forty people sat in a circle and took turns being wrong out loud. The occasion was LoF26, a conference on George Spencer-Brown''s *Laws of Form*, and it ran five days on conversation, play, and free participation.',
         '$.qri4_before_s2',   'Rowan rated it 5 out of 5 for felt energy. Five days later, at QPL 2026 in Amsterdam — the Workshop on Quantum Programming Languages, a status tournament with proceedings and citations — he rated the same week 1 out of 5. Drained. The two events cost roughly the same in travel and time.',
         '$.qri4_before_s3',   'the QPL 2026 room',
         '$.qri4_recompute',   'word_count 2511, length 15323 (deltas -28 words, -194 chars, two independent counters agreeing)',
         '$.gate',             'blocked-grounding',
         '$.gate_reason',      'QRI-4: 2 unsupported record-derived claims + 3 invented particulars + 1 standing-filter violation removed; word_count recomputed for the applied text',
         '$.errata',           'QRI-4 2026-09-13: "Five days later" -> seven days apart (5 was LoF26''s duration, reused as the gap); "same week" -> 10-14 Aug vs 17-21 Aug; "cost roughly the same in travel and time" -> events.amount is unpopulated for all 71 rows and evt-qpl26.notes says "Draining despite local"; "dining hall"/"about forty people"/"sat in a circle" -> in no record row; QPL name and its wrong expansion removed (standing filter standing:no-qpl-cwi, conf 0.95) though the expansion is now primary-source verified as Quantum Physics and Logic; "a status tournament" RETAINED (record-supported); closing "the QPL 2026 room" -> "the second room"'
       )
 WHERE id = 8;

-- ---------------------------------------------------------------------------
-- 5. POST-FLIGHT. EXPECT:
--    len 15323 | word_count 2511 | every defect probe 0 | seven_days > 0
--    repl1_present 1 | repl3_present > 0 | gate 'blocked-grounding'
-- ---------------------------------------------------------------------------
SELECT id, length(body_md) AS len, word_count,
       instr(body_md,'Five days later')                          AS five,
       instr(body_md,'dining hall')                              AS dining,
       instr(body_md,'about forty people')                       AS forty,
       instr(body_md,'cost roughly the same in travel and time')  AS costeq,
       instr(body_md,'he rated the same week')                   AS sameweek,
       instr(body_md,'Rowan')                                    AS rowan,
       instr(body_md,'QPL')                                      AS qpl,
       instr(body_md,'CWI')                                      AS cwi,
       instr(body_md,'seven days apart')                          AS seven_days,
       instr(body_md,'On 10 August 2026 LoF26 opened')            AS repl1_present,
       instr(body_md,'a status tournament')                       AS kept_phrase,
       instr(body_md,'the second room')                           AS repl3_present,
       json_extract(quality_json,'$.gate')                        AS gate
  FROM companion_pieces WHERE id = 8;

-- ---------------------------------------------------------------------------
-- 6. STILL OPEN — not fixable by SQL and not fixable from qnfo-ops.
--  (a) The gate is NOT running in production. Correcting this row fixes ONE piece; it does not stop
--      the next one repeating the defect. That needs a deploy built from the repo source plus the
--      patches, with runGate() wired at the insert site. qnfo-ops has no deploy tool.
--  (b) The CATEGORY filter ("No physics/science books in reading recommendations", conf 0.98) is not
--      enforced by the gate; filters.js covers only the entity deny-list. Belongs at pickTopic(),
--      before anchors are fetched. Not written.
--  (c) /api/pieces is public with no key and returns anchor_json and quality_json (internal
--      topic/bridge scaffolding and the critic's verdict text) while the masthead reads "Private."
--      Verified live 2026-09-13: HTTP 200, count 7, both fields present. Decide: set COMPANION_KEY,
--      or drop the label. Do NOT invert authorized() before the key is set — it is unset on the live
--      deployment, so that would 401 every gated route.
--  (d) companion_feedback: 42 of 48 rows reference slugs absent from companion_pieces, so
--      loadContinuity() feeds the writer reactions to pieces that no longer exist. LEFT JOIN -> JOIN
--      is the one-word fix; see QRI-3-feedback-provenance-2026-09-13.sql.
--  (e) Production serves v1.1.0 while the repo holds v1.0.0 twice (worker.js and
--      deployed-current.worker.js, byte-identical, sha c06edffb). The v1.1.0 source is not in the repo.
