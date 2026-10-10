// Q08-VERIFY-1 offline suite (q08-signal-engine 0.10.0): the accuracy layer. A piece is published only when every name, year and
// figure in it is in the source material and two reviewers from other model families find no unsupported claim; a reviewer outage
// fails closed; a published piece that fails the same test is retracted in public (410 notice, gone from index, feed, sitemap,
// APIs, queued social rows; forecasts built on it too). The flagged 2026-10-10 piece (invented "trial stamps", patent-medicine and
// rating-agency history) is the regression case. Run: node q08-signal-engine/verify.test.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const mod = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href);
const w = mod.default, V = mod.__verify;
let fails = 0, passes = 0;
const check = (l, c, x) => { if (c) passes++; else { fails++; console.log("FAIL " + l + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 500) : "")); } };

// ---- the directives no longer ask for facts from memory ----------------------------------------------------------------------
check("the essay directive forbids facts from memory and has no historical-precedent requirement", /Your own memory is NOT a source/.test(V.Q08_DIRECTIVE) && !/drawn from real, verifiable history/.test(V.Q08_DIRECTIVE) && !/HISTORY RHYMES/.test(V.Q08_DIRECTIVE) && !/guild\W?s forged marks/.test(V.Q08_DIRECTIVE) && /fact-checked/.test(V.Q08_DIRECTIVE));
check("the forecast directive forbids borrowed cases", /Your memory is not a source/.test(V.FORECAST_DIRECTIVE) && !/Name a real, well-known case/.test(V.FORECAST_DIRECTIVE));
check("the register exemplar is a labelled hypothetical", /hypothetical/i.test(V.REGISTER_EXEMPLAR) && !/early 1970s/.test(V.REGISTER_EXEMPLAR));

// ---- deterministic grounding ---------------------------------------------------------------------------------------------------
const source = "An AI model from Anthropic submitted a tip to police about an unsolved murder in Philadelphia. The tip was false, according to detectives, who said they spent 12 hours checking it. Commenters on Hacker News argued that nobody reviews machine-written tips before they reach an investigator.";
const bad = [
  "# A false tip and a trust that cannot be checked", "",
  "An AI model from Anthropic submitted a tip about an unsolved murder in Philadelphia, and detectives spent 12 hours checking it.", "",
  "Medieval goldsmiths in London stamped each piece with a trial stamp, and in 1363 the guild began assaying silver before it left the shop. The stamp was a promise that someone else had looked.", "",
  "In 1906 Dr. Kilmer's Swamp Root sold on the strength of testimonials until the Pure Food and Drug Act forced labels. The Ford Pinto showed the same pattern in 1971, and Dodd-Frank came after the rating agencies failed.", "",
  "worth your time: yes - it names the mechanism."
].join("\n");
const probs = V.groundingProblems(bad, source);
check("invented history is caught: unsupported years", probs.some((p) => /1363/.test(p)) && probs.some((p) => /1906/.test(p)) && probs.some((p) => /1971/.test(p)), probs);
check("invented history is caught: unsupported names", probs.some((p) => /Kilmer/.test(p)) && probs.some((p) => /Pinto/.test(p)) && probs.some((p) => /Dodd/.test(p)) && probs.some((p) => /Pure Food/.test(p)), probs);
check("what the source says is not flagged", !probs.some((p) => /Anthropic|Philadelphia|12\b|Hacker/.test(p)), probs);
const good = "# A false tip nobody reviewed\n\nAn AI model from Anthropic submitted a tip to police about an unsolved murder in Philadelphia. Detectives said they spent 12 hours checking a tip that was false. Suppose a hospital accepted machine-written referrals the same way: the first person to read one would be the one acting on it.\n\nworth your time: yes - mechanism.";
check("a source-grounded piece with a labelled hypothetical has no problems", V.groundingProblems(good, source).length === 0, V.groundingProblems(good, source));
check("an invented figure is caught", V.groundingProblems("The tip cost detectives 40 hours and $3,000.", source).length >= 2);
check("small counts are allowed, large unsupported ones are not", V.groundingProblems("There are two ways this fails, and 9 steps between them.", source).length === 0 && V.groundingProblems("There are 300 steps between them.", source).length === 1);
check("future years and probabilities are allowed in a forecast, not in an essay", V.groundingProblems("The standard lands by 2027 at 60 percent within 90 days.", source, { forecast: true, today: "2026-10-10" }).length === 0 && V.groundingProblems("The standard lands by 2027 at 60 percent.", source, { today: "2026-10-10" }).length >= 1);
check("a sentence-initial common word is not a name", V.groundingProblems("Detectives said so. Nobody reviews them. Commenters argued it.", source).length === 0);

// ---- fact-check verdicts -------------------------------------------------------------------------------------------------------
check("verdict parser: pass, fail, junk", V.parseFactVerdict('{"unsupported":[],"verdict":"pass"}').verdict === "pass" && V.parseFactVerdict('{"unsupported":["x -- not in source"],"verdict":"fail"}').unsupported.length === 1 && V.parseFactVerdict("no json") === null && V.parseFactVerdict('{"verdict":"maybe"}') === null);
check("a pass that lists unsupported claims is a fail; a fail with none still fails with a reason", V.parseFactVerdict('{"unsupported":["a"],"verdict":"pass"}').verdict === "fail" && V.parseFactVerdict('{"unsupported":[],"verdict":"fail"}').unsupported.length === 1);

let calls = [];
let script = () => '{"unsupported":[],"verdict":"pass"}';
const AI = { run: async (model, input) => { const c = input.messages[0].content; calls.push({ model, c }); if (/strict fact-checker/.test(c)) { const r = script(model, c); if (r instanceof Error) throw r; return { response: r }; } return { response: "" }; } };
const env0 = { AI, DB: null, AUDIT: null };
{
  calls = [];
  const r = await V.verifyPiece(env0, bad, source, "@cf/openai/gpt-oss-120b", "s1", {});
  check("a grounding failure never reaches the model reviewers", !r.ok && r.stage === "grounding" && calls.length === 0, r);
}
{
  calls = []; script = () => '{"unsupported":[],"verdict":"pass"}';
  const r = await V.verifyPiece(env0, good, source, "@cf/openai/gpt-oss-120b", "s2", {});
  const fams = new Set(calls.map((c) => mod.__quality.familyOf(c.model)));
  check("two reviewers from two families, neither the writer's, both pass", r.ok && calls.length === 2 && fams.size === 2 && !fams.has(mod.__quality.familyOf("@cf/openai/gpt-oss-120b")), { ok: r.ok, n: calls.length, fams: [...fams] });
  check("the reviewers see the source material and the draft but not the verdict line", calls.every((c) => /SOURCE MATERIAL/.test(c.c) && /A false tip nobody reviewed/.test(c.c) && !/worth your time/.test(c.c)));
}
{
  let n = 0;
  script = () => (n++ === 0 ? '{"unsupported":["Dodd-Frank came after -- not in source"],"verdict":"fail"}' : '{"unsupported":[],"verdict":"pass"}');
  const r = await V.factCheck(env0, good, source, "@cf/openai/gpt-oss-120b", "s3");
  check("one failing reviewer fails the piece and its claim is reported", !r.ok && r.unsupported.length === 1 && r.judges.length === 2, r);
}
{
  script = () => new Error("model down"); calls = [];
  const r = await V.verifyPiece(env0, good, source, "@cf/openai/gpt-oss-120b", "s4", {});
  check("a reviewer outage fails closed and is marked unavailable", !r.ok && r.unavailable === true && /unavailable/.test(r.problems[0]), r);
  script = (m) => /nvidia|gpt-oss/.test(m) ? new Error("down") : '{"unsupported":[],"verdict":"pass"}';
  const r3 = await V.verifyPiece(env0, good, source, "@cf/zzz/writer", "s5", {});
  check("one reviewer down is replaced by the next family, not waved through", r3.unavailable === true || r3.ok === true && r3.judges.length === 2, r3);
}

// ---- retraction and audit over in-memory SQLite -------------------------------------------------------------------------------
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE published_pieces (id TEXT, signal_id TEXT, slug TEXT UNIQUE, title TEXT, body_md TEXT, core_concept TEXT, signal_source TEXT, published_at TEXT, sources_json TEXT, reads INTEGER DEFAULT 0, feedback_score REAL, kind TEXT DEFAULT 'analysis');
CREATE TABLE engine_runs (id INTEGER PRIMARY KEY, status TEXT, error TEXT, ran_at TEXT DEFAULT (datetime('now')), piece_published INTEGER DEFAULT 0);
CREATE TABLE signal_log (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, title TEXT, url TEXT, points INTEGER, num_comments INTEGER, ratio REAL, volatility_score REAL, friction_point TEXT, signal_strength TEXT, status TEXT, processed_at TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE prompt_pool (id TEXT PRIMARY KEY, piece_id TEXT, structure_md TEXT, active INTEGER DEFAULT 1, performance_score REAL DEFAULT 0, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE q08_daily_reads (day TEXT PRIMARY KEY, human INTEGER NOT NULL DEFAULT 0, crawler INTEGER NOT NULL DEFAULT 0);
CREATE TABLE q08_feedback (id INTEGER PRIMARY KEY, slug TEXT, signal TEXT, ip_key TEXT, note TEXT, created_at TEXT);
CREATE TABLE subscribers (email TEXT, status TEXT, token TEXT, created_at TEXT, confirmed_at TEXT);
CREATE TABLE q08_forecasts (id INTEGER PRIMARY KEY AUTOINCREMENT, piece_id TEXT, slug TEXT UNIQUE, source_slug TEXT, claim TEXT, probability REAL, horizon TEXT, resolution TEXT, watch_query TEXT, watch_urls TEXT, alternatives_json TEXT, indicators_json TEXT, evidence_json TEXT, created_at TEXT, status TEXT, outcome TEXT, brier REAL, checks INTEGER DEFAULT 0, last_check_at TEXT, resolved_at TEXT, disposition TEXT);`);
const now = new Date().toISOString();
const ins = (slug, title, body, sig, kind) => db.prepare("INSERT INTO published_pieces (id, signal_id, slug, title, body_md, core_concept, signal_source, published_at, kind) VALUES (?,?,?,?,?,?,?,?,?)").run("p-" + slug, sig, slug, title, body, "c", "hn:1", now, kind || "analysis");
db.prepare("INSERT INTO signal_log (id, source, source_id, title, url, friction_point, status, processed_at) VALUES ('sigA','hn','hn:1','AI model submits false tip',NULL,?, 'published', ?)").run(source, now);
db.prepare("INSERT INTO signal_log (id, source, source_id, title, url, friction_point, status, processed_at) VALUES ('sigB','hn','hn:2','Another',NULL,?, 'published', ?)").run(source, now);
ins("bad-essay", "A false tip and a trust that cannot be checked", bad.replace(/^# .*\n/, ""), "sigA");
ins("good-essay", "A false tip nobody reviewed", good.replace(/^# .*\n/, ""), "sigB");
ins("bad-child", "Forecast built on the bad essay", "Detectives will review machine tips. Forecast text that states the claim at 60 percent.", "sigA", "forecast");
db.prepare("INSERT INTO q08_forecasts (piece_id, slug, source_slug, claim, probability, horizon, resolution, created_at, status) VALUES ('p-bad-child','bad-child','bad-essay','c',0.6,'2027-03-01','r',?, 'open')").run(now);
const shim = { prepare: (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; }, run: async () => { const r = db.prepare(sql).run(...a); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) }; return st; } };
const suppressed = [];
const audit = { prepare: (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; }, first: async () => null, run: async () => { if (/UPDATE social_threads SET status = 'suppressed'/.test(sql)) suppressed.push(a[0]); return { meta: { changes: 1 } }; }, all: async () => ({ results: [] }) }; return st; } };
const env = { DB: shim, AUDIT: audit, AI };
const origFetch = globalThis.fetch; globalThis.fetch = async () => new Response("{}", { status: 200 });
script = () => '{"unsupported":[],"verdict":"pass"}';
{
  script = () => new Error("reviewers down");
  const r = await V.auditPublished(env, 5);
  check("with the reviewers down the audit defers: nothing is retracted or marked passed", r.ok && r.deferred >= 1 && db.prepare("SELECT COUNT(*) n FROM q08_retractions").get().n === 0 && db.prepare("SELECT COUNT(*) n FROM q08_audits").get().n === 0 || (r.retracted === 1 && db.prepare("SELECT COUNT(*) n FROM q08_audits WHERE slug='bad-essay'").get().n === 1), r);
}
db.exec("DELETE FROM q08_retractions; DELETE FROM q08_audits; UPDATE q08_forecasts SET status='open', disposition=NULL;");
script = () => '{"unsupported":[],"verdict":"pass"}';
const r1 = await V.auditPublished(env, 10);
check("the audit retracts the piece with invented history (grounding stage) and passes the sourced one", r1.retracted >= 1 && db.prepare("SELECT verdict FROM q08_audits WHERE slug='bad-essay'").get().verdict === "fail" && db.prepare("SELECT verdict FROM q08_audits WHERE slug='good-essay'").get().verdict === "pass", r1);
check("a forecast built on a retracted essay is retracted and voided with it", db.prepare("SELECT COUNT(*) n FROM q08_retractions WHERE slug='bad-child'").get().n === 1 && db.prepare("SELECT status, disposition FROM q08_forecasts WHERE slug='bad-child'").get().status === "void", db.prepare("SELECT * FROM q08_retractions").all());
check("queued social rows for a retracted piece are suppressed", suppressed.length >= 1 && suppressed.some((p) => /bad-essay/.test(p)), suppressed);
const ctx = { waitUntil() {} };
const get = (path) => w.fetch(new Request("https://q08.org" + path, { headers: { "user-agent": "Mozilla/5.0 Safari" } }), env, ctx);
{
  const pg = await get("/p/bad-essay"), t = await pg.text();
  check("a retracted piece answers 410 with a public notice, not its text", pg.status === 410 && /Retracted: A false tip and a trust/.test(t) && /retractions/.test(t) && !/Kilmer/.test(t) && /noindex/.test(t), t.slice(0, 300));
  const ok = await get("/p/good-essay");
  check("a verified piece is still served", ok.status === 200 && /A false tip nobody reviewed/.test(await ok.text()));
  check("citation files are not served for a retracted piece", (await get("/p/bad-essay.bib")).status === 404);
  const idx = await (await get("/")).text(), feed = await (await get("/feed.xml")).text(), sm = await (await get("/sitemap.xml")).text(), api = await (await get("/api/pieces")).text();
  check("a retracted piece is gone from the index, feed, sitemap and API", !/bad-essay/.test(idx + feed + sm + api) && /good-essay/.test(idx + sm + api), { idx: /bad-essay/.test(idx), feed: /bad-essay/.test(feed), sm: /bad-essay/.test(sm), api: /bad-essay/.test(api) });
  const rp = await (await get("/retractions")).text(), ra = await (await get("/api/retractions")).json();
  check("the retractions page and API list it", /bad-essay/.test(rp) && ra.retractions.some((x) => x.slug === "bad-essay"), ra);
  const fapi = await (await get("/api/forecasts")).json();
  check("the forecast ledger omits the retracted forecast", !fapi.forecasts.some((f) => f.slug === "bad-child"), fapi.forecasts.length);
}
{
  const again = await V.auditPublished(env, 10);
  check("an audited piece is not audited again", again.checked === 0, again);
}
globalThis.fetch = origFetch;
console.log("verify.test.mjs: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
