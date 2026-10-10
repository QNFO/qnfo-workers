// Q08-RENDER-1 offline suite (q08-signal-engine 0.10.2, owner directive 2026-10-10): inline Markdown and math render in titles,
// headings, lists and previews; plain text in <title>, meta, JSON-LD, RSS and the citation tags; currency stays literal; the
// funnel copy makes no identifier claim. The real fetch handler over in-memory SQLite. Run: node q08-signal-engine/render.test.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const w = (await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href)).default;
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE published_pieces (id TEXT, signal_id TEXT, slug TEXT UNIQUE, title TEXT, body_md TEXT, core_concept TEXT, signal_source TEXT, published_at TEXT, sources_json TEXT, reads INTEGER DEFAULT 0, feedback_score REAL, kind TEXT DEFAULT 'analysis');
CREATE TABLE q08_daily_reads (day TEXT PRIMARY KEY, human INTEGER NOT NULL DEFAULT 0, crawler INTEGER NOT NULL DEFAULT 0);
CREATE TABLE q08_feedback (id INTEGER PRIMARY KEY, slug TEXT, signal TEXT, ip_key TEXT, note TEXT, created_at TEXT);
CREATE TABLE subscribers (email TEXT, status TEXT, token TEXT, created_at TEXT, confirmed_at TEXT);
CREATE TABLE q08_retractions (slug TEXT PRIMARY KEY, reason TEXT, claims_json TEXT, retracted_at TEXT);
CREATE TABLE q08_audits (slug TEXT PRIMARY KEY, verdict TEXT, stage TEXT, models TEXT, unsupported_json TEXT, checked_at TEXT);`);
const body1 = ["# The *clearinghouse* that paid itself first", "",
  "## A heading with *italic* and \\(x^2\\) in it", "",
  "A startup raised $870 million at a $7.5 billion valuation, and the hardware, at \\$20 000 a unit, stayed *unsold* and **late**.", "",
  "1. First step with `code_value` kept", "2. Second step with _emphasis_ here", "",
  "- a bullet with $x^2$ math", "", "> A quoted line with *italics*", "",
  "Snake_case_name and a*b*c stay literal."].join("\n");
const ins = db.prepare("INSERT INTO published_pieces (id, slug, title, body_md, core_concept, published_at) VALUES (?,?,?,?,?,?)");
ins.run("a", "2026-10-10-one", "The *clearinghouse* that paid itself first", body1, "mechanism", "2026-10-10T07:00:00Z");
ins.run("b", "2026-10-09-two", "Why \\(\\pi\\) leaks into $D_q^\\alpha$ and v_p^max", "# x\n\nPlain body about $5 and $6.", "c", "2026-10-09T07:00:00Z");
const shim = { prepare: (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; }, run: async () => { try { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; } catch (e) { return { meta: { changes: 0 } }; } }, first: async () => { try { return db.prepare(sql).get(...a) || null; } catch (e) { return null; } }, all: async () => { try { return { results: db.prepare(sql).all(...a) }; } catch (e) { return { results: [] }; } } }; return st; } };
const env = { DB: shim };
const ctx = { waitUntil() {} };
let pass = 0, fail = 0; const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 400) : "")); } };
const get = async (p) => { const r = await w.fetch(new Request("https://q08.org" + p), env, ctx); return { status: r.status, text: await r.text() }; };

const idx = await get("/");
ok(idx.status === 200, "index 200", idx.status);
ok(/<a class="q-item-title" href="\/p\/2026-10-10-one">The <em>clearinghouse<\/em> that paid itself first<\/a>/.test(idx.text), "index title renders italics", idx.text.match(/q-item-title[^<]*<[^>]*>[^<]*/g));
ok(/<a class="q-item-title" href="\/p\/2026-10-09-two">Why \\\(\\pi\\\) leaks into \\\(D_q\^\\alpha\\\) and v_p\^max<\/a>/.test(idx.text), "index title keeps math for MathJax and leaves v_p^max alone", idx.text.match(/Why[^<]*/g));
ok(/<p class="q-item-text">A heading with italic and x\u00b2 in it/.test(idx.text) && !/<p class="q-item-text">[^<]*(?:\*italic\*|\*\*|`|\\\(|^#)/.test(idx.text), "index preview is plain text: markers stripped, math as Unicode", idx.text.match(/q-item-text">[^<]*/g));
ok(/MathJax/.test(idx.text), "index page loads MathJax");

const pg = await get("/p/2026-10-10-one");
ok(pg.status === 200, "piece 200", pg.status);
ok(/<h1 class="q08-t">The <em>clearinghouse<\/em> that paid itself first<\/h1>/.test(pg.text), "h1 renders italics");
ok(/<title>The clearinghouse that paid itself first · q08<\/title>/.test(pg.text), "<title> is plain text", pg.text.match(/<title>[^<]*/));
ok(/<meta property="og:title" content="The clearinghouse that paid itself first · q08">/.test(pg.text), "og:title is plain");
ok(/<meta name="citation_title" content="The clearinghouse that paid itself first">/.test(pg.text), "citation_title is plain");
ok(/"headline":"The clearinghouse that paid itself first"/.test(pg.text), "JSON-LD headline is plain");
ok(/<h2>A heading with <em>italic<\/em> and \\\(x\^2\\\) in it<\/h2>/.test(pg.text), "body heading renders italics and math", pg.text.match(/<h2>[^<]*<em>[^\n]*/));
ok(pg.text.includes("$870 million at a $7.5 billion valuation"), "currency stays literal", pg.text.match(/startup raised[^<]*/));
ok(!/\\\([^)]*870/.test(pg.text), "currency is not typeset as math");
ok(pg.text.includes("at $20 000 a unit") && !pg.text.includes("\\$20"), "escaped dollar becomes a literal dollar");
ok(/<em>unsold<\/em> and <strong>late<\/strong>/.test(pg.text), "star italics and bold render");
ok(/<ol>\n<li>First step with <code>code_value<\/code> kept<\/li>\n<li>Second step with <em>emphasis<\/em> here<\/li>\n<\/ol>/.test(pg.text), "numbered list renders", pg.text.match(/<ol>[^\n]*/));
ok(/<li>a bullet with \\\(x\^2\\\) math<\/li>/.test(pg.text), "single-dollar math in a list item typesets");
ok(/<blockquote><p>A quoted line with <em>italics<\/em><\/p><\/blockquote>/.test(pg.text), "block quote renders");
ok(pg.text.includes("Snake_case_name and a*b*c stay literal."), "intraword markers stay literal");
ok(!/each with a DOI|zenodo|10\.5281/i.test(pg.text), "no DOI claim and no Zenodo on the page");
ok(/Open-access research papers<\/a><\/li>/.test(pg.text), "funnel copy has no identifier claim");

const pg2 = await get("/p/2026-10-09-two");
ok(pg2.text.includes("Plain body about $5 and $6."), "two currency amounts without TeX stay literal", pg2.text.match(/Plain body[^<]*/));
ok(/<title>Why π leaks into D_qᵅ? and v_p\^max|<title>Why π leaks into D_q\^α and v_p\^max · q08<\/title>/.test(pg2.text), "TeX title is plain Unicode in <title>", pg2.text.match(/<title>[^<]*/));

const feed = await get("/feed.xml");
ok(/<item><title>The clearinghouse that paid itself first<\/title>/.test(feed.text), "RSS title is plain", feed.text.slice(0, 400));
ok(!/<description>[^<]*(?:\*italic\*|\*\*|`|\\\()/.test(feed.text), "RSS description has no raw markers", feed.text.match(/<description>[^<]*/g));
console.log(fail ? "FAILED " + fail + " of " + (pass + fail) : "ok " + pass + " checks");
process.exit(fail ? 1 : 0);
