// Q08-YIELD-1 offline suite (q08-signal-engine 0.31.0, charter pillar: research, cost second; agent_issues 99929, 99930).
// Proves: (1) every generation insert logs source_chars, source_kind, compose_calls, verify_calls, panel_calls and factcheck_calls, through nullable columns the worker
// adds itself to a table created elsewhere (pragma_table_info guard), and a failed bootstrap never costs a run its row; (2) the thin-source
// test is the floor learned from the ok runs that logged a source size (flat THIN_MIN_ARTICLE until five exist), a source below it ends
// the run as skipped before any compose call, and the skipped candidates are retried after 24 hours with the next ones ahead of them;
// (3) a repair round that prunes the same claim classes an earlier round pruned and leaves the draft under the floor stops, instead of
// spending a model revision to extend it. PUBLISH_MIN_CHARS stays 2800.
// Run: node q08-signal-engine/source-sufficiency.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { readFileSync } from "node:fs";
const here = dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(join(here, "worker.js")).href);
const G = mod.__gen, V = Object.assign({ publishBody: mod.__analysis.publishBody }, mod.__verify);
const src = readFileSync(join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 500) : "")); } };

// ---- 0. the floors the goal forbids touching
ok(mod.__analysis.PUBLISH_MIN_CHARS === 2800, "PUBLISH_MIN_CHARS stays 2800", mod.__analysis.PUBLISH_MIN_CHARS);
ok(G.MIN_GROUND_CHARS === 2200 && G.THIN_MIN_ARTICLE === 600, "the rich-source floor and the article minimum are unchanged", [G.MIN_GROUND_CHARS, G.THIN_MIN_ARTICLE]);

// ---- 1. the floor is derived from logged ok runs, never guessed
ok(G.sourceFloorFrom([]) === null && G.sourceFloorFrom([2400, 2500, 3000, 2600]) === null, "fewer than five logged ok runs: no learned floor (the flat test stays)");
ok(G.sourceFloorFrom([1500, 2600, 3000, 2800, 4100, 2300]) === 1500, "five or more: the thinnest source that published", G.sourceFloorFrom([1500, 2600, 3000, 2800, 4100, 2300]));
ok(G.sourceFloorFrom([null, 0, "x", 1700, 3000, 2800, 4100, 1900]) === 1700 && G.sourceFloorFrom([null, 0, "x", 1700, 3000, 2800, 4100]) === null, "unlogged and non-numeric sizes are ignored and not counted", G.sourceFloorFrom([null, 0, "x", 1700, 3000, 2800, 4100, 1900]));
ok(G.sourceFloorFrom([9000, 9500, 8000, 7000, 12000]) === 2200, "the floor never exceeds the rich-source threshold", G.sourceFloorFrom([9000, 9500, 8000, 7000, 12000]));
ok(G.thinSourceVerdict(null, 2000).why === "none" && G.thinSourceVerdict({ art: "x".repeat(599), glen: 5000 }, null).why === "no-text", "no candidate, or under 600 characters of article, is refused as before");
ok(G.thinSourceVerdict({ art: "x".repeat(900), glen: 1200 }, null).ok === true, "with no learned floor a 600+ article candidate passes the flat test (behaviour before enough runs are logged)");
const tv = G.thinSourceVerdict({ art: "x".repeat(900), glen: 1200 }, 1500);
ok(tv.ok === false && tv.why === "below-floor" && tv.floor === 1500, "below the learned floor is refused", tv);
ok(G.thinSourceVerdict({ art: "x".repeat(900), glen: 1500 }, 1500).ok === true, "at the floor it passes");
ok(G.sourceKindOf({ source: "arxiv" }, 100) === "arxiv+summary" && G.sourceKindOf({ source: "hn" }, 5000) === "hn+fulltext" && G.sourceKindOf({}, 700) === "hn+fulltext", "source_kind says where the signal came from and whether the full article was read");
ok(G.claimClassesOf(["unsupported claim: a", "figure not in the source: 12", "unsupported claim: b", "pruning left a short draft"]).join() === "unsupported claim,figure not in the source", "claim classes are the leading labels of the flagged items");

// ---- helpers: an in-memory q08-signal D1 whose engine_runs predates the new columns
function makeDb() {
  G.resetRunColumns(); // the bootstrap flag is per isolate; each fixture database starts without the columns
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE engine_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ran_at TEXT DEFAULT (datetime('now')), signals_scraped INTEGER DEFAULT 0, signals_scored INTEGER DEFAULT 0, piece_published INTEGER DEFAULT 0, top_signal TEXT, model TEXT, ms INTEGER DEFAULT 0, status TEXT, error TEXT)");
  db.exec("CREATE TABLE published_pieces (id TEXT PRIMARY KEY, signal_id TEXT, slug TEXT UNIQUE, title TEXT, body_md TEXT, body_html TEXT, core_concept TEXT, signal_source TEXT, published_at TEXT, reads INTEGER DEFAULT 0, feedback_score REAL DEFAULT 0, promoted INTEGER DEFAULT 0, sources_json TEXT, kind TEXT DEFAULT 'analysis', property TEXT)");
  db.exec("CREATE TABLE signal_log (id TEXT PRIMARY KEY, source TEXT NOT NULL, source_id TEXT, title TEXT, url TEXT, points INTEGER DEFAULT 0, num_comments INTEGER DEFAULT 0, ratio REAL DEFAULT 0, volatility_score REAL DEFAULT 0, friction_point TEXT, signal_strength TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')), processed_at TEXT)");
  db.exec("CREATE TABLE q08_retractions (slug TEXT PRIMARY KEY, reason TEXT, claims_json TEXT, retracted_at TEXT)");
  db.exec("CREATE TABLE prompt_pool (id TEXT PRIMARY KEY, piece_id TEXT, structure_md TEXT NOT NULL, performance_score REAL DEFAULT 0, reads INTEGER DEFAULT 0, active INTEGER DEFAULT 1, created_at TEXT DEFAULT (datetime('now')))");
  const shim = { prepare: (sql) => { let a = []; const st = { bind: (...x) => { a = x; return st; }, run: async () => { db.prepare(sql).run(...a); return { meta: {} }; }, first: async () => db.prepare(sql).get(...a) || null, all: async () => ({ results: db.prepare(sql).all(...a) }) }; return st; } };
  return { db, shim };
}
const cols = (db) => db.prepare("SELECT name FROM pragma_table_info('engine_runs')").all().map((r) => r.name);

// ---- 2. the schema bootstrap and the insert helper
{
  const { db, shim } = makeDb();
  const env = { DB: shim, q08Meter: { compose: 3, verify: 5, panel: 2, factcheck: 3 } };
  await G.insertRun(env, { scraped: 4, scored: 3, published: 0, top: "hn:x", model: "m", ms: 1200, status: "gate_failed", error: "e", sourceChars: 1834.4, sourceKind: "hn+fulltext" });
  const c = cols(db);
  ok(["source_chars", "source_kind", "compose_calls", "verify_calls", "panel_calls", "factcheck_calls"].every((n) => c.includes(n)), "the worker adds the six columns to an engine_runs that lacks them", c);
  const row = db.prepare("SELECT * FROM engine_runs ORDER BY id DESC LIMIT 1").get();
  ok(row.source_chars === 1834 && row.source_kind === "hn+fulltext" && row.compose_calls === 3 && row.verify_calls === 5 && row.panel_calls === 2 && row.factcheck_calls === 3 && row.status === "gate_failed" && row.error === "e", "the insert binds source_chars, source_kind and total plus per-stage call counts", row);
  ok(env.q08Meter.compose === 0 && env.q08Meter.verify === 0 && env.q08Meter.panel === 0 && env.q08Meter.factcheck === 0, "the meter restarts, so a second row of the same tick counts only its own calls");
  await G.insertRun(env, { status: "ok", published: 1 });
  const r2 = db.prepare("SELECT * FROM engine_runs ORDER BY id DESC LIMIT 1").get();
  ok(r2.compose_calls === 0 && r2.verify_calls === 0 && r2.panel_calls === 0 && r2.factcheck_calls === 0 && r2.source_chars === null && r2.piece_published === 1, "a row with nothing to report leaves the source columns NULL and call counts at zero", r2);
  await G.ensureRunColumns(env);
  ok(cols(db).filter((n) => n === "source_chars").length === 1, "the bootstrap never adds a column twice");
}
{
  const env = { q08Meter: { compose: 0, verify: 0, panel: 0, factcheck: 0 } };
  G.meterCall(env, "compose");
  G.meterCall(env, "panel");
  G.meterCall(env, "factcheck");
  ok(env.q08Meter.compose === 1 && env.q08Meter.verify === 2 && env.q08Meter.panel === 1 && env.q08Meter.factcheck === 1, "stage calls also preserve verify_calls as their total", env.q08Meter);
}
{
  const { db, shim } = makeDb();
  const env = { DB: shim, q08Meter: { compose: 0, verify: 0, panel: 0, factcheck: 0 }, AI: { run: async () => { throw new Error("model unavailable"); } } };
  await mod.__quality.readerTest(env, "@cf/moonshotai/kimi-k2.6", "An essay");
  await V.factCheck(env, "An essay", "Source material", "@cf/openai/gpt-oss-120b");
  ok(env.q08Meter.panel === 1 && env.q08Meter.factcheck > 0 && env.q08Meter.verify === env.q08Meter.panel + env.q08Meter.factcheck, "actual reviewer call sites attribute failed attempts and retain their total", env.q08Meter);
  await G.insertRun(env, { status: "gate_failed" });
  await G.insertRun({ DB: shim }, { status: "skipped" });
  const rows = db.prepare("SELECT panel_calls, factcheck_calls, verify_calls FROM engine_runs ORDER BY id").all();
  ok(rows[0].panel_calls === 1 && rows[0].factcheck_calls > 0 && rows[0].verify_calls === rows[0].panel_calls + rows[0].factcheck_calls, "the run ledger persists attribution from actual calls", rows);
  ok(rows[1].panel_calls === null && rows[1].factcheck_calls === null && rows[1].verify_calls === null, "an unmetered caller remains unknown rather than being reported as zero spend", rows[1]);
}
{
  // a database whose ALTER is refused still gets its row, with the old column list
  const { db, shim } = makeDb();
  const refusing = { prepare: (sql) => (/ALTER TABLE/.test(sql) ? { run: async () => { throw new Error("ALTER refused"); } } : shim.prepare(sql)) };
  const env = { DB: refusing };
  const quiet = console.error; console.error = () => {};
  await G.insertRun(env, { scraped: 1, scored: 1, published: 0, top: "t", model: "m", ms: 5, status: "gate_failed", error: "x", sourceChars: 900, sourceKind: "hn+summary" });
  console.error = quiet;
  const n = db.prepare("SELECT COUNT(*) n FROM engine_runs").get().n, row = db.prepare("SELECT status, error FROM engine_runs").get();
  ok(n === 1 && row.status === "gate_failed", "logging can never cost a run its row", [n, row]);
}

// ---- 3. generate(): a source below the learned floor is skipped before any compose call
const realFetch = globalThis.fetch;
function stubFetch(stories, articleChars) {
  globalThis.fetch = async (url) => {
    const u = String(url), res = (body, type) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status: 200, headers: { "content-type": type || "application/json" } });
    if (u.includes("hn.algolia.com/api/v1/search")) return res({ hits: stories.map((s) => ({ _tags: ["story"], title: s.title, objectID: s.id, story_id: s.id, url: "https://example.org/" + s.id, points: 300, num_comments: 120, created_at: new Date().toISOString() })) });
    if (u.includes("hn.algolia.com/api/v1/items/")) {
      const id = u.split("/").pop(), s = stories.find((x) => String(x.id) === id);
      return res({ title: s ? s.title : "", children: [1, 2, 3].map((k) => ({ text: "<p>" + ("Comment " + k + " about how the system behaved under load. ").repeat(8) + "</p>", children: [] })) });
    }
    if (u.startsWith("https://example.org/")) { const id = u.split("/").pop(), s = stories.find((x) => String(x.id) === id); return res("<html><body><p>" + "The service reported a fault and the operators described it in detail. ".repeat(Math.ceil((s && s.art != null ? s.art : articleChars) / 70)).slice(0, s && s.art != null ? s.art : articleChars) + "</p></body></html>", "text/html"); }
    return new Response("nope", { status: 500 });
  };
}
async function runGenerate(stories, artChars, okSizes) {
  const { db, shim } = makeDb();
  if (okSizes) { db.exec("ALTER TABLE engine_runs ADD COLUMN source_chars INTEGER"); }
  (okSizes || []).forEach((n) => db.prepare("INSERT INTO engine_runs (piece_published, status, source_chars, ran_at) VALUES (1, 'ok', ?, datetime('now'))").run(n));
  let aiCalls = 0;
  const env = { DB: shim, AI: { run: async () => { aiCalls++; throw new Error("model offline (test)"); } } };
  stubFetch(stories, artChars);
  const quiet = console.error; console.error = () => {};
  let out = null, thrown = null;
  try { out = await G.generate(env); } catch (e) { thrown = String(e && e.message || e); }
  console.error = quiet;
  return { db, shim, env, out, thrown, get aiCalls() { return aiCalls; }, row: db.prepare("SELECT * FROM engine_runs WHERE status != 'ok' ORDER BY id DESC LIMIT 1").get() };
}
try {
  // 5 ok runs logged with sizes down to 2400 -> learned floor min(2400, 2200) = 2200; the candidate holds ~700 characters of article
  const thin = [{ id: 7001, title: "Operators describe a regional outage" }, { id: 7002, title: "A vendor explains a billing fault" }];
  const r = await runGenerate(thin, 700, [2400, 3100, 2900, 5200, 4100]);
  ok(r.row && r.row.status === "skipped" && /source too thin for a 2800-character grounded piece/.test(r.row.error), "a source below the learned floor ends the run as skipped, not gate_failed", r.row);
  ok(r.aiCalls === 0 && r.row && r.row.compose_calls === 0 && r.row.verify_calls === 0, "no model is called for it (compose_calls 0, verify_calls 0)", [r.aiCalls, r.row]);
  ok(r.row && r.row.source_chars > 600 && r.row.source_chars < 2200 && r.row.source_kind === "hn+fulltext", "the skipped row records how much source it measured and its kind", r.row);
  const marks = r.db.prepare("SELECT source_id, status FROM signal_log WHERE status = 'thin_skipped'").all();
  ok(marks.length === 2 && marks.every((m) => /^hn:700[12]$/.test(m.source_id)), "both measured candidates are marked for the 24-hour retry, not dropped", marks);
  // the next tick has other candidates ahead of the skipped ones: a richer story is chosen and reaches the writer
  stubFetch([{ id: 7003, title: "A third story with the full report", art: 9000 }].concat(thin), 700);
  const quiet = console.error; console.error = () => {};
  let thrown2 = null; try { await G.generate(r.env); } catch (e) { thrown2 = String(e && e.message || e); }
  console.error = quiet;
  ok(r.aiCalls >= 1 && /all compose models failed/.test(String(thrown2)), "the next tick moves on to a candidate that clears the floor and composes from it", [r.aiCalls, thrown2]);
  const thinSkipRows = r.db.prepare("SELECT COUNT(*) n FROM signal_log WHERE status = 'thin_skipped'").get().n;
  ok(thinSkipRows === 2, "the skipped candidates are not measured and marked again while their retry window is open", thinSkipRows);

  // with fewer than five logged ok runs the flat test stays: the same candidate reaches the writer
  const early = await runGenerate(thin, 700, [2400, 3100]);
  ok(early.aiCalls >= 1 && /all compose models failed/.test(String(early.thrown)), "before five ok runs carry a source size the 600-character test alone applies", [early.aiCalls, early.thrown]);

  // under 600 characters of article: the old refusal, now with the measured size in the row
  const nothing = await runGenerate(thin, 200, [2400, 3100, 2900, 5200, 4100]);
  ok(nothing.row && nothing.row.status === "skipped" && /no candidate with readable full text/.test(nothing.row.error) && nothing.row.source_kind === "hn+summary" && nothing.row.source_chars > 0, "an unreadable article is still refused, and the row says it was summary-only", nothing.row);
  ok(nothing.db.prepare("SELECT COUNT(*) n FROM signal_log WHERE status = 'thin_skipped'").get().n === 2, "and its candidates are marked for the 24-hour retry as well");
} finally { globalThis.fetch = realFetch; }

// ---- 4. the repair stops when the same claim classes recur and the prune leaves the draft under the floor
const tags = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven"];
const para = (i) => "The operator in case " + tags[i] + " watched the queue grow while the dashboard stayed green, because the dashboard measured the database and not the disk beneath it. In case " + tags[i] + " each hour widened the gap between what was measured and what was felt, and nobody owned the space between the two numbers.";
const tail = (i) => "In case " + tags[i] + " each hour widened the gap between what was measured and what was felt, and nobody owned the space between the two numbers.";
const essay = "# The queue nobody measured\n\n" + tags.map((_, i) => para(i)).join("\n\n") + "\n\nworth your time: yes - names the mechanism";
const round1 = [tail(2)], round2 = [tail(3), tail(4), tail(5), tail(6), tail(7)];
const afterOne = essay.replace(" " + round1[0], ""), afterTwo = round2.reduce((t, s) => t.replace(" " + s, ""), afterOne);
const bodyAll = V.publishBody(essay).length, bodyOne = V.publishBody(afterOne).length, bodyTwo = V.publishBody(afterTwo).length;
ok(bodyAll >= 2800 && bodyOne >= 2800 && bodyTwo < 2800, "fixture: one prune stays above the floor, the second takes the draft under it", [bodyAll, bodyOne, bodyTwo]);
let composeCalls = 0, lengthRevision = false, reviewCalls = 0;
const flaggedFor = (txt) => (txt.includes(round1[0]) ? round1 : round2.some((s) => txt.includes(s)) ? round2 : []);
const env4 = { AI: { run: async (m, a2) => {
  const pr = (a2.messages || []).map((x) => x.content).join("\n") + (a2.prompt || "");
  if (/--- LENGTH REVISION/.test(pr)) { lengthRevision = true; composeCalls++; return { response: essay }; }
  if (/FACT REVISION/.test(pr)) { composeCalls++; return { response: essay }; }
  reviewCalls++;
  const draft = pr.slice(pr.indexOf("--- DRAFT ---"));
  const fl = flaggedFor(draft);
  return { response: JSON.stringify(fl.length ? { unsupported: fl.map((s) => "FACT: " + s + " -- not in source"), verdict: "fail" } : { unsupported: [], verdict: "pass" }) };
} } };
const rr = await V.verifyAndRevise(env4, { piece: { text: essay, model: "@cf/openai/gpt-oss-120b" }, prompt: "P", banned: [], ground: essay, seedText: "s", forecast: false });
ok(rr.ok === false && !lengthRevision && composeCalls === 0, "a recurring claim class with a prune under the floor spends no model revision to extend the draft", { ok: rr.ok, lengthRevision, composeCalls });
ok(rr.problems.some((p) => /repair trail: .*r2 stopped: repeat unsupported claim after a prune left the draft below the floor/.test(p)), "the trail records why the repair stopped", rr.problems.slice(-2));
ok(rr.problems.some((p) => /too short after pruning/.test(p)), "the run still ends with the same failure text the metrics classify", rr.problems);
ok(reviewCalls > 0, "the rounds that did run were reviewed", reviewCalls);

// the FIRST short prune still gets its one extension (PRUNE-EXTEND-1 is unchanged for a draft no earlier round flagged)
const essay10 = "# The queue nobody measured\n\n" + tags.slice(0, 10).map((_, i) => para(i)).join("\n\n") + "\n\nworth your time: yes - names the mechanism";
const first = [tail(2), tail(3), tail(4)];
const body10 = V.publishBody(essay10).length, bodyCut10 = V.publishBody(first.reduce((t, x) => t.replace(" " + x, ""), essay10)).length;
ok(body10 >= 2800 && bodyCut10 < 2800, "fixture: three flagged sentences take the ten-paragraph draft under the floor in one prune", [body10, bodyCut10]);
let ext = false;
const env5 = { AI: { run: async (m, a2) => {
  const pr = (a2.messages || []).map((x) => x.content).join("\n") + (a2.prompt || "");
  if (/--- LENGTH REVISION/.test(pr)) { ext = true; return { response: essay10 }; }
  const draft = pr.slice(pr.indexOf("--- DRAFT ---"));
  const fl = first.filter((s) => draft.includes(s));
  return { response: JSON.stringify(fl.length ? { unsupported: fl.map((s) => "FACT: " + s + " -- not in source"), verdict: "fail" } : { unsupported: [], verdict: "pass" }) };
} } };
const r5 = await V.verifyAndRevise(env5, { piece: { text: essay10, model: "@cf/openai/gpt-oss-120b" }, prompt: "P", banned: [], ground: essay10, seedText: "s", forecast: false });
ok(ext === true, "a first prune that leaves the draft short is still extended once (no earlier round flagged those classes)", r5.problems);

// ---- 5. wiring in the source
const gen = src.slice(src.indexOf("async function generate(env) {"), src.indexOf("// Q08-FORECAST-1 (v0.9.0"));
ok(!/INSERT INTO engine_runs/.test(gen), "generate() writes engine_runs only through insertRun");
ok((gen.match(/await insertRun\(env, \{/g) || []).length >= 3, "the skipped, gate_failed and ok exits all log through insertRun");
ok(/sourceChars: storyGlen/.test(gen) && /sourceKind: sourceKindOf\(story,/.test(gen), "the essay rows carry the measured source size and kind");
ok(/q08Meter: \{ compose: 0, verify: 0, panel: 0, factcheck: 0 \}/.test(gen), "generate() meters its model calls on a per-run copy of env");
ok(/meterCall\(env, "compose"\)/.test(src) && /meterCall\(env, "panel"\)/.test(src) && /meterCall\(env, "factcheck"\)/.test(src), "compose, panel and fact-check calls are counted by stage");
ok(/pragma_table_info\('engine_runs'\)/.test(src), "the bootstrap checks pragma_table_info before each ALTER");
ok(/ordered\.length, 8\)/.test(gen) || /Math\.min\(ordered\.length, 8\)/.test(gen), "the candidate loop is unchanged (up to 8 per tick)");
const ver = (src.match(/var VERSION = "(\d+)\.(\d+)\.(\d+)/) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 0 || ver[1] > 35 || (ver[1] === 35 && ver[2] >= 0)), "VERSION is at least 0.35.0 for stage-call attribution", ver);
console.log("source-sufficiency.test.mjs: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
