// UTM-CLICK-LEDGER-1 offline suite (transformation lever T7.9; qnfo-gateway 3.10.0 + qnfo-fleet-dashboard 1.26.0).
// The gateway half (utmClickRow, utmRecord) runs against an in-memory SQLite qnfo-graph; the dashboard half replays the real
// reach ingest (REACH_DDL through reachIngestTick) with that same database as its GRAPH binding, so a tagged page load is
// followed from the request to the reach_signals rows the attention loop reads. No network.
// Run: node --no-warnings qnfo-gateway/utm-click-ledger.test.mjs   -> prints "N passed, 0 failed"
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";

const gsrc = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const dsrc = readFileSync(new URL("../qnfo-fleet-dashboard/worker.js", import.meta.url), "utf8");
const cut = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + 1); if (i < 0 || j < i) throw new Error("block not found: " + a); return src.slice(i, j); };
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (extra !== undefined ? " :: " + JSON.stringify(extra) : "")); } };
const shim = (db) => {
  const on = (sql) => { let args = []; const s = { bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; }, async all() { return { results: db.prepare(sql).all(...args) }; }, async first() { return db.prepare(sql).get(...args) || null; }, async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; } }; return s; };
  return { prepare: on, async batch(st) { const o = []; for (const x of st) o.push(await x.run()); return o; } };
};

// ---- gateway half ----
const block = cut(gsrc, "// ---- UTM-CLICK-LEDGER-1:BEGIN ----", "// ---- UTM-CLICK-LEDGER-1:END ----");
ok(/var VERSION="3\.(1[0-9]|[2-9]\d)\.\d+-/.test(gsrc), "qnfo-gateway VERSION is 3.10.x (a new capability raises the minor version)");
ok(gsrc.includes("const utmRow = utmClickRow(request, served);") && gsrc.includes("return withFleetCtl(await withReachLayer(served, request));"), "the fetch handler records after serve() and still returns the reach-layered, fleet-ctl answer");
ok([...block].every((c) => c.charCodeAt(0) < 128), "block source is ASCII");
const G = vm.runInContext(block + ";({ utmClickRow, utmRecord, utmClean, get count() { return utmIsolateCount; } })", vm.createContext({ URL, Date, String, Number }));
const graph = new DatabaseSync(":memory:");
const env = { DB: shim(graph) };
const NOW = Date.parse("2026-10-06T09:00:00Z");
const req = (url, ua, extra) => ({ method: (extra && extra.method) || "GET", url, cf: { country: "nl" }, headers: { get: (k) => (k === "User-Agent" ? ua : null) } });
const res = (status, ct) => ({ status, headers: { get: (k) => (k === "Content-Type" ? ct : null) } });
const html = res(200, "text/html; charset=utf-8");
const HUMAN = "Mozilla/5.0 (Macintosh) AppleWebKit Safari", BOT = "Mozilla/5.0 (compatible; Bluesky Cardyb/1.1)";

const r1 = G.utmClickRow(req("https://papers.qnfo.org/papers/p-adic-x/?utm_source=bluesky&utm_medium=social&utm_campaign=p-adic-x", HUMAN), html, NOW);
ok(r1 && r1.day === "2026-10-06" && r1.host === "papers.qnfo.org" && r1.path === "/papers/p-adic-x" && r1.utm_source === "bluesky" && r1.utm_medium === "social" && r1.utm_campaign === "p-adic-x" && r1.ua_class === "human" && r1.country === "NL", "a tagged human page load becomes one row", r1);
ok(!("ip" in r1) && !Object.values(r1).some((v) => /Mozilla/.test(String(v))), "the row holds no IP and no user-agent string");
ok(G.utmClickRow(req("https://qnfo.org/?utm_source=bluesky", BOT), html, NOW).ua_class === "bot", "a link-preview fetcher is classed bot");
ok(G.utmClickRow(req("https://qnfo.org/papers", HUMAN), html, NOW) === null, "an untagged load records nothing");
ok(G.utmClickRow(req("https://qnfo.org/?utm_source=x", HUMAN, { method: "POST" }), html, NOW) === null, "only GET is counted");
ok(G.utmClickRow(req("https://qnfo.org/missing?utm_source=x", HUMAN), res(404, "text/html"), NOW) === null, "a 404 is not counted");
ok(G.utmClickRow(req("https://qnfo.org/rss.xml?utm_source=x", HUMAN), res(200, "application/rss+xml"), NOW) === null, "a non-HTML answer is not counted");
const r2 = G.utmClickRow(req("https://qnfo.org/?utm_source=<script>BAD%20Source" + "x".repeat(200) + "&utm_campaign=%27%20OR%201=1", HUMAN), html, NOW);
ok(r2.utm_source.length <= 64 && /^[a-z0-9._-]+$/.test(r2.utm_source) && /^[a-z0-9._-]*$/.test(r2.utm_campaign), "values are lower-cased, limited to [a-z0-9._-] and 64 characters", r2);
ok(G.utmClickRow(req("not a url", HUMAN), html, NOW) === null && G.utmClickRow(null, html, NOW) === null, "a malformed request records nothing instead of throwing");

await G.utmRecord(env, r1); await G.utmRecord(env, r1);
await G.utmRecord(env, G.utmClickRow(req("https://papers.qnfo.org/papers/p-adic-x?utm_source=bluesky&utm_medium=social&utm_campaign=p-adic-x", BOT), html, NOW));
await G.utmRecord(env, G.utmClickRow(req("https://qnfo.org/?utm_source=digest&utm_medium=email", HUMAN), html, NOW));
const rows = graph.prepare("SELECT * FROM utm_clicks ORDER BY ua_class, utm_source").all();
ok(rows.length === 3 && rows.find((r) => r.ua_class === "human" && r.utm_source === "bluesky").n === 2, "repeat loads count up one row; bot and human stay apart", rows);
ok(rows.find((r) => r.utm_source === "digest").utm_campaign === "", "a missing campaign is stored as '' so the primary key still dedupes");
ok(await G.utmRecord({}, r1) === false && await G.utmRecord(env, null) === false, "no DB binding or no row: nothing written, no throw");
// the isolate cap: past it, nothing is written
const before = G.count;
const G2 = vm.runInContext(block.replace("var UTM_ISOLATE_CAP = 5000;", "var UTM_ISOLATE_CAP = 2;") + ";({ utmRecord })", vm.createContext({ URL, Date, String, Number }));
await G2.utmRecord(env, r1); await G2.utmRecord(env, r1); const third = await G2.utmRecord(env, r1);
ok(third === false && graph.prepare("SELECT n FROM utm_clicks WHERE ua_class='human' AND utm_source='bluesky'").get().n === 4, "an isolate stops recording at its cap (bounded growth under a flood of invented tags)");
ok(before >= 4, "the counter counts recorded clicks");

// ---- dashboard half: the real reach ingest reads GRAPH.utm_clicks into reach_signals source utm ----
const helpers = cut(dsrc, "function reachErr(e) {", "// Keeps the `cap` largest entries");
const ingest = cut(dsrc, "var REACH_DDL = [", "// Q08-REVIEW-2026-10-31 (agent_issues 1716");
{ const dv = (/var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(dsrc) || []).slice(1).map(Number); ok(dv.length === 3 && (dv[0] > 1 || (dv[0] === 1 && dv[1] >= 26)), "qnfo-fleet-dashboard VERSION is at least 1.26.0 (a minimum, not a pin)"); }
const audit = new DatabaseSync(":memory:");
audit.exec(`CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE reach_signals (date TEXT NOT NULL, source TEXT NOT NULL, channel TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL, quality TEXT, collected_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (date, source, channel, entity_type, entity_id, metric));
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);`);
const cx = vm.createContext({ console, AbortSignal, fetch: async () => { throw new Error("no network in the offline suite"); } });
vm.runInContext("var VERSION = 'test'; var NAME = 'qnfo-fleet-dashboard'; var ACCOUNT = 'acct'; var DAY_MS = 864e5;\n" +
  "async function d1all(db, sql, params) { let ps = db.prepare(sql); if (params && params.length) ps = ps.bind.apply(ps, params); const r = await ps.all(); return r.results || []; }\n" +
  helpers + "\n" + ingest + "\n;this.__api = { reachIngestTick };", cx);
const T = Date.parse("2026-10-07T03:00:00Z"); // the live run ingests 2026-10-06
let t = await cx.__api.reachIngestTick({ AUDIT: shim(audit), GRAPH: shim(graph) }, { nowMs: T });
const utm = audit.prepare("SELECT channel, entity_type, entity_id, metric, value, quality FROM reach_signals WHERE source = 'utm' AND date = '2026-10-06' ORDER BY channel, metric").all();
ok(t.live && t.live.day === "2026-10-06" && t.live.written.utm === 3, "the ingest writes the day's utm rows", t.live && { w: t.live.written, s: t.live.skipped });
const bh = utm.find((r) => r.channel === "bluesky" && r.metric === "clicks_human");
ok(bh && bh.entity_type === "campaign" && bh.entity_id === "p-adic-x" && bh.value === 4 && bh.quality === "human", "channel = utm_source, entity = campaign, clicks_human counts the human loads", utm);
ok(utm.some((r) => r.channel === "bluesky" && r.metric === "clicks_bot" && r.quality === "bot" && r.value === 1), "bot loads are their own metric with quality bot");
ok(utm.some((r) => r.channel === "digest" && r.entity_id === "(none)"), "an untagged campaign reads '(none)'");
// before the gateway's first tagged load: the table is missing, which is a note, not a skipped error
const empty = new DatabaseSync(":memory:");
const audit2 = new DatabaseSync(":memory:");
audit2.exec(audit.prepare("SELECT group_concat(sql, ';') AS s FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").get().s);
t = await cx.__api.reachIngestTick({ AUDIT: shim(audit2), GRAPH: shim(empty) }, { nowMs: T });
ok(t.live && !t.live.skipped.some((x) => /^utm/.test(x)) && t.live.notes.some((x) => /utm_clicks not created yet/.test(x)), "no utm_clicks table yet: a note, not an error", t.live && { s: t.live.skipped, n: t.live.notes });

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
