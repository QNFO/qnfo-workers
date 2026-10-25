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

// The list helpers themselves (the block between gwJsonTry and the esbuild prelude): a JSON string holding keywords reads as that one
// keyword. qnfo-gateway 3.26.4 (#2679) added the line; the squash of PR 2680 deleted it with a VERSION rollback, and no row below caught it.
const helpers = new Function(src.slice(src.indexOf("function gwJsonTry"), src.indexOf("var __defProp")) + ";return { gwSplitKeywords, gwSplitAuthors };")();
eq(helpers.gwSplitKeywords('"single keyword"'), ["single keyword"], "gwSplitKeywords decodes a JSON string");
eq(helpers.gwSplitKeywords("a, b; c"), ["a", "b", "c"], "gwSplitKeywords splits plain text on commas and semicolons");
eq(helpers.gwSplitAuthors('"Ada Lovelace"'), ["Ada Lovelace"], "gwSplitAuthors decodes a JSON string");

const errors = [];
const origError = console.error;
console.error = (...a) => { errors.push(a.join(" ")); };
const rows = ROWS.map((r, i) => ({ slug: "pf-" + i, title: "Paper " + i, authors: r.authors, abstract: "Abstract " + i, created_at: "2026-10-0" + (1 + (i % 9)) + " 00:00:00", first_published_at: "2026-10-0" + (1 + (i % 9)) + " 00:00:00", last_revised_at: "2026-10-10 00:00:00", updated_at: "", doi: "", version: "1.0.0", version_semver: "1.1.0", version_count: i === 0 ? 2 : 1, language: "en", keywords: r.keywords, license: "cc-by-4.0" }));
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
  eq(it.quality_label, "High-quality scholarly research", "quality classification of row " + i);
  eq(it.peer_review_status, "Not independently peer-reviewed", "peer-review status of row " + i);
  ok(it.quality_basis.includes("not a claim of independent peer review"), "quality basis is transparent for row " + i);
}
ok(items.every((it) => it.authors.every((n) => !/^(null|true|false|-?\d[\d.]*|[{\[].*)$/.test(n) || n === "[not json")), "no author name is JSON text (null, a number, true, an object)", items.map((it) => it.authors));
const record = await get("/api/papers/pf-0");
ok(record.s === 200, "single-paper API record answers 200", record.s);
const recordJson = JSON.parse(record.t);
eq(recordJson.datacite.subjects.slice(-3).map((x) => x.subject), ["High-quality scholarly research", "open-access scholarly work", "versioned research publication"], "DataCite subjects carry publisher classification tags");
ok(recordJson.datacite.descriptions.some((x) => x.descriptionType === "Other" && x.description.includes("not a claim of independent peer review")), "DataCite description documents the classification basis");
const openapi = await get("/openapi.json");
ok(openapi.s === 200, "OpenAPI answers 200", openapi.s);
const openapiJson = JSON.parse(openapi.t);
ok(openapiJson.components.schemas.Paper.properties.quality_label.type === "string", "OpenAPI documents quality metadata");
const feed = await get("/feed.json");
ok(feed.s === 200, "/feed.json answers 200", feed.s);
let fi = [];
try { fi = JSON.parse(feed.t).items || []; } catch (e) { ok(false, "/feed.json is JSON", feed.t.slice(0, 200)); }
ok(fi.length === ROWS.length, "/feed.json carries every row", fi.length);
const tagged = fi.find((x) => /pf-4$/.test(x.id));
eq(tagged && tagged.tags, ["primon gas", "zeta function", "partition function", "High-quality scholarly research", "open-access scholarly work", "versioned research publication"], "feed tags split on ';' and include classification");
eq(tagged && tagged._qnfo && tagged._qnfo.peer_review_status, "Not independently peer-reviewed", "feed identifies review status");
ok(tagged.summary.includes("Publisher quality classification: High-quality scholarly research."), "feed summary exposes the classification to consumers that ignore custom fields");
ok(tagged.summary.includes("Peer-review status: Not independently peer-reviewed."), "feed summary explicitly discloses review status");
ok(tagged.summary.includes("Basis: QNFO publisher classification"), "feed summary explains the classification basis");
const versionFeed = await get("/feed-versions.json");
ok(versionFeed.s === 200, "new-version JSON Feed answers 200", versionFeed.s);
const versionItems = JSON.parse(versionFeed.t).items;
const versionItem = versionItems.find((x) => x.id.includes("/pf-0#v"));
ok(versionItem && versionItem.summary.includes("Publisher quality classification: High-quality scholarly research."), "version feed summary exposes the classification", versionItems);
ok(versionItem && versionItem.summary.includes("Peer-review status: Not independently peer-reviewed."), "version feed summary discloses review status", versionItems);
const oai = await get("/oai?verb=ListRecords&metadataPrefix=oai_dc");
ok(oai.s === 200, "/oai ListRecords answers 200", oai.s);
ok(oai.t.includes("<dc:type>Peer review: Not independently peer-reviewed</dc:type>"), "OAI-DC states peer-review status");
ok(oai.t.includes("<dc:type>Editorial quality: High-quality scholarly research</dc:type>"), "OAI-DC states publisher classification");
const rss = await get("/rss.xml");
ok(rss.s === 200, "new-paper RSS answers 200", rss.s);
ok(rss.t.includes("<qnfo:quality>High-quality scholarly research</qnfo:quality>"), "RSS identifies publisher classification");
ok(rss.t.includes("<qnfo:peer_review_status>Not independently peer-reviewed</qnfo:peer_review_status>"), "RSS identifies review status");
ok(rss.t.includes("Publisher quality classification: High-quality scholarly research.") && rss.t.includes("Peer-review status: Not independently peer-reviewed."), "RSS description exposes classification and review status to basic feed readers", rss.t.slice(0, 1800));
const versionRss = await get("/rss/versions.xml");
ok(versionRss.s === 200, "new-version RSS answers 200", versionRss.s);
ok(versionRss.t.includes("Publisher quality classification: High-quality scholarly research.") && versionRss.t.includes("Peer-review status: Not independently peer-reviewed."), "version RSS description includes classification and review status", versionRss.t.slice(0, 1800));
console.error = origError;
eq(errors.filter((e) => /SyntaxError|JSON|is not valid/.test(e)), [], "no JSON parse error is logged while serving plain-text authors and keywords");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
