#!/usr/bin/env node
/**
 * scripts/math-render-guard.mjs — MATH-RENDER-1 fleet guard.
 *
 * WHAT   Fetches each fleet HTML surface, strips script/style/pre/code, scans
 *        the remaining content for LaTeX delimiters, parses the page's own
 *        MathJax config exactly as the browser would, and fails when a
 *        delimiter appears in content that the page cannot typeset.
 * WHY    This fleet has twice shipped a MathJax config whose delimiters parse
 *        to a bare paren, and once shipped a surface with no config at all.
 *        Both defects are invisible in the source and obvious to a reader.
 * SCOPE  Read-only HTTP. Exit 0 = every surface typesets what it prints.
 *
 * Usage: node scripts/math-render-guard.mjs [--json]
 */

const SURFACES = [
  { id: 'q08-index',        url: 'https://q08.org/' },
  { id: 'q08-piece-math',   url: 'https://q08.org/p/2026-09-14-openai-navierstokesandeuler-xkyddp' },
  { id: 'q08-piece-plain',  url: 'https://q08.org/p/2026-09-14-why-is-google-still-serving-dodgy-ads-7vhnvp' },
  { id: 'reading-q08',      url: 'https://reading.q08.org/' },
  { id: 'ideas-qnfo',       url: 'https://ideas.qnfo.org/' },
  { id: 'papers-qnfo',      url: 'https://papers.qnfo.org/papers/7-autaxys-defined' },
  { id: 'qnfo-org',         url: 'https://qnfo.org/' }
];

const NEEDED_INLINE  = ['$', '\\('];
const NEEDED_DISPLAY = ['$$', '\\['];

function stripNoise(html) {
  return String(html)
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<pre[\s\S]*?<\/pre>/gi, ' ')
    .replace(/<code[\s\S]*?<\/code>/gi, ' ');
}
function countToken(s, token) {
  let n = 0, i = 0;
  while ((i = s.indexOf(token, i)) !== -1) { n++; i += token.length; }
  return n;
}
function readConfig(html) {
  const m = String(html).match(/window\.MathJax\s*=\s*(\{[\s\S]*?\})\s*;/);
  if (!m) return null;
  try { return new Function('return ' + m[1])(); } catch (e) { return { __parseError: String(e.message) }; }
}
async function probe(s) {
  const url = s.url + (s.url.includes('?') ? '&' : '?') + 'cb=' + Date.now();
  const res = await fetch(url, { headers: { 'User-Agent': 'q08-math-guard/1.0 (+https://q08.org)' } });
  const html = await res.text();
  const content = stripNoise(html);
  const used = {
    inlineParen: countToken(content, String.fromCharCode(92) + '(') ,
    displayBracket: countToken(content, String.fromCharCode(92) + '['),
    doubleDollar: countToken(content, '$$')
  };
  const cfg = readConfig(html);
  const inline = cfg && cfg.tex && cfg.tex.inlineMath ? JSON.stringify(cfg.tex.inlineMath) : null;
  const display = cfg && cfg.tex && cfg.tex.displayMath ? JSON.stringify(cfg.tex.displayMath) : null;
  const problems = [];
  if (used.inlineParen || used.displayBracket || used.doubleDollar) {
    if (!cfg) problems.push('content carries LaTeX but the page declares no MathJax config');
    else {
      if (used.inlineParen && !(inline && inline.includes('\\\\(\\\\)'.replace('\\)', '') + '\)'))) {
        if (!(inline && inline.includes(String.fromCharCode(92, 92) + '('))) problems.push('content has \\( but inlineMath lacks the backslash-paren delimiter');
      }
      if (used.displayBracket && !(display && display.includes(String.fromCharCode(92, 92) + '['))) problems.push('content has \\[ but displayMath lacks the backslash-bracket delimiter');
      if (used.doubleDollar && !(display && display.includes('$$'))) problems.push('content has $$ but displayMath lacks the double-dollar delimiter');
    }
  }
  if (cfg && !cfg.__parseError && inline && !inline.includes(String.fromCharCode(92, 92) + '(')) {
    problems.push('inlineMath delimiters do not contain a backslash-paren token (config resolves to a bare paren)');
  }
  return { id: s.id, status: res.status, used, inline, display, problems, ok: problems.length === 0 };
}

const rows = [];
for (const s of SURFACES) {
  try { rows.push(await probe(s)); }
  catch (e) { rows.push({ id: s.id, status: 0, problems: ['fetch failed: ' + e.message], ok: false }); }
}
if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 1));
} else {
  for (const r of rows) {
    console.log((r.ok ? 'PASS' : 'FAIL') + '  ' + r.id.padEnd(16) + ' http=' + r.status +
      ' inline=' + (r.inline || 'none') + ' display=' + (r.display || 'none') +
      ' content: \\(=' + (r.used ? r.used.inlineParen : '?') + ' \\[=' + (r.used ? r.used.displayBracket : '?') + ' $$=' + (r.used ? r.used.doubleDollar : '?') +
      (r.problems.length ? '  -> ' + r.problems.join('; ') : ''));
  }
}
const bad = rows.filter(r => !r.ok);
console.log(bad.length ? 'MATH-RENDER-GUARD: ' + bad.length + ' violation(s)' : 'MATH-RENDER-GUARD: all ' + rows.length + ' surfaces OK');
process.exit(bad.length ? 1 : 0);
