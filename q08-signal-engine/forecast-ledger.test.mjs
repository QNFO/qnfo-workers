// Q08-FORECAST-LEDGER-1 offline suite: the research ledger of verbatim sentences, with every fetch stubbed.
// Proves: explicit off makes no request; default on obeys its limits (at most 6 names, 15
// documents, 40000 characters each, 60 numbered sentences with URL and date, only public https pages, every fetch failing on its own, sentences copied verbatim);
// a draft stating a ledger fact passes the grounding check and one stating a fact in neither the essay nor the ledger is refused; [R<n>] tags are stripped like [S<n>];
// the stored ledger (q08_forecasts.ground_json) is what the re-audit reads. Run: node q08-signal-engine/forecast-ledger.test.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
const here = dirname(fileURLToPath(import.meta.url));
const mod = await import(pathToFileURL(join(here, "worker.js")).href);
const L = mod.__fledger, F = mod.__forecast;
let fails = 0, passes = 0;
const check = (l, c, x) => { if (c) passes++; else { fails++; console.log("FAIL " + l + (x !== undefined ? " -- " + JSON.stringify(x).slice(0, 500) : "")); } };

const wrap = (db) => ({ prepare(sql) { const st = db.prepare(sql); let b = []; const o = { bind(...a) { b = a; return o; }, async run() { st.run(...b); return { success: true }; }, async first() { return st.get(...b) ?? null; }, async all() { return { results: st.all(...b) }; } }; return o; } });
const opsEnv = (value) => { const db = new DatabaseSync(":memory:"); db.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT)"); if (value !== undefined) db.prepare("INSERT INTO ops_config VALUES ('q08_forecast_ledger', ?)").run(value); return { AUDIT: wrap(db) }; };

const src = { title: "Acme and Globex pricing", body_md: "Acme Corp raised prices again this year. Analysts at Globex Industries say Acme will keep leading the market. Globex will follow." };
const signalText = "Chip pricing";
// one database for the schema-dependent checks: ensureForecastSchema keeps module-level state, so it runs once, here
const mainDb = new DatabaseSync(":memory:");
mainDb.exec("CREATE TABLE published_pieces (id TEXT, signal_id TEXT, slug TEXT, title TEXT, body_md TEXT, core_concept TEXT, published_at TEXT, sources_json TEXT, kind TEXT)");
mainDb.exec("CREATE TABLE signal_log (id TEXT, title TEXT, url TEXT, friction_point TEXT)");
const mainEnv = { DB: wrap(mainDb) };
await F.ensureForecastSchema(mainEnv);
const forecastDdl = mainDb.prepare("SELECT sql FROM sqlite_master WHERE name = 'q08_forecasts'").get().sql; // the schema before ground_json exists

// ---- pure helpers ----
{
  const names = L.ledgerNames(src, signalText);
  check("names: at most 6, capitalised, no sentence-initial common words", names.length <= 6 && names.includes("Acme") && names.includes("Globex") && !names.includes("Analysts") && !names.includes("Chip"), names);
  check("names: a mid-sentence or camel-case word counts, the first word of a sentence does not", L.ledgerNames({ title: "", body_md: "Prices moved. TrendForce said so. Then Broadcom agreed." }, "").join() === "TrendForce,Broadcom", L.ledgerNames({ title: "", body_md: "Prices moved. TrendForce said so. Then Broadcom agreed." }, ""));
  const many = L.ledgerNames({ title: "", body_md: "a Alpha1 b Bravo2 c Charlie3 d Delta4 e Echo55 f Foxtrot6 g Golf77 h Hotel88" }, "");
  check("names: never more than 6", many.length === 6, many);
  const s = L.ledgerSentences("Acme Corp said it will raise the price by 12.5 percent from January. Too short. Nothing here names the topic and so it is left out of the ledger entirely. Acme   Corp\nshipped 4.2 million units in 2026 and 3.9 million a year earlier.", ["Acme"]);
  check("sentences: verbatim, decimals kept, whitespace collapsed, unrelated and short ones dropped", s.length === 2 && s[0] === "Acme Corp said it will raise the price by 12.5 percent from January." && s[1] === "Acme Corp shipped 4.2 million units in 2026 and 3.9 million a year earlier.", s);
  check("sentences: 25 to 280 characters only", L.ledgerSentences("Acme grew. " + "Acme " + "x".repeat(300) + ".", ["Acme"]).length === 0);
}

// ---- tags ----
{
  const t = L.stripLedgerTags("Prices rose [R3] and fell [R1, R2] in 2025 [4], per [S2] and [R10; R11].");
  check("[R<n>] tags are stripped like [S<n>], a bare [4] and a year stay", t === "Prices rose and fell in 2025 [4], per and.", t);
  check("a text without a tag is returned untouched", L.stripLedgerTags("No tags here (R3) at all.") === "No tags here (R3) at all.");
}

// ---- the switch ----
{
  const cases = [[undefined, true], ["", true], ["off", false], [" OFF ", false], ["1", true], ["true", true], ["on", true], [" ON ", true]];
  for (const [v, want] of cases) check("switch " + JSON.stringify(v) + " -> " + want, (await L.forecastLedgerOn(opsEnv(v))) === want);
  check("switch with no AUDIT binding is on", (await L.forecastLedgerOn({})) === true);
}

// ---- stubbed network ----
const realFetch = globalThis.fetch;
const calls = [];
const html = (paras) => "<html><head><style>.x{color:red}</style><script>var a = 'Acme should not appear.';</script></head><body>" + paras.map((p) => "<p>" + p + "</p>").join("") + "</body></html>";
const page = (n, extra) => html([`Acme Corp said on Tuesday ${n} that it will raise the price of its flagship chip by 12.5 percent from January.`, "Analysts at Globex called the move aggressive but expected.", "Nothing here mentions the topic at all and so it must not be copied into the ledger.", `Acme Corp shipped 4.${n} million units in the third quarter of 2026, up from 3.9 million a year earlier.`].concat(extra || []));
const bigPage = html(["Acme Corp is described first in this very long page of text.", ...Array.from({ length: 3000 }, () => "Filler text without the topic name and with plenty of words in it to take up room."), "Acme marker sentence far beyond the forty thousand character read limit must never be copied."]);
const pages = {
  "https://news.example.com/a": page(1), "https://news.example.org/c": page(2), "https://wiki.example.net/acme": page(3),
  "https://big.example.com/long": bigPage, "https://arxiv.example.org/abs/1": page(4),
};
const json = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
const stub = (over) => async (url, init) => {
  const u = String(url); calls.push(u);
  const o = over && over(u);
  if (o) return o;
  const h = new URL(u).hostname;
  if (h === "hn.algolia.com") return json({ hits: [{ url: "https://news.example.com/a", created_at: "2026-10-01T00:00:00Z" }, { url: "http://insecure.example.com/b", created_at: "2026-10-01T00:00:00Z" }, { url: "https://10.0.0.5/private", created_at: "" }, { url: "https://localhost/x", created_at: "" }, { url: "https://big.example.com/long", created_at: "2026-10-03T00:00:00Z" }] });
  if (h === "api.gdeltproject.org") return json({ articles: [{ url: "https://news.example.org/c", seendate: "20261002T000000Z" }, { url: "https://down.example.net/dead", seendate: "20261002T000000Z" }] });
  if (h === "en.wikipedia.org" && u.includes("/w/api.php")) return json({ query: { search: [{ title: "Acme Corp", timestamp: "2026-09-30T00:00:00Z" }] } });
  if (h === "export.arxiv.org") return new Response("<feed><entry><id>http://arxiv.example.org/abs/1</id><published>2026-09-01T00:00:00Z</published><title>t</title></entry></feed>", { status: 200 });
  if (u === "https://en.wikipedia.org/wiki/Acme_Corp") return new Response(pages["https://wiki.example.net/acme"], { status: 200 });
  if (h === "down.example.net") return new Response("boom", { status: 500 });
  if (pages[u]) return new Response(pages[u], { status: 200 });
  return new Response("not found", { status: 404 });
};
try {
  // off: no request at all, an empty ledger, and a prompt identical to the one built without a ledger
  globalThis.fetch = stub();
  for (const v of ["off", " OFF "]) {
    calls.length = 0;
    const r = await L.forecastLedgerFor(opsEnv(v), src, signalText);
    check("off (" + JSON.stringify(v) + ") makes no request and returns an empty ledger", calls.length === 0 && r.lines.length === 0 && r.sources.length === 0, { calls: calls.length, r });
  }
  const pOff = L.buildForecastPrompt(src, signalText, { banned: [], ownerNotes: [], recent: [] });
  check("off: the prompt carries no ledger block", pOff === L.buildForecastPrompt(src, signalText, { banned: [], ownerNotes: [], recent: [], ledger: [] }) && !/--- RESEARCH LEDGER/.test(pOff));

  // on
  calls.length = 0;
  const led = await L.researchLedger({}, src, signalText);
  const pageCalls = calls.filter((u) => !/hn\.algolia|gdeltproject|\/w\/api\.php|export\.arxiv/.test(u));
  check("on: a ledger is built from the linked pages", led.lines.length > 0 && led.sources.length > 0, led);
  check("on: every line includes its numbered sentence, URL and date", led.lines.every((l, i) => new RegExp("^\\[R" + (i + 1) + "\\] .{25,280} \\(https://[^ ]+, (\\d{4}-\\d{2}-\\d{2}|retrieved \\d{4}-\\d{2}-\\d{2})\\)$").test(l)), led.lines.slice(0, 3));
  check("on: at most 60 lines and 15 documents", led.lines.length <= L.LEDGER_MAX_LINES && pageCalls.length <= L.LEDGER_MAX_DOCS && led.sources.length <= L.LEDGER_MAX_DOCS, { lines: led.lines.length, pages: pageCalls.length });
  check("on: only public https pages are fetched (no http, private address or localhost)", pageCalls.every((u) => /^https:\/\//.test(u) && !/10\.0\.0\.5|localhost|insecure/.test(u)), pageCalls);
  check("on: a failing page (HTTP 500) is skipped and the others still count", pageCalls.some((u) => /down\.example\.net/.test(u)) && !led.lines.some((l) => /down\.example\.net/.test(l)) && led.lines.some((l) => /news\.example\.com/.test(l)) && led.lines.some((l) => /news\.example\.org/.test(l)));
  check("on: no more than 40000 characters of a page are read", !led.lines.some((l) => /far beyond the forty thousand/.test(l)) && led.lines.some((l) => /big\.example\.com/.test(l)));
  check("on: script text is not copied and unrelated sentences are left out", !led.lines.some((l) => /should not appear|Nothing here mentions/.test(l)));
  const norm = (s) => s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ").replace(/\s+/g, " ");
  const allText = Object.values(pages).map(norm).join(" ");
  check("on: every sentence is copied verbatim from a fetched page", led.lines.every((l) => allText.includes(l.replace(/^\[R\d+\] /, "").replace(/ \([^()]*\)$/, ""))), led.lines.slice(0, 2));
  check("on: the date comes from the search result", led.lines.some((l) => /news\.example\.com\/a, 2026-10-01\)$/.test(l)) && led.lines.some((l) => /news\.example\.org\/c, 2026-10-02\)$/.test(l)));
  check("on: no model is called (the environment has no AI binding)", true);

  // on, through the switch: the same ledger, and a prompt that carries it with the extended FACTS rule
  calls.length = 0;
  const viaSwitch = await L.forecastLedgerFor({ AUDIT: opsEnv("on").AUDIT, DB: mainEnv.DB }, src, signalText);
  check("on via ops_config 'on': forecastLedgerFor builds the ledger", calls.length > 0 && viaSwitch.lines.length === led.lines.length, { calls: calls.length });
  const pOn = L.buildForecastPrompt(src, signalText, { banned: [], ownerNotes: [], recent: [], ledger: led.lines });
  check("on: the prompt carries the ledger lines and the extended FACTS rule", /RESEARCH LEDGER/.test(pOn) && /cited in your draft by its tag/.test(pOn) && pOn.includes(led.lines[0]), pOn.slice(-300));
  check("on: the prompt before the ledger block is unchanged", pOn.startsWith(pOff.replace(/\s+$/, "")));

  // every search failing leaves an empty ledger, not an error
  globalThis.fetch = async () => { throw new Error("network down"); };
  const dead = await L.researchLedger({}, src, signalText);
  check("on: every fetch failing gives an empty ledger", dead.lines.length === 0 && dead.sources.length === 0);

  // the cap on lines and documents with plenty of material
  globalThis.fetch = stub((u) => {
    const h = new URL(u).hostname;
    if (h === "hn.algolia.com") return json({ hits: Array.from({ length: 5 }, (_, i) => ({ url: "https://many.example.com/" + encodeURIComponent(u).slice(-12) + i, created_at: "2026-10-05T00:00:00Z" })) });
    if (h === "many.example.com") return new Response(html(Array.from({ length: 40 }, (_, i) => `Acme Corp reported result number ${i} for the quarter with a long enough sentence.`)), { status: 200 });
    return null;
  });
  calls.length = 0;
  const big = await L.researchLedger({}, src, signalText);
  const bigPages = calls.filter((u) => /many\.example\.com/.test(u));
  check("cap: 60 lines at most, 15 documents at most, lines shared across documents", big.lines.length === 60 && bigPages.length <= 15 && big.sources.length <= 15 && new Set(big.lines.map((l) => l.match(/\(([^,]+),/)[1])).size > 1, { lines: big.lines.length, pages: bigPages.length, sources: big.sources.length });
} finally { globalThis.fetch = realFetch; }

// ---- grounding: a ledger fact passes, a fact in neither the essay nor the ledger is refused ----
{
  const ledger = ["[R1] Acme Corp said on Tuesday that it will raise the price of its flagship chip to $48.7 from January. (news.example.com, 2026-10-01)"];
  const essay = [src.title, src.body_md, signalText].join("\n");
  const good = "# Acme prices\n\n" + L.stripLedgerTags("Acme Corp will raise the price of its flagship chip to $48.7 from January [R1].");
  const bad = "# Acme prices\n\n" + L.stripLedgerTags("Acme Corp will raise the price of its flagship chip to $61.3 from January [R2].");
  const opts = { forecast: true, banned: [], mode: "on" };
  const withLedger = L.groundPreCheck({ text: good }, essay + "\n" + ledger.join("\n"), opts);
  const without = L.groundPreCheck({ text: good }, essay, opts);
  const refused = L.groundPreCheck({ text: bad }, essay + "\n" + ledger.join("\n"), opts);
  check("a draft stating a ledger fact passes the grounding check with the ledger in the ground", withLedger.ok === true, withLedger.problems);
  check("the same draft is refused without the ledger (the ledger is what grounds it)", without.ok === false && without.problems.length > 0, without);
  check("a draft stating a fact in neither the essay nor the ledger is refused", refused.ok === false && refused.problems.length > 0, refused);
}

// ---- the stored ledger is what the re-audit reads ----
{
  const db = mainDb, env = mainEnv;
  L.resetGroundColumn();
  check("ensureForecastGroundColumn adds the nullable column once", (await L.ensureForecastGroundColumn(env)) === true && (await L.ensureForecastGroundColumn(env)) === true && db.prepare("PRAGMA table_info(q08_forecasts)").all().filter((c) => c.name === "ground_json").length === 1);
  db.prepare("INSERT INTO published_pieces (slug, title, body_md, kind) VALUES ('src-1', 'Acme essay', 'Acme Corp raised prices again this year.', 'analysis')").run();
  db.prepare("INSERT INTO published_pieces (slug, title, body_md, kind, signal_id) VALUES ('f-1', 'Acme forecast', 'forecast body', 'forecast', 'sig-1')").run();
  db.prepare("INSERT INTO signal_log VALUES ('sig-1', 'sig title', '', 'Chip pricing')").run();
  const ledgerLines = ["[R1] Acme Corp said on Tuesday that it will raise the price of its flagship chip to $48.7 from January. (news.example.com, 2026-10-01)"];
  db.prepare("INSERT INTO q08_forecasts (slug, source_slug, claim, probability, horizon, resolution, created_at, status, ground_json) VALUES ('f-1', 'src-1', 'c', 0.6, '2027-01-01', 'r', '2026-10-01T00:00:00Z', 'open', ?)").run(JSON.stringify({ lines: ledgerLines, sources: [] }));
  const p = { slug: "f-1", kind: "forecast", title: "Acme forecast", core_concept: "", signal_id: "sig-1" };
  const g = await L.groundForPublished(env, p);
  check("re-audit ground holds the source essay and the stored ledger", g.includes("Acme Corp raised prices again this year.") && g.includes(ledgerLines[0]), g.slice(-400));
  const long = "x ".repeat(20000);
  db.prepare("UPDATE published_pieces SET body_md = ? WHERE slug = 'src-1'").run(long);
  const g2 = await L.groundForPublished(env, p);
  check("a long essay cannot cut the ledger off the re-audit ground", g2.includes(ledgerLines[0]), g2.length);
  db.prepare("UPDATE q08_forecasts SET ground_json = NULL WHERE slug = 'f-1'").run();
  const g3 = await L.groundForPublished(env, p);
  check("a forecast without a stored ledger re-audits against the essay alone", !g3.includes("[R1]") && g3.includes("Acme forecast"));
  // a database from before the column: the read path neither fails nor changes the schema
  const old = new DatabaseSync(":memory:");
  old.exec("CREATE TABLE published_pieces (id TEXT, signal_id TEXT, slug TEXT, title TEXT, body_md TEXT, core_concept TEXT, published_at TEXT, sources_json TEXT, kind TEXT)");
  old.exec("CREATE TABLE signal_log (id TEXT, title TEXT, url TEXT, friction_point TEXT)");
  const oldEnv = { DB: wrap(old) };
  old.exec(forecastDdl);
  old.prepare("INSERT INTO published_pieces (slug, title, body_md, kind) VALUES ('src-1', 'Acme essay', 'Acme essay body.', 'analysis')").run();
  old.prepare("INSERT INTO q08_forecasts (slug, source_slug, claim, probability, horizon, resolution, created_at, status) VALUES ('f-1', 'src-1', 'c', 0.6, '2027-01-01', 'r', '2026-10-01T00:00:00Z', 'open')").run();
  const go = await L.groundForPublished(oldEnv, p);
  check("a database without the column re-audits fine and keeps its schema", go.includes("Acme essay body.") && !old.prepare("PRAGMA table_info(q08_forecasts)").all().some((c) => c.name === "ground_json"));
}

// ---- wiring in the source ----
{
  const code = readFileSync(join(here, "worker.js"), "utf8");
  const gf = code.slice(code.indexOf("async function generateForecast("), code.indexOf("// ---- Accuracy layer"));
  check("generateForecast adds the ledger to the prompt and snapshot ground", /forecastLedgerFor\(env, src, signalText\)/.test(gf) && /ledger: ledger\.lines/.test(gf) && /fcGround = forecastGroundText\(snapshot\)/.test(gf));
  check("generateForecast passes its snapshot and sources to atomic persistence", /forecastGround: snapshot/.test(gf) && /ledgerSources: ledger\.sources/.test(gf) && /await env\.DB\.batch\(writes\)/.test(code));
  check("persistPiece adds the ledger sources to sources_json", /buildSources\(story\)\.concat\(Array\.isArray\(story\.ledgerSources\)/.test(code));
  check("the probe text of issue 1000512 is present", /function researchLedger\(/.test(code));
  check("the unused draft forecastLedger is gone", !/forecastLedger\(|FORECAST_EVIDENCE_SOURCES/.test(code));
  const mirror = readFileSync(join(here, "deployed-current.worker.js"), "utf8");
  check("deployed-current.worker.js mirrors worker.js", mirror === code);
  const v = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(code);
  check("VERSION is at least 0.40.0", v && (+v[1] > 0 || +v[2] >= 40), v && v[0]);
}

console.log("forecast-ledger: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
