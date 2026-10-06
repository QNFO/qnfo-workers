#!/usr/bin/env node
// scripts/math-corpus-check.mjs: full-corpus check of the qnfo-gateway paper renderer (MATH-TYPESET-1, MATH-RESIDUE-2).
//
// WHAT   Renders every public paper exactly as its page does (paperRenderHtml in qnfo-gateway/worker.js), counts render
//        defects with the guard's own renderDefectCount (metric paper_render_defect_pages, trigger 498), and compiles every
//        run pseudoMath() typesets with KaTeX. With --base <old worker.js> it also renders each page with the old renderer and
//        reports pages changed, prose words (4+ letters) visible before but not after, and changes in structural tags.
// WHY    The gateway comments cite this check (9,056 runs, 0 KaTeX failures) but the script was never committed, so the
//        remedy ladder of trigger 498 named a tool nobody could run. A typesetter change ships only when KaTeX failures stay
//        0 and no prose word is lost.
// USAGE  npm install --no-save katex@0.16   (once, anywhere on the module path)
//        node scripts/math-corpus-check.mjs [--worker qnfo-gateway/worker.js] [--base old-worker.js] [--cache corpus.json] [--json]
//        Without --cache it reads the corpus from https://papers.qnfo.org (list pages of 200, then each paper's JSON) and,
//        with --cache, saves it there for the next run. Read-only HTTP; exit 1 when any KaTeX failure or lost prose word.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const WORKER = arg("--worker", "qnfo-gateway/worker.js"), BASE = arg("--base", null), CACHE = arg("--cache", null), JSON_OUT = process.argv.includes("--json");
let katex;
try { katex = createRequire(import.meta.url)("katex"); } catch (e) { console.error("katex not found: npm install --no-save katex@0.16"); process.exit(2); }

function load(path, record) {
  const src = readFileSync(path, "utf8").replace(/^export \{[^}]*\};?\s*$/mg, "").replace(/^export default /m, "var __def = ").replace(/^import [^;]*;/mg, "");
  const sb = { console: { log() {}, error() {}, warn() {} }, Date, JSON, Math, Number, String, RegExp, Set, Map, Array, Object, Promise, URL, Response, Request, Headers, TextEncoder, TextDecoder, crypto, setTimeout, clearTimeout, encodeURIComponent, decodeURIComponent, atob, btoa, __rec: record || (() => {}) };
  vm.createContext(sb);
  vm.runInContext(src, sb);
  vm.runInContext("var __pm = pseudoMath; pseudoMath = function (text, save, stats) { return __pm(text, function (tex, s2) { __rec(tex, s2); return save(tex, s2); }, stats); };", sb);
  return sb;
}
async function corpus() {
  if (CACHE && existsSync(CACHE)) return JSON.parse(readFileSync(CACHE, "utf8"));
  const H = { Accept: "application/json", "User-Agent": "qnfo-math-corpus-check" };
  const slugs = [];
  for (let off = 0; off < 5000; off += 200) {
    const j = await (await fetch("https://papers.qnfo.org/papers?format=json&limit=200&offset=" + off, { headers: H })).json();
    (j.papers || []).forEach((p) => slugs.push(p.slug));
    if (!j.papers || j.papers.length < 200) break;
  }
  const out = [];
  let i = 0;
  const worker = async () => { while (i < slugs.length) { const s = slugs[i++]; try { const d = await (await fetch("https://papers.qnfo.org/papers/" + encodeURIComponent(s), { headers: H })).json(); out.push({ slug: s, title: d.title, body_md: d.body_md || "" }); } catch (e) { out.push({ slug: s, err: String(e) }); } } };
  await Promise.all([worker(), worker(), worker(), worker()]);
  if (CACHE) writeFileSync(CACHE, JSON.stringify(out));
  return out;
}

const emitted = [];
const W = load(WORKER, (tex, src) => emitted.push({ tex, src }));
const B = BASE ? load(BASE) : null;
const rows = (await corpus()).filter((r) => r.body_md && !r.err);
const visible = (h) => h.replace(/<[^>]+>/g, " ").replace(/&[a-z#0-9]+;/g, " ");
const prose = (h) => visible(h).replace(/\$[^$]*\$/g, " ").split(/\s+/).filter((w) => /^[A-Za-z]{4,}$/.test(w));
const tags = (h) => (h.match(/<(p|h[1-6]|li|table|strong|em|a)\b/g) || []).length;
let defectPages = 0, katexFail = [], changed = 0, lost = [], tagDelta = 0;
for (const row of rows) {
  const at = emitted.length;
  const h = W.paperRenderHtml(row);
  if (W.renderDefectCount(h) !== 0) defectPages++;
  for (const e of emitted.slice(at)) { try { katex.renderToString(e.tex, { throwOnError: true, strict: false }); } catch (err) { katexFail.push({ slug: row.slug, tex: e.tex, src: e.src, err: String(err.message).slice(0, 160) }); } }
  if (B) {
    const hb = B.paperRenderHtml(row);
    if (hb !== h) {
      changed++;
      tagDelta += Math.abs(tags(hb) - tags(h));
      const now = visible(h);
      for (const w of new Set(prose(hb))) if (now.indexOf(w) < 0) lost.push(row.slug + ": " + w);
    }
  }
}
const summary = { worker: WORKER, pages: rows.length, defectPages, typesetRuns: emitted.length, katexFailures: katexFail.length };
if (B) Object.assign(summary, { base: BASE, changedPages: changed, lostProseWords: lost.length, structuralTagDelta: tagDelta });
if (JSON_OUT) console.log(JSON.stringify({ summary, katexFail, lost }, null, 1));
else { console.log(JSON.stringify(summary)); katexFail.slice(0, 20).forEach((f) => console.log("KATEX " + f.slug + ": " + f.tex + " :: " + f.err)); lost.slice(0, 20).forEach((l) => console.log("LOST " + l)); }
process.exit(katexFail.length || lost.length ? 1 : 0);
