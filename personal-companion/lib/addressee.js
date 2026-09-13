// personal-companion/lib/addressee.js
//
// Added 2026-09-13 by qnfo-ops. Pure functions only: no bindings, no I/O, no
// network. Safe to unit-test in isolation. See addressee.test.js.
//
// WHY THIS EXISTS — the gap voice.js leaves
// voice.js (2026-09-12) catches the reader named as the subject of an EXPERIENCE
// VERB within 80 characters. Measured 2026-09-13 by replicating its exact regexes
// against the real rejection text from companion_runs id=442:
//
//   attribution-seam on "# Field Notes for Rowan\n\n## Notation Systems..."
//     -> null        no experience verb near the name, so the check has nothing to bind to
//   reader-as-subject on "Rowan's work on the seams ..."
//     -> "Rowan's"   straight apostrophe: caught
//   reader-as-subject on "Rowan\u2019s work on the seams ..."
//     -> null        TYPOGRAPHIC apostrophe: missed
//
// Both misses are live. companion_runs id=442 (2026-09-13T06:06:17Z) shows the
// writer emitting "# Field Notes for Rowan" as the piece's own H1, and
// "Rowan's work on the seams between mathematics and music" in the body. The run
// was rejected, but on `unverified names` ("Notation Systems, Cognitive
// Scaffolds, Interdependent Computation, Playful Convergence, Double Fugue, Live
// Counterpoint") — the two-word capitalised-pair heuristic in worker.js
// unverifiedNames(). The reader's own name was never tested for, because
// nameCandidates() requires TWO capitalised words and "Rowan" is one token.
// The same gap is why companion_pieces.id=8 shipped reading "Rowan rated it 5 out
// of 5 for felt energy": no rule in the shipped gate could fire on a one-word name.
//
// REVISION 2 (same day) — a measured bug in revision 1
// Revision 1 built the bare-mention regex with flags 'g' only, so "Rowan" matched
// and "rowan rated it 5" did NOT. The suite in addressee.test.js caught it:
// 18 passed, 4 failed. Revision 2 uses flags 'gi'. The three other failures were
// wrong expectations in the test file, not module faults, and are corrected there.
// Same discipline grounding.js and voice.js record for their own revision 2: a
// check that silently misses is worse than no check.
//
// THREE CHECKS, TWO SEVERITIES
//   reader-in-heading  block  the piece's own heading names the addressee
//   reader-address     block  "for Rowan", "to Rowan", "dear Rowan", "about Rowan"
//   reader-named       warn   the addressee's name appears anywhere in the body
//
// A bare mention is a WARN, not a block, deliberately. The serial "The Hand That
// Signs" carries the disclaimer "Rowan's own handwriting is not the subject
// here." — it names him in order to EXCLUDE him, which is legitimate prose. A
// blanket block would reject it, and a false block is as damaging as a false pass;
// voice.js records the same trade in its own revision 2. Callers wanting the
// strict rule filter with blockingViolations().
//
// NOTE ON OVERLAP, measured: "# Field Notes for Rowan" produces TWO blocking
// violations — reader-in-heading and reader-address ("for Rowan") — because the
// address-frame pattern matches inside a heading. That is intended: either alone
// is sufficient to block, and the caller sees both reasons.
//
// NOTE ON THE EMPTY LIST: passing { names: [] } falls back to the default name
// rather than disabling the check, because an empty array is falsy on .length.
// To test a different reader, pass that name. To disable the check, do not call it.
//
// The name list is a parameter rather than a constant, so no person's name is
// baked into the fleet's code.

export function checkAddressee(text, opts) {
  var o = opts || {};
  var names = (o.names && o.names.length) ? o.names : ['Rowan'];
  var src = String(text == null ? '' : text);
  var flat = src.replace(/\s+/g, ' ');
  var out = [];
  function esc(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  // 1. markdown heading that names the addressee  (observed: "# Field Notes for Rowan")
  var lines = src.split(/\r?\n/);
  for (var li = 0; li < lines.length; li++) {
    var line = lines[li];
    if (!/^\s{0,3}#{1,6}\s/.test(line)) continue;
    for (var hi = 0; hi < names.length; hi++) {
      if (new RegExp('\\b' + esc(names[hi]) + '\\b', 'i').test(line)) {
        out.push({ kind: 'reader-in-heading', severity: 'block',
                   span: line.trim().slice(0, 80),
                   why: 'heading names the addressee: the piece is addressed to him, not about him' });
      }
    }
  }
  // 2. address frames + 3. bare mention (straight or typographic apostrophe, any case)
  for (var ni = 0; ni < names.length; ni++) {
    var n = names[ni];
    var mA = new RegExp('\\b(?:for|to|dear|about)\\s+' + esc(n) + '\\b', 'i').exec(flat);
    if (mA) out.push({ kind: 'reader-address', severity: 'block', span: mA[0],
                       why: 'explicit address of the briefing addressee' });
    var reAny = new RegExp('\\b' + esc(n) + '(?:[\\u2019\\x27]s)?\\b', 'gi'); // rev 2: was 'g'
    var m;
    while ((m = reAny.exec(flat)) !== null) {
      var a = Math.max(0, m.index - 45);
      var b = Math.min(flat.length, m.index + m[0].length + 45);
      out.push({ kind: 'reader-named', severity: 'warn', span: flat.slice(a, b),
                 why: 'addressee named in body text' });
      if (m.index === reAny.lastIndex) reAny.lastIndex++;
    }
  }
  var seen = {}, uniq = [];
  for (var ui = 0; ui < out.length; ui++) {
    var k = out[ui].kind + '|' + out[ui].span;
    if (seen[k]) continue;
    seen[k] = 1; uniq.push(out[ui]);
  }
  return uniq;
}

// The strict subset. Use this when a caller wants the hard rule.
export function blockingViolations(violations) {
  var out = [];
  for (var i = 0; i < (violations || []).length; i++) {
    if (violations[i].severity === 'block') out.push(violations[i]);
  }
  return out;
}
