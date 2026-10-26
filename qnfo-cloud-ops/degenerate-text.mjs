// DEGENERATE-TEXT-1 (2026-10-26, pillar research): the one deterministic detector for degenerate model output, shared by the gates.
// Source of truth for the block between the DEGENERATE-TEXT-BEGIN / DEGENERATE-TEXT-END markers. qnfo-cloud-ops/worker.js carries a
// byte-identical copy (degenerate-text.test.mjs fails when the two differ); qnfo-research-exec/worker.js takes the same copy
// (code task on agent_issues DEGENERATE-TEXT-PRODUCER-1, closing probe: the marker is in that file).
//
// Why it exists. On 2026-10-26 paper qnf-d66c40b5 (Passive Fault Tolerance via Bruhat-Tits Tree Codes) was published with an 8,122-token
// "Te Te Te ..." loop and a 24,586-character wall of "The paper is written in LaTeTe ..." ahead of its Abstract. The reconcile model looped,
// its 24 k-character output passed the "shorter than 10,000 characters" test, the complete stage wrote the real paper after it, and no review,
// verify or release gate looked for repetition: the release gate scores length, so the loop raised the score to 100.
//
// What it reads. Markdown with fenced code, display and inline math and table rows blanked (those repeat legitimately), split on
// whitespace into tokens. A region is degenerate when
//   (a) one alphabetic token repeats back to back DEGEN_RUN_MIN times or more,
//   (b) a unit of 2..DEGEN_GRAM_MAX tokens repeats back to back DEGEN_GRAM_REPS times and covers DEGEN_GRAM_SPAN tokens or more, or
//   (c) a window of DEGEN_WINDOW alphabetic tokens holds DEGEN_WINDOW_DISTINCT distinct tokens or fewer (the near-periodic loop
//       "LaTeTe / LaTeTeTe / LaTeTeTeTe" that no exact period describes; ordinary prose holds 90 to 120 distinct tokens in 160).
// A paper is withdrawn-class when one region covers DEGEN_WITHDRAW_SPAN tokens or all regions together cover DEGEN_WITHDRAW_SHARE of its tokens.
// DEGEN_PREHEADING_MAX bounds the text ahead of the first heading, which the same failure filled.

// DEGENERATE-TEXT-BEGIN
// DEGENERATE-TEXT-1 (2026-10-26, pillar research): deterministic detector for degenerate model output (a token or phrase repeated back to back, a
// near-periodic low-entropy loop), for text ahead of the first heading and for fragment titles. Copy of qnfo-cloud-ops/degenerate-text.mjs.
var DEGEN_RUN_MIN = 16;
var DEGEN_GRAM_MAX = 12;
var DEGEN_GRAM_REPS = 6;
var DEGEN_GRAM_SPAN = 36;
var DEGEN_WINDOW = 160;
var DEGEN_WINDOW_DISTINCT = 14;
var DEGEN_WITHDRAW_SPAN = 200;
var DEGEN_WITHDRAW_SHARE = 0.05;
var DEGEN_PREHEADING_MAX = 1500;
function degenBlank(md) {
  var NLc = String.fromCharCode(10);
  var blank = function(m) { return m.replace(/[^\n]/g, " "); };
  var s = String(md == null ? "" : md).replace(/```[\s\S]*?```/g, blank).replace(/~~~[\s\S]*?~~~/g, blank).replace(/\$\$[\s\S]*?\$\$/g, blank).replace(/\\\[[\s\S]*?\\\]/g, blank).replace(/\\\([\s\S]*?\\\)/g, blank).replace(/\$[^$\n]{1,400}\$/g, blank);
  return s.split(NLc).map(function(line) { return /^\s*\|/.test(line) ? line.replace(/[^\n]/g, " ") : line; }).join(NLc);
}
function degenTokens(s) {
  var re = /\S+/g, m, out = [];
  while ((m = re.exec(s)) !== null) {
    var t = m[0].toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    out.push({ t: t, a: /\p{L}/u.test(t), s: m.index, e: m.index + m[0].length });
  }
  return out;
}
function degenMerge(spans) {
  spans.sort(function(x, y) { return x[0] - y[0] || x[1] - y[1]; });
  var out = [];
  for (var i = 0; i < spans.length; i++) {
    var last = out.length ? out[out.length - 1] : null;
    if (last && spans[i][0] <= last[1]) { if (spans[i][1] > last[1]) last[1] = spans[i][1]; }
    else out.push([spans[i][0], spans[i][1]]);
  }
  return out;
}
function degenRuns(tok) {
  var T = tok.length, spans = [];
  for (var n = 1; n <= DEGEN_GRAM_MAX; n++) {
    var i = 0;
    while (i + n < T) {
      if (tok[i].t !== tok[i + n].t) { i++; continue; }
      var j = i;
      while (j + n < T && tok[j].t === tok[j + n].t) j++;
      var span = j - i + n, reps = Math.floor(span / n), alpha = 0, seen = Object.create(null), distinct = 0;
      for (var k = i; k < i + n; k++) {
        if (tok[k].a) alpha++;
        if (!seen[tok[k].t]) { seen[tok[k].t] = 1; distinct++; }
      }
      var hit = n === 1 ? (span >= DEGEN_RUN_MIN && alpha === 1) : (reps >= DEGEN_GRAM_REPS && span >= DEGEN_GRAM_SPAN && alpha >= 1 && distinct >= 2);
      if (hit) spans.push([i, j + n]);
      i = j + 1;
    }
  }
  return spans;
}
function degenWindows(tok) {
  var A = [], spans = [];
  for (var i = 0; i < tok.length; i++) if (tok[i].a) A.push(i);
  if (A.length < DEGEN_WINDOW) return spans;
  var cnt = Object.create(null), distinct = 0;
  for (var k = 0; k < A.length; k++) {
    var t = tok[A[k]].t;
    if (!cnt[t]) { cnt[t] = 1; distinct++; } else cnt[t]++;
    if (k >= DEGEN_WINDOW) { var o = tok[A[k - DEGEN_WINDOW]].t; cnt[o]--; if (cnt[o] === 0) distinct--; }
    if (k >= DEGEN_WINDOW - 1 && distinct <= DEGEN_WINDOW_DISTINCT) spans.push([A[k - DEGEN_WINDOW + 1], A[k] + 1]);
  }
  return spans;
}
function degenTrim(tok, span) {
  // A window region reaches up to DEGEN_WINDOW_DISTINCT real tokens past a loop's edge. The loop's own vocabulary is the tokens that occur four
  // times or more inside the region; its extent is the first to the last run of eight alphabetic tokens that all belong to that vocabulary.
  var a = span[0], b = span[1], cnt = Object.create(null), pos = [], k;
  for (k = a; k < b; k++) if (tok[k].a) { cnt[tok[k].t] = (cnt[tok[k].t] || 0) + 1; pos.push(k); }
  var inV = pos.map(function(p) { return cnt[tok[p].t] >= 4; });
  var firstBlock = -1, lastBlock = -1, run = 0;
  for (k = 0; k < pos.length; k++) {
    run = inV[k] ? run + 1 : 0;
    if (run >= 8) { if (firstBlock < 0) firstBlock = k - 7; lastBlock = k; }
  }
  if (firstBlock < 0) return span;
  var lo = firstBlock, hi = lastBlock;
  while (lo > 0 && inV[lo - 1]) lo--;
  while (hi + 1 < pos.length && inV[hi + 1]) hi++;
  return [pos[lo], pos[hi] + 1];
}
function degenerateTextScan(md) {
  var tok = degenTokens(degenBlank(md));
  var wins = degenMerge(degenWindows(tok)).map(function(w) { return degenTrim(tok, w); });
  var merged = degenMerge(degenRuns(tok).concat(wins)), T = tok.length, covered = 0, longest = 0, cuts = [];
  for (var i = 0; i < merged.length; i++) {
    var len = merged[i][1] - merged[i][0];
    covered += len;
    if (len > longest) longest = len;
    cuts.push([tok[merged[i][0]].s, tok[merged[i][1] - 1].e]);
  }
  var share = T ? covered / T : 0;
  var found = merged.length > 0;
  var withdraw = found && (longest >= DEGEN_WITHDRAW_SPAN || share >= DEGEN_WITHDRAW_SHARE);
  var sample = found ? String(md).slice(cuts[0][0], Math.min(cuts[0][1], cuts[0][0] + 40)).replace(/\s+/g, " ").trim() : "";
  var reason = found ? "degenerate-text " + covered + " of " + T + " tokens repeat (" + Math.round(share * 1000) / 10 + "%), longest " + longest + ", from \"" + sample + "\"" : "";
  return { found: found, withdraw: withdraw, tokens: T, degenerateTokens: covered, longest: longest, share: share, regions: merged.length, cuts: cuts, reason: reason };
}
function degenerateTextStrip(md) {
  var src = String(md == null ? "" : md);
  var scan = degenerateTextScan(src);
  if (!scan.found) return { text: src, removedChars: 0, scan: scan };
  var out = "", pos = 0;
  for (var i = 0; i < scan.cuts.length; i++) {
    var from = scan.cuts[i][0], to = scan.cuts[i][1];
    // a loop that fills its line (nine tenths or more) takes the few words ahead of it and after it on that line
    var ls = src.lastIndexOf("\n", from - 1) + 1, le = src.indexOf("\n", to);
    if (le < 0) le = src.length;
    if ((to - from) >= 0.9 * (le - ls)) { from = ls; to = le; }
    if (from < pos) from = pos;
    out += src.slice(pos, from);
    pos = to;
  }
  out += src.slice(pos);
  out = out.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
  return { text: out, removedChars: src.length - out.length, scan: scan };
}
function preHeadingText(md) {
  var s = String(md == null ? "" : md).replace(/^\uFEFF/, "");
  var fm = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(s);
  var from = fm ? fm[0].length : 0;
  var h = /^#{1,6}[ \t]+\S/m.exec(s.slice(from));
  var pre = h ? s.slice(from, from + h.index).trim() : "";
  return { chars: pre.length, head: pre.slice(0, 80), hasHeading: !!h };
}
function titleDefects(title) {
  var t = String(title == null ? "" : title).trim(), out = [];
  if (/[.!?]\s+claim\s*:\s/i.test(t)) out.push("claim-prefix");
  if (t.length > 100 && /\s[a-z]$/.test(t)) out.push("single-letter-tail");
  return out;
}
// DEGENERATE-TEXT-END

export { DEGEN_RUN_MIN, DEGEN_GRAM_MAX, DEGEN_GRAM_REPS, DEGEN_GRAM_SPAN, DEGEN_WINDOW, DEGEN_WINDOW_DISTINCT, DEGEN_WITHDRAW_SPAN, DEGEN_WITHDRAW_SHARE, DEGEN_PREHEADING_MAX, degenBlank, degenTokens, degenerateTextScan, degenerateTextStrip, preHeadingText, titleDefects };
