// personal-companion/lib/grounding.js
//
// Added 2026-09-12 by qnfo-ops. Pure functions only: no bindings, no I/O, no
// network. Safe to unit-test in isolation.
//
// WHY THIS EXISTS
// The published piece "The Understimulated Interval"
// (reading.q08.org/p/2026-09-12-essay-3bf32c8a197d2196, companion_pieces.id=8)
// asserts "Five days later, at QPL 2026". The KB (PERSONAL.activity) has
// LoF26 on 2026-08-10..2026-08-14 and QPL 2026 on 2026-08-17..2026-08-21.
// The gap is 7 days; 5 is LoF26's DURATION reused as the GAP.
//
// Two structural causes:
//   1. loadLife() emits KB rows as independent lines. Every relation BETWEEN
//      rows (interval, duration, equality of cost) is therefore computed by
//      the model rather than supplied to it.
//   2. No verification pass ran over KB-derived claims. The piece hedges its
//      external claims ("this is an inference, not something the sources
//      state") and asserts its autobiographical claims unhedged - the inverse
//      of what provenance discipline requires.
//
// FIX: (a) precompute relations and inject them as explicit anchors;
//      (b) verify extracted claims against those relations before publish;
//      (c) never serve a piece that fails (b), including forced fallbacks.

export const MON = { jan:1, feb:2, mar:3, apr:4, may:5, jun:6,
                     jul:7, aug:8, sep:9, oct:10, nov:11, dec:12 };

export const WORDNUM = { one:1, two:2, three:3, four:4, five:5, six:6,
                         seven:7, eight:8, nine:9, ten:10 };

const iso = (y, m, d) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const dayNum = s => Math.floor(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000);

// Parse an explicit range in a KB title, e.g. "(10-14 Aug)", anchored to the
// row's own year and month. Returns null when the title carries no range.
export function parseRange(title, anchorDate) {
  const m = /\((\d{1,2})\s*[-\u2013]\s*(\d{1,2})\s+([A-Za-z]{3})\)/.exec(title || '');
  if (!m) return null;
  const y = +anchorDate.slice(0, 4);
  const mo = MON[m[3].toLowerCase()];
  if (!mo) return null;
  return { start: iso(y, mo, +m[1]), end: iso(y, mo, +m[2]) };
}

// (a) Relations that must be SUPPLIED to the model, not inferred by it.
export function deriveTemporalFacts(rows) {
  const evs = (rows || []).map(r => {
    const rng = parseRange(r.title, r.date);
    const start = rng ? rng.start : r.date;
    const end = rng ? rng.end : r.date;
    return {
      title: r.title, start, end,
      duration: dayNum(end) - dayNum(start) + 1,
      energy: (r.energy === null || r.energy === undefined) ? null : r.energy,
      energy_label: r.energy_label || '',
      venue: r.venue || '', city: r.city || ''
    };
  });
  const gaps = [];
  for (let i = 0; i < evs.length; i++) {
    for (let j = i + 1; j < evs.length; j++) {
      const a = evs[i], b = evs[j];
      if (dayNum(a.start) <= dayNum(b.start)) {
        gaps.push({
          from: a.title, to: b.title,
          startGap: dayNum(b.start) - dayNum(a.start),
          endToStart: dayNum(b.start) - dayNum(a.end)
        });
      }
    }
  }
  return { evs, gaps };
}

// Render the derived relations as context lines. These are the numbers the
// model is allowed to state; anything else is an inference and must be marked.
export function injectFacts(facts) {
  const out = ['DERIVED RELATIONS (computed from the record; state these exactly, do not recompute)'];
  for (const e of facts.evs) {
    out.push(`- ${e.title} :: ${e.start} to ${e.end} = ${e.duration} days`
      + (e.energy_label ? ` :: energy=${e.energy_label}` : '')
      + (e.venue ? ` :: venue=${e.venue}` : ' :: venue NOT RECORDED'));
  }
  for (const g of facts.gaps) {
    out.push(`- GAP ${g.from} -> ${g.to} :: start-to-start = ${g.startGap} days, end-to-start = ${g.endToStart} days`);
  }
  out.push('If a quantity is not listed above, it is not known. Do not compute it, and do not compare two events on a quantity that is absent (cost, distance, effort).');
  return out;
}

// (b) Claims in generated prose that assert a checkable KB quantity.
export function extractClaims(text) {
  const t = String(text || '').replace(/\s+/g, ' ');
  const out = [];
  let m;

  const reInterval = /(\b(?:one|two|three|four|five|six|seven|eight|nine|ten|\d{1,3})\b)\s+days?\s+(later|after|before|apart|earlier)/gi;
  while ((m = reInterval.exec(t))) {
    out.push({ kind: 'interval', n: WORDNUM[m[1].toLowerCase()] || +m[1], rel: m[2].toLowerCase(), span: m[0] });
  }

  const reDuration = /\b(?:ran|lasted|spanned|took)\s+((?:one|two|three|four|five|six|seven|eight|nine|ten|\d{1,3}))\s+days?/gi;
  while ((m = reDuration.exec(t))) {
    out.push({ kind: 'duration', n: WORDNUM[m[1].toLowerCase()] || +m[1], span: m[0] });
  }

  const reEquality = /\b(?:cost|costs|took)\s+(?:roughly\s+|about\s+|nearly\s+|much\s+)?(?:the\s+)?same\b|\bsame\s+in\s+(?:travel|time|cost|effort|distance)\b|\bequally\s+(?:costly|long|distant|far)\b/gi;
  while ((m = reEquality.exec(t))) {
    out.push({ kind: 'comparative-equality', span: m[0] });
  }

  return out;
}

// (b) cont. A claim is a violation unless it matches a derived relation.
export function checkGrounding(text, facts) {
  const claims = extractClaims(text);
  const durations = facts.evs.map(e => e.duration);
  const gaps = [];
  for (const g of facts.gaps) { gaps.push(g.startGap, g.endToStart); }
  const uniq = a => [...new Set(a)].sort((x, y) => x - y);
  const v = [];
  for (const c of claims) {
    if (c.kind === 'duration' && durations.indexOf(c.n) < 0) {
      v.push({ ...c, why: `duration ${c.n}d matches no record (record durations: ${uniq(durations).join(', ')})` });
    }
    if (c.kind === 'interval' && gaps.indexOf(c.n) < 0) {
      v.push({ ...c, why: `interval ${c.n}d is not a computed gap (computed gaps: ${uniq(gaps).join(', ')})` });
    }
    if (c.kind === 'comparative-equality') {
      v.push({ ...c, why: 'equality asserted on a quantity no record populates' });
    }
  }
  return v;
}

// (c) Publish policy. This inverts the previous rule, which stored AND SERVED
// pieces that never passed the gate ("so the reading page is never empty").
// A gap in the reading page is now preferred to an ungrounded piece.
export function publishPolicy(o) {
  const quality = (o && o.quality) || {};
  const violations = (o && o.violations) || [];
  if (violations.length) {
    return {
      publish: false,
      gate: 'blocked-grounding',
      reason: `${violations.length} unsupported record-derived claim(s): ` + violations.map(x => x.span).join('; ')
    };
  }
  if (o && o.forced) {
    return { publish: false, gate: 'forced-unpublished', reason: 'code validation not passed; stored but not served' };
  }
  // NOTE: verdict "reject" is NOT a block. P_CRITIQUE instructs the critic to
  // look for reasons the piece is worthless, so "reject" is its expected output
  // and is not by itself evidence of a bad piece. Do not gate on it.
  return { publish: true, gate: 'passed', reason: quality.why || '' };
}
