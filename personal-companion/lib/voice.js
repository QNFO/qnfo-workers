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
// FOUR CHECKS
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
// SCOPE / KNOWN LIMITS
// Surface checks, not proof of authorship. They flag spans for a policy or a
// human to judge; they do not decide. Check 2 is scoped to text that also speaks
// in the first person (a third-person review naming a real person is not
// flagged). If the record ever gains a headcount or a room, these checks must be
// given that row rather than left as blanket rules.
//
// KNOWN MISS, still open in rev 3: check 3 matches a STRAIGHT apostrophe only, so
// the typographic form is not caught here. addressee.js rev 2 handles both forms
// and is composed in by gate.js, so the union covers it. Do not rely on check 3 alone.

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
