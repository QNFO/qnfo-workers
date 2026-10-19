// PAPER-FIELDS-1 + GW-JSON-QUIET-1 + GW-PAPER-AUTHORS-SCALAR-1 offline suite (qnfo-gateway 3.25.1, #99979 #99957 #99989 #99998, 100061).
// papers.authors and papers.keywords hold a JSON array in most living-paper rows and plain text in the rest
// ("QNFO Research", "Tuomo Kiiskinen, Oscar Kivinen, Manuel A Rivas", "a; b; c", "", NULL). Each must read as a list,
// and serving /feed.json, /api/papers and /oai over such rows must log no error: Workers Observability files every
// console.error as an error group, which is how 3.24.x's global JSON.parse wrapper produced ~300 errors a hour.
// Run: node qnfo-gateway/paper-fields.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + String(typeof x === "string" ? x : JSON.stringify(x)).slice(0, 400) : "")); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m, { got: a, want: b });

ok(!/JSON\.parse\s*=\s*function/.test(src), "no global JSON.parse override (it logged every caught SyntaxError)");
ok(/where: "handlePaperContext", slug: [^\n]*stack: String\(e && e\.stack/.test(src), "paper-context rejection log carries err.stack");

// The real value shapes read from living-paper.papers on 2026-10-19.
const ROWS = [
  { authors: '["Rowan Brad Quni-Gudzinas"]', keywords: null, a: ["Rowan Brad Quni-Gudzinas"], k: [] },
  { authors: '["QNFO Research"]', keywords: "", a: ["Rowan Brad Quni-Gudzinas"], k: [] },
  { authors: '[{"name": "Rowan Brad Quni-Gudzinas"}]', keywords: '["p-adic","ultrametric"]', a: ["Rowan Brad Quni-Gudzinas"], k: ["p-adic", "ultrametric"] },
  { authors: "QNFO Research", keywords: "distinction lattice,eigenform,coalgebra", a: ["Rowan Brad Quni-Gudzinas"], k: ["distinction lattice", "eigenform", "coalgebra"] },
  { authors: "QNFO", keywords: "primon gas; zeta function; partition function", a: ["Rowan Brad Quni-Gudzinas"], k: ["primon gas", "zeta function", "partition function"] },
  { authors: "QNFO Research / QWAV", keywords: "   ", a: ["Rowan Brad Quni-Gudzinas"], k: [] },
  { authors: "QNFO Research (autonomous agent review)", keywords: null, a: ["Rowan Brad Quni-Gudzinas"], k: [] },
  { authors: "QNFO Research Pipeline", keywords: null, a: ["Rowan Brad Quni-Gudzinas"], k: [] },
  { authors: "Rowan Brad Quni-Gudzinas", keywords: "Fast Fourier Transform, Langlands program", a: ["Rowan Brad Quni-Gudzinas"], k: ["Fast Fourier Transform", "Langlands program"] },
  { authors: "Tuomo Kiiskinen, Oscar Kivinen, Manuel A Rivas", keywords: null, a: ["Tuomo Kiiskinen", "Oscar Kivinen", "Manuel A Rivas"], k: [] },
  { authors: "Ada Lovelace and Charles Babbage", keywords: null, a: ["Ada Lovelace", "Charles Babbage"], k: [] },
  { authors: "Lovelace, Ada; Babbage, Charles", keywords: null, a: ["Lovelace, Ada", "Babbage, Charles"], k: [] },
  { authors: "Quni-Gudzinas, Rowan Brad", keywords: null, a: ["Rowan Brad Quni-Gudzinas"], k: [] },
  { authors: "", keywords: "[]", a: [], k: [] },
  { authors: null, keywords: '"single keyword"', a: [], k: ["single keyword"] },
  { authors: "[not json", keywords: "{broken", a: ["[not json"], k: ["{broken"] },
  // GW-PAPER-AUTHORS-SCALAR-1 (agent_issues 100061): JSON that is not a list of names holds no author name.
  { authors: "null", keywords: null, a: [], k: [] },
  { authors: "123", keywords: null, a: [], k: [] },
  { authors: "true", keywords: null, a: [], k: [] },
  { authors: '{"name":"Ada Lovelace"}', keywords: null, a: ["Ada Lovelace"], k: [] },
  { authors: '{"id":7}', keywords: null, a: [], k: [] },
  { authors: "Alice, Bob", keywords: null, a: ["Alice", "Bob"], k: [] },
  { authors: "Lovelace, Ada Augusta", keywords: null, a: ["Lovelace, Ada Augusta"], k: [] },
  { authors: "Quni-Gudzinas, Rowan", keywords: null, a: ["Quni-Gudzinas, Rowan"], k: [] }
];

const errors = [];
const origError = console.error;
console.error = (...a) => { errors.push(a.join(" ")); };
const rows = ROWS.map((r, i) => ({ slug: "pf-" + i, title: "Paper " + i, authors: r.authors, abstract: "Abstract " + i, created_at: "2026-10-0" + (1 + (i % 9)) + " 00:00:00", updated_at: "", doi: "", version: "1.0.0", language: "en", keywords: r.keywords, license: "cc-by-4.0" }));
const stmt = (sql) => { const st = { a: [], bind(...a) { st.a = a; return st; },
  async all() { if (/LIMIT \? OFFSET \?/.test(sql)) { const lim = st.a[st.a.length - 2], off = st.a[st.a.length - 1]; return { results: rows.slice(off, off + lim) }; } return { results: rows }; },
  async first() { if (/COUNT/.test(sql)) return { n: rows.length }; if (/MIN\(/.test(sql)) return { m: "2026-10-01 00:00:00" }; const slug = st.a[st.a.length - 1]; return rows.find((r) => r.slug === slug) || null; },
  async run() { return {}; } }; return st; };
const env = { LIVING_PAPER: { prepare: stmt }, DB: { prepare: stmt }, QNFO_BUCKET: { get: async () => null } };
globalThis.fetch = async () => new Response("", { status: 404 });
const gw = (await import(pathToFileURL(join(here, "worker.js")).href)).default;
const get = async (path) => { const r = await gw.fetch(new Request("https://papers.qnfo.org" + path), env, { waitUntil() {} }); return { s: r.status, t: await r.text() }; };

const api = await get("/api/papers?limit=50");
ok(api.s === 200, "/api/papers answers 200", api.s);
let items = [];
try { items = JSON.parse(api.t).items || []; } catch (e) { ok(false, "/api/papers is JSON", api.t.slice(0, 200)); }
ok(items.length === ROWS.length, "every row is served", items.length);
for (const it of items) {
  const i = Number(it.slug.slice(3));
  eq(it.authors, ROWS[i].a, "authors of row " + i + " (" + JSON.stringify(ROWS[i].authors) + ")");
  eq(it.keywords, ROWS[i].k, "keywords of row " + i + " (" + JSON.stringify(ROWS[i].keywords) + ")");
}
ok(items.every((it) => it.authors.every((n) => !/^(null|true|false|-?\d[\d.]*|[{\[].*)$/.test(n) || n === "[not json")), "no author name is JSON text (null, a number, true, an object)", items.map((it) => it.authors));
const feed = await get("/feed.json");
ok(feed.s === 200, "/feed.json answers 200", feed.s);
let fi = [];
try { fi = JSON.parse(feed.t).items || []; } catch (e) { ok(false, "/feed.json is JSON", feed.t.slice(0, 200)); }
ok(fi.length === ROWS.length, "/feed.json carries every row", fi.length);
const tagged = fi.find((x) => /pf-4$/.test(x.id));
eq(tagged && tagged.tags, ["primon gas", "zeta function", "partition function"], "feed tags split on ';'");
const oai = await get("/oai?verb=ListRecords&metadataPrefix=oai_dc");
ok(oai.s === 200, "/oai ListRecords answers 200", oai.s);
console.error = origError;
eq(errors.filter((e) => /SyntaxError|JSON|is not valid/.test(e)), [], "no JSON parse error is logged while serving plain-text authors and keywords");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
