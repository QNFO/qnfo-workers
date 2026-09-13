// personal-companion/lib/voice.js
//
// Added 2026-09-12 by qnfo-ops. Pure functions only: no bindings, no I/O, no
// network. Safe to unit-test in isolation. See voice.test.js.
//
// WHY THIS EXISTS
// The published piece "The Understimulated Interval"
// (reading.q08.org/p/2026-09-12-essay-3bf32c8a197d2196, companion_pieces.id=8)
// opens on the reader's own recent events, names him in the third person, then
// argues in the first person for the rest of the piece:
//
//   "On 10 August 2026, in the dining hall at Wolfson College, Cambridge, about
//    forty people sat in a circle and took turns being wrong out loud. ... Rowan
//    rated it 5 out of 5 for felt energy. Five days later, at QPL 2026 in
//    Amsterdam - the Workshop on Quantum Programming Languages, a status
//    tournament with proceedings and citations - he rated the same week 1 out of
//    5. Drained. The two events cost roughly the same in travel and time."
//
// The record (PERSONAL.activity / events) holds, for these two events: a date, a
// title, a venue string, a city, and an energy value. It holds no headcount, no
// room, and no scene. The piece supplies all three anyway, and it supplies them
// in the voice of the man who was there.
//
// The voice contract makes this likely rather than accidental. P_STYLE (repo
// worker.js, v1.0.0) opens: "You are writing for one reader: Rowan." It also
// forbids, without exception, "self-reference as a model or assistant", and any
// meta-commentary about writing. The only narrator the prompt leaves available
// is therefore the reader himself. P_ESSAY then requires the piece to "open on a
// concrete particular", and the most concrete particulars in the context are the
// reader's own recent events. So the model opens on his life, in his voice, and
// cites him by name where it is quoting rather than inhabiting.
//
// FIVE CHECKS
//   1. impersonation        - the writer asserting lived experience
//   2. attribution-seam     - the reader named in the third person as the subject
//                             of an experience verb, inside a first-person piece
//   3. reader-as-subject    - the reader's name in the possessive ("Rowan's own
//                             handwriting is not the subject here"), which names
//                             him as an object of study. Live occurrence: the
//                             serial "The Hand That Signs" (same day). This is a
//                             review flag, not proof of impersonation: a piece
//                             may legitimately discuss a real person's property.
//   4. invented-particular  - scene detail the record does not hold (headcount,
//                             room, staged scene), scoped to sentences that
//                             mention a recorded venue
//   5. first-person-attendance (rev 4) - the writer claiming physical presence at
//                             an event. See the revision 4 note below.
//
// REVISION 2 (same day, after running the checks over all four live pieces)
// Revision 1 flagged particulars anywhere in the text. Measured against the other
// published essay ("The Walker's Argument", same day), that produced false
// positives on hypothetical and attributed prose: "Two people walking side by
// side", "Reading groups that meet in a seminar room", and, in "The Sector That
// Has No Ground Truth", "those stations hold as few as eighty people" - none of
// which is a claim about a recorded event. A false block is as damaging as a
// false pass, so particulars are now checked only in sentences that mention a
// venue the record actually holds. The cost is a known miss: a piece that
// recounts a recorded event without naming the venue will not be flagged on
// particulars. That trade is deliberate and is pinned by tests.
//
// REVISION 3 (2026-09-13, QRI-2) - SEVERITY ADDED TO EVERY VIOLATION
// Rev 2 emitted every violation with no severity, and callers handed them straight
// to publishPolicy, which blocks on ANY violation. Measured consequence, by
// executing the committed modules against the real rows:
//
//   FALSE BLOCK  check 3 matches a STRAIGHT apostrophe, so the disclaimer in the
//                serial "The Hand That Signs" (companion_pieces.id=7) -
//                "Rowan's own handwriting is not the subject here." - produced a
//                violation and the gate would have WITHDRAWN that piece. But the
//                note on check 3 above says it is "a review flag, not proof of
//                impersonation", and the sentence names the reader in order to
//                EXCLUDE him. Check 1 fired on the same piece for the abstract
//                "my attention", which this header already records as a known
//                false positive. Two flags, both documented as unreliable, were
//                together sufficient to withdraw correct prose.
//
// Rev 3 labels every violation: block = attribution-seam, invented-particular
// (the shipped defect class); warn = impersonation, reader-as-subject (review
// flags). Additive: a caller reading only `kind` and `span` is unaffected, and the
// live-fixture blocking count for companion_pieces.id=8 is unchanged (2 grounding
// + 5 voice = 7).
//
// NOTE: gate.js rev 4 does NOT depend on this field - it classifies by kind, so
// the gate is correct whether or not this revision is the one deployed. That is
// deliberate: a policy that silently no-ops when its detector is one revision
// behind is worse than no policy.
//
// DELIBERATELY NOT ADDED IN REV 3: no new exported helper. addressee.js already
// exports `blockingViolations`, and the deploy patcher inlines all four modules
// into ONE scope with exports stripped, so a second top-level declaration of that
// name would be a duplicate declaration and the inlined worker would not parse.
//
// REVISION 4 (2026-09-13, QRI-2 red team) - THE HOLE REV 3 LEFT OPEN
// Rev 3 (severity) and rev 4 (this one) are two different fixes for two different
// defects, and they were written concurrently on the same path. Rev 3 stops the
// gate from withdrawing correct prose; rev 4 stops it from publishing a false
// presence claim. Neither substitutes for the other, so both are kept here.
//
// Measured by executing rev 2/rev 3 against a constructed minimal edit of the live
// piece - both factual errors corrected, the name and the invented particulars
// removed, the presence claim kept:
//
//   "... Seven days later, at QPL 2026 in Amsterdam, the week rated 1 out of 5.
//    Drained. I was there for both, and they differed in what they asked
//    attention to do."
//     -> rev 2/3: ZERO findings from any check. publish = true, blockingTotal = 0.
//
//   same text with "I was there for both" replaced by "I attended both"
//     -> rev 2/3: one `impersonation` finding, severity 'warn' as of rev 3, so
//        publish = true and blockingTotal = 0 anyway.
//
// So the detector caught a false claim of presence and the policy published it.
// Check 5 exists to make the presence claim blocking.
//
// SCOPE OF CHECK 5 (deliberate, and narrower than it looks)
// A presence claim blocks only when the piece ALSO names a recorded venue, and
// only when the match is not inside quotation marks. Rationale, each pinned by a
// test: a quoted presence claim belongs to whoever is being quoted (warn); a
// presence claim in a piece that names no recorded venue is not evidence about
// the reader's record (warn). The pattern list is narrow on purpose - "I was at a
// loss", "I was in doubt" and "I was reasoning past the anchors there" are not
// presence claims, and a false block is as damaging as a false pass.
//
// SCOPE / KNOWN LIMITS
// Surface checks, not proof of authorship. They flag spans for a policy or a
// human to judge; they do not decide. Check 2 is scoped to text that also speaks
// in the first person (a third-person review naming a real person is not
// flagged). If the record ever gains a headcount or a room, these checks must be
// given that row rather than left as blanket rules.
//
// KNOWN MISS, still open in rev 4: check 3 matches a STRAIGHT apostrophe only, so
// the typographic form is not caught here. addressee.js rev 2 handles both forms
// and is composed in by gate.js, so the union covers it. Do not rely on check 3 alone.
//
// KNOWN MISS, UNFIXED (recorded 2026-09-13, QRI-2): a piece that narrates the
// reader's recorded week from the inside, with no name, no listed experience verb
// and no presence copula, still produces zero findings. Measured on verbatim live
// text: "The LoF26 room and the QPL 2026 room differed in what they did to
// attention. The first leaves intervals - the pause after someone says something
// wrong, the walk to the next session, the unminuted conversation. The energy
// ratings were 5 and 1." -> 0 findings, publish = true. This is the class the
// reader's own question ("who is I?") is about. It is left unfixed because the
// candidate rule (scene nouns near a recorded event, without a name) could not be
// validated for false positives across the corpus from this endpoint, and an
// unvalidated detector that blocks is worse than a recorded miss. It is pinned by
// a test in gate.test.js so the gap cannot be forgotten.

const EXP_VERBS = ['rated', 'attended', 'sat', 'visited', 'travelled', 'traveled', 'spoke', 'presented'];

// Room nouns that the coarse venue string in the record never contains.
const ROOMS = ['dining hall', 'lecture hall', 'lecture theatre', 'lecture theater',
               'seminar room', 'common room', 'auditorium', 'great hall'];

// Staged scene detail: no record row describes what the room did.
const SCENES = ['sat in a circle', 'took turns being wrong'];

const HEADCOUNT = /\b(?:about|around|roughly|some|nearly|over|more than)?\s*(?:\d{1,4}|one|two|three|four|five|six|seven|eight|nine|ten|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|dozens of)\s+(?:people|persons?|attendees|participants|researchers|of us)\b/gi;

const IMPERSONATION = [
  /\bI\s+(?:rated|attended|sat|visited|travelled|traveled|presented|spoke)\b/i,
  /\bI\s+went\s+to\b/i,
  /\bmy\s+(?:week|trip|stay|visit|energy|attention|travel)\b/i,
  /\bwe\s+(?:sat|attended|travelled|traveled|met)\b/i
];

// Check 5 (rev 4). Deliberately narrow: "I was at a loss" must not fire, so the
// generic locative requires a capitalised name after it.
const ATTENDANCE = [
  /\bI\s+was\s+there\b/i,
  /\bI\s+was\s+present\b/i,
  /\bI\s+(?:have|had)\s+been\s+there\b/i,
  /\bwe\s+were\s+there\b/i,
  /\bI\s+went\s+there\b/i,
  /\bI\s+stayed\s+(?:there|in|at)\b/i,
  /\bI\s+attended\b/i,
  /\bI\s+was\s+at\s+(?=[A-Z])/
];

const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Does this text speak in the first person at all? Used to scope check 2 so that
// an ordinary third-person review naming a real person is not flagged.
export function hasFirstPerson(text) {
  const s = String(text || '');
  return /(^|[\s(])I[\s,']/.test(s) || /\bmy\b/i.test(s) || /\bme\b/i.test(s) || /\bwe\b/i.test(s);
}

// Sentences that mention a recorded venue. When no venues are supplied, fall back
// to sentences that mention the reader or speak in the first person, so the check
// still has a scope rather than silently covering everything.
function venueScope(flat, venues, names) {
  const sents = flat.split(/(?<=[.!?])\s+/);
  const hit = v => sents.filter(s => {
    const l = s.toLowerCase();
    if (l.indexOf(String(v).toLowerCase()) >= 0) return true;
    const head = String(v).split(',')[0].trim().toLowerCase();
    return head.length >= 4 && l.indexOf(head) >= 0;
  });
  let scope = [];
  for (const v of venues) scope = scope.concat(hit(v));
  if (!venues.length) {
    scope = sents.filter(s => names.some(n => s.indexOf(n) >= 0) || hasFirstPerson(s));
  }
  return scope.join(' ');
}

// Revision 4, for check 5: is the match inside quotation marks? A quoted presence
// claim belongs to whoever is being quoted. Unique top-level name: the deploy
// patcher inlines all four modules into one scope, so it must not collide.
function inQuotes(flat, idx) {
  let d = 0, s = 0;
  for (let i = 0; i < idx; i++) {
    const c = flat[i];
    if (c === '"') d++; else if (c === '\u201c') d++; else if (c === '\u201d') d--;
    else if (c === "'") s++;
  }
  return d % 2 === 1 || s % 2 === 1;
}

// opts: { names: ['Rowan'], venues: ['Wolfson College, Cambridge', ...] }
// Returns [{ kind, severity, span, why }]. severity is 'block' or 'warn' (rev 3).
// Empty array = nothing to block on voice grounds.
export function checkVoice(text, opts) {
  const o = opts || {};
  const names = (o.names && o.names.length) ? o.names : ['Rowan'];
  const venues = o.venues || [];
  const flat = String(text || '').replace(/\s+/g, ' ');
  const v = [];
  let m;

  // 1. impersonation -- WARN. The list is deliberately narrow but not exact, so
  //    an abstract "my attention was on the argument" is flagged (see header).
  for (const re of IMPERSONATION) {
    m = re.exec(flat);
    if (m) v.push({
      kind: 'impersonation', severity: 'warn', span: m[0],
      why: 'first-person claim of lived experience; the writer attended nothing'
    });
  }

  // 3. reader-as-subject -- WARN. The header above calls this "a review flag, not
  //    proof of impersonation"; companion_pieces.id=7 legitimately discusses a
  //    real person's property. A warn must not withdraw a piece.
  for (const n of names) {
    m = new RegExp('\\b' + esc(n) + "'s\\b").exec(flat);
    if (m) v.push({
      kind: 'reader-as-subject', severity: 'warn', span: m[0],
      why: 'reader named in the possessive: the piece is treating his life as material'
    });
  }

  // 2. attribution-seam -- BLOCK (only inside a first-person piece).
  //    This is the defect that shipped in companion_pieces.id=8.
  if (hasFirstPerson(flat)) {
    for (const n of names) {
      const re = new RegExp('\\b' + esc(n) + '\\b[^.!?]{0,80}?\\b(?:' + EXP_VERBS.join('|') + ')\\b', 'i');
      m = re.exec(flat);
      if (m) v.push({
        kind: 'attribution-seam', severity: 'block', span: m[0].slice(0, 80),
        why: 'reader named in the third person as the subject of an experience verb, in a piece that speaks in the first person'
      });
    }
  }

  // 4. invented particulars -- BLOCK, inside recorded-venue sentences only
  const scoped = venueScope(flat, venues, names);
  if (scoped) {
    const sl = scoped.toLowerCase();
    HEADCOUNT.lastIndex = 0;
    while ((m = HEADCOUNT.exec(scoped))) {
      v.push({
        kind: 'invented-particular', severity: 'block', span: m[0],
        why: 'headcount: no record row stores attendance numbers'
      });
    }
    for (const r of ROOMS) {
      if (sl.indexOf(r) < 0) continue;
      if (venues.some(x => String(x).toLowerCase().indexOf(r) >= 0)) continue;
      v.push({
        kind: 'invented-particular', severity: 'block', span: r,
        why: 'room-level venue detail; the record stores the venue only as a coarse string'
      });
    }
    for (const s of SCENES) {
      if (sl.indexOf(s) < 0) continue;
      v.push({
        kind: 'invented-particular', severity: 'block', span: s,
        why: 'staged scene detail; no record row describes the room'
      });
    }
  }

  // 5. first-person-attendance -- BLOCK when the piece names a recorded venue and
  //    the match is not quoted; WARN otherwise. Rev 4.
  //    Piece-wide co-occurrence, NOT sentence-scoped: the two-word edit measured
  //    above sits in its own sentence ("I was there for both, and they differed in
  //    ..."), so a sentence-scoped rule would have missed the very probe this check
  //    exists for.
  const venuePresent = venues.some(x => {
    const head = String(x).split(',')[0].trim().toLowerCase();
    const l = flat.toLowerCase();
    return l.indexOf(String(x).toLowerCase()) >= 0 || (head.length >= 4 && l.indexOf(head) >= 0);
  });
  for (const re of ATTENDANCE) {
    m = re.exec(flat);
    if (!m) continue;
    const quoted = inQuotes(flat, m.index);
    const block = venuePresent && !quoted;
    v.push({
      kind: 'first-person-attendance',
      severity: block ? 'block' : 'warn',
      span: m[0],
      why: block
        ? 'first-person presence claim in a piece that names a recorded venue; the writer attended nothing'
        : (quoted ? 'quoted presence claim; verify attribution'
                  : 'presence claim outside any recorded venue; verify against the record')
    });
  }

  return v;
}

// Convenience: the venue strings a caller should pass, pulled from the same rows
// grounding.js consumes. Kept here so callers do not hand-roll the field list.
export function venuesOf(rows) {
  return (rows || []).map(r => String((r && r.venue) || '')).filter(Boolean);
}

// Merge helper: grounding violations + voice violations go to publishPolicy as
// one array. Voice violations block exactly like ungrounded quantities.
export function mergeViolations() {
  const out = [];
  for (let i = 0; i < arguments.length; i++) {
    const a = arguments[i] || [];
    for (let j = 0; j < a.length; j++) out.push(a[j]);
  }
  return out;
}
