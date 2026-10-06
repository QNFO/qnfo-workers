// SIGNAL-INTAKE-SOURCES-1 offline suite (radar-hub 1.3.0, agent_issues 1947, pillar research). Loads the real worker.js
// (the cloudflare:workers import swapped for a stub) and drives intakeMod against an in-memory SQLite D1 with a stubbed
// fetch. Proves: RSS 2.0, RSS 1.0/RDF, Atom and arXiv API bodies parse; only items with a strong lexicon match and a
// score of 3+ become candidates; selection spreads across families and respects the per-run cap; every picked item is
// one idea_proposals row (name intake:<family>, deduped by URL on a second run); the daily ledger row and the metric
// signal_source_families_7d are written; the events radar's source read skips kind 'signal'; the 08:30Z slot runs it.
// Run: node radar-hub/signal-intake.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.startsWith(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};")).toString("base64"));
const intake = mod.intakeMod;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

// ---------- parser ----------
const RSS2 = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
<item><title>Cooperation thrives when moral judgment matches moral conduct</title><link>https://arxiv.org/abs/2610.03832</link>
<description><![CDATA[arXiv:2610.03832v1 Announce Type: new <p>Abstract: indirect reciprocity and cooperation in complex systems of strangers; a phase transition in the moral network.</p>]]></description><pubDate>Tue, 06 Oct 2026 00:00:00 -0400</pubDate></item>
<item><title>Author Correction: something</title><link>https://example.org/corr</link><description>landauer entropy information</description></item>
<item><title>Short</title><link>https://example.org/short</link><description>landauer entropy information thermodynamic</description></item>
</channel></rss>`;
const RDF = `<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" xmlns="http://purl.org/rss/1.0/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel rdf:about="x"><title>Nature</title></channel>
<item rdf:about="https://www.nature.com/articles/d41586-026-03157-1"><title>The thermodynamic cost of computation in living cells &amp; brains</title><link>https://www.nature.com/articles/d41586-026-03157-1</link><description>Landauer bound, entropy production and energy per computation measured in neurons.</description><dc:date>2026-10-05</dc:date></item>
<item rdf:about="https://www.nature.com/articles/d41586-026-03094-z"><title>A new telescope sees its first light over the desert</title><link>https://www.nature.com/articles/d41586-026-03094-z</link><description>Astronomers celebrate.</description></item>
</rdf:RDF>`;
const ATOM = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>arXiv</title>
<entry><id>http://arxiv.org/abs/2610.00001v1</id><updated>2026-10-05T00:00:00Z</updated><published>2026-10-05T00:00:00Z</published><title>Ultrametric models of hierarchical memory</title><summary>We study p-adic and ultrametric structures of information in complex networks.</summary><link href="http://arxiv.org/abs/2610.00001v1" rel="alternate" type="text/html"/><link title="pdf" href="http://arxiv.org/pdf/2610.00001v1" rel="related"/></entry>
<entry><id>http://arxiv.org/abs/2610.00002v1</id><published>2026-10-05T00:00:00Z</published><title>Emergence and self-organisation in agentic multi-agent systems for scientific discovery</title><summary>autonomous research agents, hypothesis generation, open science.</summary><link href="http://arxiv.org/abs/2610.00002v1" rel="alternate"/></entry>
<entry><id>http://arxiv.org/abs/2610.00003v1</id><published>2020-01-01T00:00:00Z</published><title>Old item about the free energy principle and consciousness in the brain</title><summary>active inference</summary><link href="http://arxiv.org/abs/2610.00003v1" rel="alternate"/></entry>
<entry><id>http://arxiv.org/abs/2610.00004v1</id><published>2026-10-05T00:00:00Z</published><title>Benchmarks for a transformer language model on code</title><summary>We train a model and report theory of scaling; information about tokens.</summary><link href="http://arxiv.org/abs/2610.00004v1" rel="alternate"/></entry>
</feed>`;

const p1 = intake.parseFeed(RSS2);
ok(p1.length === 3 && p1[0].link === "https://arxiv.org/abs/2610.03832" && /indirect reciprocity/.test(p1[0].summary) && !/<p>/.test(p1[0].summary), "RSS 2.0 parses: link, CDATA description stripped of HTML");
const p2 = intake.parseFeed(RDF);
ok(p2.length === 2 && p2[0].link === "https://www.nature.com/articles/d41586-026-03157-1" && p2[0].title.indexOf("&") > 0 && p2[0].published === "2026-10-05", "RSS 1.0 / RDF parses: rdf:about or link, entity decoded, dc:date");
const p3 = intake.parseFeed(ATOM);
ok(p3.length === 4 && p3[0].link === "http://arxiv.org/abs/2610.00001v1" && p3[0].published.startsWith("2026-10-05"), "Atom / arXiv API parses: rel=alternate link, not the pdf link");

// ---------- scoring ----------
ok(intake.score({ title: "Benchmarks for a transformer language model on code", summary: "We train a model and report theory of scaling; information about tokens." }).strong.length === 0, "weak-only text has no strong match");
const s1 = intake.score(p3[0]);
ok(s1.strong.indexOf("ultrametric") >= 0 && s1.strong.indexOf("p-adic") >= 0 && s1.score >= 3, "ultrametric / p-adic text scores strong");
ok(intake.score({ title: "Nothing here", summary: "the weather today" }).score === 0, "unrelated text scores 0");

// ---------- selection ----------
const sel = intake.selectAcross([
  { family: "b", score: 9, link: "b1" }, { family: "b", score: 8, link: "b2" }, { family: "b", score: 7, link: "b3" },
  { family: "a", score: 1, link: "a1" }, { family: "c", score: 5, link: "c1" }
], 4);
ok(sel.map((x) => x.link).join(",") === "a1,b1,c1,b2", "selection round-robins families (a, b, c) then second picks, capped at 4: " + sel.map((x) => x.link).join(","));

// ---------- in-memory D1 ----------
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE radar_sources (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, url TEXT NOT NULL, kind TEXT, cadence TEXT, category TEXT, tags TEXT, enabled INTEGER DEFAULT 1, added_at TEXT DEFAULT (datetime('now')), UNIQUE(url));
CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT, idea TEXT NOT NULL, contact TEXT, status TEXT DEFAULT 'new', ip_hash TEXT, created_at TEXT DEFAULT (datetime('now')), decision TEXT, score REAL, rationale TEXT, triaged_at TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')));
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
INSERT INTO radar_sources (name, url, kind, cadence, category) VALUES
  ('rss2', 'https://feeds.test/rss2', 'signal', 'daily', 'arxiv-complexity'),
  ('rdf', 'https://feeds.test/rdf', 'signal', 'daily', 'journal-nature'),
  ('atom', 'https://feeds.test/atom', 'signal', 'daily', 'arxiv-ai-society'),
  ('dead', 'https://feeds.test/dead', 'signal', 'daily', 'news-dead'),
  ('venue', 'https://venue.test/agenda', 'venue', 'daily', 'MUS');`);
function stmtOn(sql) {
  let args = [];
  const s = {
    bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; }
  };
  return s;
}
const AUDIT = { prepare: (sql) => stmtOn(sql) };
const calls = [];
const fetchStub = async (u) => {
  calls.push(String(u));
  const X = (b, st) => new Response(b, { status: st || 200, headers: { "content-type": "application/xml" } });
  if (String(u).endsWith("/rss2")) return X(RSS2);
  if (String(u).endsWith("/rdf")) return X(RDF);
  if (String(u).endsWith("/atom")) return X(ATOM);
  if (String(u).endsWith("/dead")) return X("gone", 503);
  return X("<html>no</html>", 200);
};
const now = new Date("2026-10-06T08:30:00Z");

const r1 = await intake.run({ AUDIT }, { fetch: fetchStub, now });
ok(calls.length === 4 && !calls.some((u) => u.indexOf("venue.test") >= 0), "only kind='signal' sources are fetched (venue row skipped): " + calls.length);
ok(r1.status === "degraded" && r1.sources.dead === "error:http 503" && r1.fetched === 3, "a dead source degrades the run, does not stop it: " + JSON.stringify(r1.sources));
// candidates: rss2 item 1 (cooperation + complex system + phase transition + network), rdf item 1 (thermodynamic cost, landauer, entropy production, energy per computation),
// atom items 1 and 2; the correction, the short title, the 2020 item and the weak-only item are out.
ok(r1.candidates === 4, "four candidates pass the lexicon, age and title rules: " + r1.candidates);
ok(r1.inserted === 4 && r1.families["arxiv-complexity"] === 1 && r1.families["journal-nature"] === 1 && r1.families["arxiv-ai-society"] === 2, "every pick is one idea_proposals row, spread across 3 families: " + JSON.stringify(r1.families));
const rows = db.prepare("SELECT name, idea, contact, status, ip_hash FROM idea_proposals ORDER BY id").all();
ok(rows.length === 4 && rows.every((r) => /^intake:/.test(r.name) && r.status === "new" && /^intake:[0-9a-f]{16}$/.test(r.ip_hash) && /^https?:\/\//.test(r.contact)), "proposal rows carry intake:<family>, status new, ip_hash intake:<hash>, the source url in contact");
ok(rows.some((r) => /Why it fits: .*ultrametric/.test(r.idea) && /Source: http:\/\/arxiv\.org\/abs\/2610\.00001v1/.test(r.idea)), "the idea text names the source and the matched terms");
ok(!rows.some((r) => /\?\s*$/.test(r.idea.trim())), "no idea text ends as a question (idea-hub chat-question filter would hold it)");
const seen = db.prepare("SELECT COUNT(*) AS n, SUM(accepted) AS a FROM signal_intake_seen").get();
ok(seen.n === 4 && seen.a === 4, "signal_intake_seen holds every candidate (all accepted this run): " + JSON.stringify(seen));
const led = db.prepare("SELECT id, status, meta FROM cloud_ops_events WHERE id='signal-intake-2026-10-06'").get();
ok(led && led.status === "degraded" && JSON.parse(led.meta).inserted === 4, "one ledger row per day with the run result");
const met = db.prepare("SELECT last_value, state FROM metric_registry WHERE metric='signal_source_families_7d'").get();
ok(met && met.last_value === "3" && met.state === "MEASURED", "metric signal_source_families_7d = 3 after the run: " + JSON.stringify(met));

// second run: nothing new
const r2 = await intake.run({ AUDIT }, { fetch: fetchStub, now: new Date("2026-10-07T08:30:00Z") });
ok(r2.inserted === 0 && r2.dupes === 4 && db.prepare("SELECT COUNT(*) AS n FROM idea_proposals").get().n === 4, "a second run inserts nothing: every URL is already seen: " + JSON.stringify({ inserted: r2.inserted, dupes: r2.dupes }));

// per-run cap and kill switch from ops_config
db.exec("DELETE FROM signal_intake_seen; DELETE FROM idea_proposals; INSERT INTO ops_config (key, value) VALUES ('signal_intake_max_per_run', '2');");
const r3 = await intake.run({ AUDIT }, { fetch: fetchStub, now });
ok(r3.inserted === 2 && Object.keys(r3.families).length === 2 && db.prepare("SELECT COUNT(*) AS n FROM signal_intake_seen WHERE accepted=0").get().n === 2, "ops_config signal_intake_max_per_run=2 caps the run at 2 rows from 2 families; the rest are recorded as seen, not taken");
db.exec("INSERT INTO ops_config (key, value) VALUES ('signal_intake_enabled', '0');");
const r4 = await intake.run({ AUDIT }, { fetch: fetchStub, now });
ok(r4.status === "skipped" && /signal_intake_enabled/.test(r4.reason), "ops_config signal_intake_enabled=0 skips the run and records it");
db.exec("DELETE FROM ops_config;");

// no signal rows at all
db.exec("UPDATE radar_sources SET enabled=0 WHERE kind='signal'");
const r5 = await intake.run({ AUDIT }, { fetch: fetchStub, now });
ok(r5.status === "error" && /no radar_sources rows/.test(r5.error), "no enabled signal source is an error run, never a silent quiet day");
db.exec("UPDATE radar_sources SET enabled=1 WHERE kind='signal'");

// ---------- GET /intake ----------
const last = await intake.last({ AUDIT });
ok(last.last_run && String(last.last_run.ts).startsWith("2026-10-07") && last.last_run.status === "degraded" && last.sources.length === 4, "GET /intake reports the newest run by ts and the source list: " + JSON.stringify(last.last_run && { ts: last.last_run.ts, status: last.last_run.status }));
const errRow = db.prepare("SELECT status FROM cloud_ops_events WHERE id='signal-intake-2026-10-06'").get();
ok(errRow && errRow.status === "error", "the no-source run replaced that day's ledger row with status error");

// ---------- the events radar skips kind 'signal' ----------
ok(/COALESCE\(kind,''\) <> 'signal'/.test(src), "events radar source read excludes kind 'signal' rows");

// ---------- the 08:30Z slot runs the intake ----------
ok(/intakeMod\.run\(env\)/.test(src.slice(src.indexOf('if (c === "30 8 * * *")'), src.indexOf('if (c === "30 8 * * *")') + 900)), "the 30 8 * * * dispatcher entry runs intakeMod");
ok(/"signal-intake"/.test(src.slice(src.indexOf('if (p === "/health")'), src.indexOf('if (p === "/health")') + 1200)), "/health lists the signal-intake capability");

console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
