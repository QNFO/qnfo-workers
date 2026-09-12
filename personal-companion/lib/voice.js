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
// That seam is the defect this module names: the piece cannot say "I am a model
// writing about you", and it does not want to say "I attended", so it says
// "Rowan rated it 5 out of 5" and then continues as "I". A reader who knows the
// facts will ask who "I" is. There is no answer in the text, because there is no
// narrator in the text other than the reader.
//
// THREE CHECKS
//   1. impersonation        - the writer asserting lived experience
//   2. attribution-seam     - the reader named in the third person inside a
//                             first-person piece
//   3. invented-particular  - scene detail the record does not hold
//
// SCOPE / KNOWN LIMITS
// These are surface checks, not a proof of authorship. They flag spans for a
// human or a policy to judge; they do not decide. A piece may legitimately name
// a real person in the third person (a review, a quotation) - check 2 is scoped
// to text that also speaks in the first person, and voice.test.js pins that
// scoping with a negative control. A headcount is flagged whenever it appears,
// because no record row stores one; if a headcount is ever added to the record,
// this check must be given the row rather than left as a blanket rule.

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

// opts: { names: ['Rowan'], venues: ['Wolfson College, Cambridge', ...] }
// Returns [{ kind, span, why }]. Empty array = nothing to block on voice grounds.
export function checkVoice(text, opts) {
  const o = opts || {};
  const names = (o.names && o.names.length) ? o.names : ['Rowan'];
  const venues = o.venues || [];
  const flat = String(text || '').replace(/\s+/g, ' ');
  const low = flat.toLowerCase();
  const v = [];
  let m;

  // 1. impersonation
  for (const re of IMPERSONATION) {
    m = re.exec(flat);
    if (m) v.push({
      kind: 'impersonation', span: m[0],
      why: 'first-person claim of lived experience; the writer attended nothing'
    });
  }

  // 2. attribution-seam (only inside a first-person piece)
  if (hasFirstPerson(flat)) {
    for (const n of names) {
      const re = new RegExp('\\b' + esc(n) + '\\b[^.!?]{0,80}?\\b(?:' + EXP_VERBS.join('|') + ')\\b', 'i');
      m = re.exec(flat);
      if (m) v.push({
        kind: 'attribution-seam', span: m[0].slice(0, 80),
        why: 'reader named in the third person as the subject of an experience verb, in a piece that speaks in the first person'
      });
    }
  }

  // 3. invented particulars
  HEADCOUNT.lastIndex = 0;
  while ((m = HEADCOUNT.exec(flat))) {
    v.push({
      kind: 'invented-particular', span: m[0],
      why: 'headcount: no record row stores attendance numbers'
    });
  }
  for (const r of ROOMS) {
    if (low.indexOf(r) < 0) continue;
    if (venues.some(x => String(x).toLowerCase().indexOf(r) >= 0)) continue;
    v.push({
      kind: 'invented-particular', span: r,
      why: 'room-level venue detail; the record stores the venue only as a coarse string'
    });
  }
  for (const s of SCENES) {
    if (low.indexOf(s) < 0) continue;
    v.push({
      kind: 'invented-particular', span: s,
      why: 'staged scene detail; no record row describes the room'
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
