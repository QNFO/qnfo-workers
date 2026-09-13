// personal-companion/lib/filters.js
//
// Added 2026-09-13 by qnfo-ops (QRI-3). Pure functions only: no bindings, no I/O,
// no network. Safe to unit-test in isolation.
//
// WHY THIS EXISTS
// `FINDING-2026-09-13-standing-filters.md` (concurrent session, same day) identified a
// third defect class that grounding.js, voice.js and addressee.js all miss: the reader's
// own STANDING FILTERS. `loadProfile()` feeds every `profile` row with confidence >= 0.7
// into the generation context, and the `standing-filters` facet holds three rows.
// Verified read-only against PERSONAL.profile, 2026-09-13:
//
//   conf 1.00  agent-owned implementation decisions
//   conf 0.98  No physics/science books in reading recommendations
//   conf 0.95  No QPL/CWI topics in personal recommendations   ("as of 2026-08-25")
//
// The writer is handed the QPL/CWI row and writes the topic anyway. Measured
// (`instr(body_md,'QPL')` across all seven live pieces):
//
//   id 6  0 | id 7  0 | id 8  352 | id 9  0 | id 10  0 | id 11  0 | id 12  0
//
// One piece. companion_pieces.id=8 opens on QPL 2026 while the row forbidding QPL was in
// force (dated 2026-08-25; the piece was published 2026-09-12). A piece can be fully
// grounded, perfectly voiced, and still be something the reader asked not to be sent.
//
// THE MECHANISM, AND ITS HONEST LIMIT
// A gate can enforce an ENTITY deny-list: named things the reader has excluded. It cannot
// enforce a CATEGORY restriction ("no physics/science books") from a term list — that
// needs a subject classifier and belongs one level earlier, at `pickTopic()`, before
// anchors are fetched. The other session reached the same split. Only the entity list is
// implemented here, and the category row is explicitly NOT claimed as covered.
//
// WHY SOME TERMS ARE DELIBERATELY OMITTED
// The physics row names two titles: "The Information" (Gleick) and "The Order of Time"
// (Rovelli). Both are generic English phrases. Including them as substring terms would
// block correct prose — a sentence like "the information is not recoverable" would match.
// That is precisely the false-block failure mode grounding.js rev 2 and voice.js rev 2
// each record. They are therefore excluded, and the exclusion is stated rather than
// silent: to cover them, the check needs citation context (a title in italics, or a
// book-title pattern), not a bare phrase.
//
// The author names (Gleick, Rovelli) are unambiguous and ARE included.
//
// PARAMETERISED, NOT HARDCODED TO A PERSON
// `checkStandingFilters(text, { deny })` takes the term list as an argument, following
// addressee.js's rule that no person's particulars are baked into the fleet's code.
// `standingFilterDenyList()` builds it from the profile rows, so a filter added to the
// profile later can be honoured by extending ENTITY_DENY below — one place, with the
// source row named for each term.

// Each term is tied to the profile row it implements, so the list is auditable.
export const ENTITY_DENY = [
  { term: 'QPL',                            source: 'No QPL/CWI topics in personal recommendations', conf: 0.95 },
  { term: 'Quantum Physics and Logic',      source: 'No QPL/CWI topics in personal recommendations', conf: 0.95 },
  { term: 'CWI',                            source: 'No QPL/CWI topics in personal recommendations', conf: 0.95 },
  { term: 'Centrum Wiskunde & Informatica', source: 'No QPL/CWI topics in personal recommendations', conf: 0.95 },
  { term: 'Gleick',                         source: 'No physics/science books in reading recommendations', conf: 0.98 },
  { term: 'Rovelli',                        source: 'No physics/science books in reading recommendations', conf: 0.98 }
];

// Deliberately NOT in the list, with the reason recorded so the omission is visible:
//   'The Information'    - generic phrase; would match "the information is ..."
//   'The Order of Time'  - generic phrase; needs citation context to be safe
export const ENTITY_DENY_OMITTED = ['The Information', 'The Order of Time'];

const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Build the deny list from profile rows. Falls back to ENTITY_DENY when no rows are
// supplied, so a caller that has not been updated still gets the known filters.
export function standingFilterDenyList(rows) {
  const list = (rows || [])
    .filter(r => r && r.facet === 'standing-filters')
    .map(r => ({ term: String(r.label || ''), statement: String(r.statement || ''), conf: r.confidence }));
  return list.length ? list : ENTITY_DENY.slice();
}

// opts: { deny: [{term, source, conf}], terms: ['QPL', ...] }
// Returns [{ kind, severity, span, why }]. Empty array = no filter matched.
// Word-bounded and case-insensitive: 'QPL' matches "QPL 2026" but not "QPLX";
// 'CWI' matches the standalone token but not inside a longer word.
export function checkStandingFilters(text, opts) {
  const o = opts || {};
  const flat = String(text || '').replace(/\s+/g, ' ');
  let terms = o.terms;
  if (!terms) {
    const deny = o.deny || ENTITY_DENY;
    terms = deny.map(d => (typeof d === 'string' ? d : d.term)).filter(Boolean);
  }
  const v = [];
  for (const t of terms) {
    const re = new RegExp('(?<![A-Za-z0-9])' + esc(t) + '(?![A-Za-z0-9])', 'i');
    const m = re.exec(flat);
    if (!m) continue;
    const rec = (o.deny || ENTITY_DENY).find(d => d && d.term === t);
    v.push({
      kind: 'standing-filter', severity: 'block', span: m[0],
      why: 'matches a standing filter the reader set'
        + (rec && rec.source ? ': "' + rec.source + '"' + (rec.conf ? ' (conf ' + rec.conf + ')' : '') : '')
    });
  }
  return v;
}
