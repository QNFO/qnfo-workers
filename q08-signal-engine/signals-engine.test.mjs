// SIGNALS-ENGINE-2: the registry signal engine. Pure parts (feed parsing, topic, scoring, schedule, health) and a full tick against a real
// SQLite (node:sqlite, the D1 dialect) with every outbound fetch stubbed. Run: node q08-signal-engine/signals-engine.test.mjs
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
const mod = await import(pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), "worker.js")).href);
const S = mod.__sig;
let fails = 0, passes = 0;
const check = (l, c, x) => { if (c) passes++; else { fails++; console.log("FAIL " + l + (x !== undefined ? " -- " + JSON.stringify(x) : "")); } };

// ---------- parsing ----------
const rss = `<?xml version="1.0"?><rss version="2.0"><channel><title>X</title>
<item><title><![CDATA[Fed holds interest rates steady as inflation cools]]></title><link>https://example.com/a</link><pubDate>${new Date().toUTCString()}</pubDate><description>&lt;p&gt;The central bank&amp;rsquo;s board&lt;/p&gt;</description></item>
<item><title>OPEC agrees oil output cut</title><link>https://example.com/b</link><source url="https://www.reuters.com">Reuters</source></item></channel></rss>`;
const r1 = S.sigParseFeed(rss);
check("RSS: two items", r1.length === 2, r1);
check("RSS: CDATA title decoded", r1[0].title === "Fed holds interest rates steady as inflation cools", r1[0]);
check("RSS: html stripped from the summary", !/</.test(r1[0].summary), r1[0].summary);
check("RSS: <source url> carried as the publisher", r1[1].publisher_url === "https://www.reuters.com");
const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Quantum error correction milestone</title><link rel="alternate" href="https://lab.example.org/q1"/><updated>2026-11-12T10:00:00Z</updated><summary>Researchers report</summary></entry></feed>`;
const a1 = S.sigParseFeed(atom);
check("Atom: entry with link href", a1.length === 1 && a1[0].url === "https://lab.example.org/q1", a1);
const rdf = `<rdf:RDF><item rdf:about="x"><title>Ceasefire talks resume</title><link>https://dw.example/c</link><dc:date>2026-11-12T08:00:00Z</dc:date></item></rdf:RDF>`;
check("RDF (RSS 1.0): item parsed with dc:date", S.sigParseFeed(rdf)[0]?.published === Date.parse("2026-11-12T08:00:00Z"));
check("HTML is not a feed", S.sigParseFeed("<html><body><item>x</item></body></html>").length === 0);
check("GDELT: plain-text error reads as a failure (null)", S.sigParseGdelt("Please limit requests to one every 5 seconds") === null);
const g = S.sigParseGdelt(JSON.stringify({ articles: [{ title: "Iran sanctions widen", url: "https://news.example.net/x", seendate: "20261112T090000Z", domain: "news.example.net" }] }));
check("GDELT: article with its domain as publisher", g.length === 1 && g[0].publisher_url === "https://news.example.net" && g[0].published === Date.UTC(2026, 10, 12, 9), g);
const links = S.sigFeedLinks('<head><link rel="alternate" type="application/rss+xml" href="/feed.xml"><link rel="stylesheet" href="/s.css"></head>', "https://pub.example/");
check("autodiscovery: the rss alternate link, resolved", links.length === 1 && links[0] === "https://pub.example/feed.xml", links);

// ---------- topic, title key, demand ----------
check("topic: rates story is macro", S.sigTopicOf("Fed signals interest rate cut as inflation eases", "") === "macro");
check("topic: ransomware story is security", S.sigTopicOf("Ransomware gang claims hospital breach", "") === "security");
check("topic: no keyword falls back to the source hint", S.sigTopicOf("Something happened", "energy") === "energy");
check("title key ignores case, punctuation and articles", S.sigTitleKey("The Fed Holds Rates!") === S.sigTitleKey("fed holds rates"));
const dq = S.sigDemandQueries(["Will Iran close the Strait of Hormuz by December 31?", "Will the Fed cut rates in December?", "Will Iran and Israel sign a ceasefire?", "Will Nvidia hit $5T?"], 5);
check("demand: the most asked-about entity first, no stop words or months", dq[0] === "Iran" && !dq.some((w) => /^(will|december)$/i.test(w)), dq);

// ---------- scoring and state ----------
check("quality rises on a productive fetch", S.sigQuality(0.5, { ok: true, added: 6, fresh: 1, novelty: 1 }) > 0.5);
check("quality falls on a failed fetch", S.sigQuality(0.5, { ok: false }) < 0.5);
const now = Date.parse("2026-11-12T12:00:00Z");
let st = { state: "probation", ok_count: 2, fail_streak: 0 };
check("probation -> active on the third good fetch", S.sigNextState(st, true, 3, now).state === "active");
st = { state: "active", ok_count: 9, fail_streak: 2, last_ok_at: "2026-11-11T00:00:00Z" };
const q3 = S.sigNextState(st, false, 0, now);
check("third failure quarantines with a backoff in the future", q3.state === "quarantined" && Date.parse(q3.next_at) > now + 3600000, q3);
check("a quarantined source that answers is active again", S.sigNextState({ state: "quarantined", ok_count: 1, fail_streak: 5 }, true, 2, now).state === "active");
check("long failure retires", S.sigNextState({ state: "quarantined", fail_streak: 11, last_ok_at: "2026-10-01T00:00:00Z" }, false, 0, now).state === "retired");

// ---------- schedule: topic deficit first, gdelt bounded, retired and not-due excluded ----------
const rows = [
  { id: "rss:a", kind: "rss", topic: "technology", state: "active", quality: 0.9 },
  { id: "rss:b", kind: "rss", topic: "energy", state: "active", quality: 0.6 },
  { id: "gdelt:x", kind: "gdelt", topic: "macro", state: "active", quality: 0.9 },
  { id: "gdelt:y", kind: "gdelt", topic: "health", state: "active", quality: 0.9 },
  { id: "rss:dead", kind: "rss", topic: "energy", state: "retired", quality: 0.9 },
  { id: "rss:later", kind: "rss", topic: "energy", state: "active", quality: 0.9, next_at: "2026-11-12T13:00:00Z" }
];
const sch = S.sigSchedule(rows, { technology: 0.8, energy: 0, macro: 0, health: 0 }, now, { perTick: 10, gdelt: 1 });
const ids = sch.map((r) => r.id);
check("under-covered energy outranks over-covered technology", ids.indexOf("rss:b") < ids.indexOf("rss:a"), ids);
check("only one GDELT search a tick", ids.filter((i) => i.startsWith("gdelt")).length === 1, ids);
const many = [].concat(...[1, 2, 3, 4, 5].map((i) => [{ id: "gnews:" + i, kind: "gnews", topic: "macro", state: "active", quality: 0.9 }]));
check("at most two Google News searches a tick", S.sigSchedule(many, {}, now, { perTick: 10 }).length === 2);
check("retired and not-due sources are not fetched", !ids.includes("rss:dead") && !ids.includes("rss:later"), ids);

// ---------- self-tuning ----------
const deg = { verdict: "degraded", reasons: ["40 signals in 24 hours (floor 60)"] }, okv = { verdict: "ok", reasons: [] };
check("tune: three fixable degraded ticks raise the budget by 4", S.sigTune(24, [deg, deg, deg], 5).n === 28);
check("tune: degraded only for 'active sources' does not raise it", S.sigTune(24, [{ verdict: "degraded", reasons: ["0 active sources (floor 20)"] }, { verdict: "degraded", reasons: ["0 active sources (floor 20)"] }, { verdict: "degraded", reasons: ["0 active sources (floor 20)"] }], 5).n === 24);
check("tune: six ok ticks lower it by 4, never under 12", S.sigTune(24, Array(6).fill(okv), 5).n === 20 && S.sigTune(12, Array(6).fill(okv), 5).n === 12);
check("tune: never over 40", S.sigTune(40, [deg, deg, deg], 5).n === 40);
check("tune: a change waits three ticks", S.sigTune(24, [deg, deg, deg], 2).n === 24);
// ---------- health: the measured 2026-11-12 stream is degraded ----------
const hBefore = S.sigHealthOf([{ source: "hn", publisher: null, topic: null, n: 41 }, { source: "arxiv", publisher: null, topic: null, n: 24 }, { source: "github", publisher: null, topic: null, n: 15 }], []);
check("HN-dominated stream: degraded, HN named", hBefore.verdict === "degraded" && hBefore.max_publisher === "news.ycombinator.com" && hBefore.reasons.some((r) => /holds/.test(r)), hBefore);
const balanced = []; S.SIG_TOPIC_KEYS.forEach((t, i) => { for (let k = 0; k < 4; k++) balanced.push({ source: "rss", publisher: "pub" + i + "-" + k + ".example", topic: t, n: 2 }); });
const srcs = Array.from({ length: 25 }, (_, i) => ({ id: "s" + i, state: "active" }));
const hOk = S.sigHealthOf(balanced, srcs);
check("balanced stream with 25 active sources is ok", hOk.verdict === "ok", hOk.reasons);

check("health: rows without a topic do not count as a covered topic", S.sigHealthOf([{ source: "hn", topic: null, n: 5 }], []).topics_covered === 0);
// ---------- a full tick on SQLite ----------
function d1(db) {
  const wrap = (sql, args) => ({
    bind: (...a) => wrap(sql, a),
    run: async () => { const r = db.prepare(sql).run(...(args || [])); return { meta: { changes: Number(r.changes) } }; },
    first: async () => db.prepare(sql).get(...(args || [])) || null,
    all: async () => ({ results: db.prepare(sql).all(...(args || [])) })
  });
  return { prepare: (sql) => wrap(sql, []), batch: async (stmts) => { const out = []; for (const s of stmts) out.push(await s.run()); return out; } };
}
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE signal_log (id TEXT PRIMARY KEY, source TEXT NOT NULL, source_id TEXT, title TEXT, url TEXT, points INTEGER DEFAULT 0, num_comments INTEGER DEFAULT 0, ratio REAL DEFAULT 0, volatility_score REAL DEFAULT 0, friction_point TEXT, signal_strength TEXT, status TEXT DEFAULT 'pending', created_at TEXT DEFAULT (datetime('now')), processed_at TEXT)");
db.exec("CREATE TABLE engine_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ran_at TEXT DEFAULT (datetime('now')), signals_scraped INTEGER, signals_scored INTEGER, piece_published INTEGER, top_signal TEXT, model TEXT, ms INTEGER, status TEXT, error TEXT, source_chars INTEGER, source_kind TEXT, compose_calls INTEGER, verify_calls INTEGER, panel_calls INTEGER, factcheck_calls INTEGER)");
const WORDS = ["inflation", "oil", "ceasefire", "vaccine", "wildfire", "ransomware", "semiconductor", "OpenAI", "antitrust", "telescope", "merger"];
let feedCalls = 0, failingCalls = 0, hnCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (u) => {
  u = String(u);
  if (u.includes("hn.algolia.com")) { hnCalls++; return new Response(JSON.stringify({ hits: Array.from({ length: 40 }, (_, i) => ({ _tags: ["story"], objectID: "h" + i, story_id: 1000 + i, title: "HN story number " + i + " about programming tools", url: "https://blog" + i + ".example/p", points: 100 + i, num_comments: 50, created_at: new Date().toISOString() })) }), { status: 200 }); }
  if (u.includes("api.github.com") || u.includes("export.arxiv.org") || u.includes("federalregister.gov")) return new Response("{}", { status: 503 });
  if (u.includes("cnbc.com")) { failingCalls++; return new Response("gone", { status: 404 }); }
  if (u.includes("news.google.com/rss/search")) return new Response("busy", { status: 503 }); // the live failure of 2026-11-12 12:00Z
  if (u.includes("pm.internal/api/markets")) return new Response(JSON.stringify({ markets: [{ title: "Will Iran close the Strait of Hormuz?" }, { title: "Will Iran sign a deal?" }] }), { status: 200 });
  if (u.includes("pm.internal/api/forecasts")) return new Response(JSON.stringify({ forecasts: [{ evidence_json: JSON.stringify([{ url: "https://www.theguardian.com/x" }]) }] }), { status: 200 });
  if (u.includes("api.gdeltproject.org")) return new Response(JSON.stringify({ articles: [{ title: "GDELT item on " + u.length + " central bank inflation", url: "https://gd.example.org/" + u.length, seendate: "20261112T090000Z", domain: "gd.example.org" }] }), { status: 200 });
  if (u.startsWith("https://repeat.example.com/")) return new Response(u.endsWith("/") ? '<html><head><link rel="alternate" type="application/rss+xml" href="/rss"></head></html>' : `<rss><channel>${[1, 2, 3, 4].map((i) => `<item><title>Repeat feed item ${i} on oil prices</title><link>https://repeat.example.com/${i}</link></item>`).join("")}</channel></rss>`, { status: 200 });
  // every other feed or search: a few items named after the url, one publisher that recurs (repeat.example.com) for discovery
  feedCalls++;
  const tag = u.replace(/[^a-z]/gi, "").slice(-18);
  const w = WORDS[feedCalls % WORDS.length];
  const items = [0, 1, 2].map((i) => `<item><title>${w} report ${tag} ${i} ${feedCalls}</title><link>https://site${feedCalls}.example/${i}</link><pubDate>${new Date().toUTCString()}</pubDate>${i === 0 ? '<source url="https://repeat.example.com">Repeat</source>' : ""}</item>`).join("");
  return new Response(`<rss><channel>${items}</channel></rss>`, { status: 200 });
};
const env = { DB: d1(db), AUDIT: { prepare: () => ({ bind() { return this; }, first: async () => null, run: async () => ({ meta: { changes: 0 } }), all: async () => ({ results: [] }) }) }, PM: { fetch: (u) => globalThis.fetch(u) } };
S.resetSchema();
const t1 = await S.sigTick(env);
const seeded = db.prepare("SELECT COUNT(*) n FROM sig_sources").get().n;
check("tick 1 seeds the registry", seeded >= S.SIG_SEEDS.length && db.prepare("SELECT COUNT(*) n FROM sig_sources WHERE discovered_from = 'seed'").get().n === S.SIG_SEEDS.length, seeded);
check("tick 1 fetched a budget of sources plus demand searches", t1.fetched >= 20, t1.fetched);
const hn = db.prepare("SELECT COUNT(*) n FROM signal_log WHERE source = 'hn'").get().n;
const tot = db.prepare("SELECT COUNT(*) n FROM signal_log").get().n;
check("Hacker News is capped per tick (40 offered)", hn <= 10, hn);
check("most signals come from elsewhere", tot > 3 * hn && tot >= 30, { tot, hn });
check("signals carry publisher, topic and title key", db.prepare("SELECT COUNT(*) n FROM signal_log WHERE publisher IS NULL OR topic IS NULL OR title_key IS NULL").get().n === 0);
check("demand search ran for the forecast questions' top entity", db.prepare("SELECT COUNT(*) n FROM sig_state WHERE key = 'demand:iran'").get().n === 1);
check("a failing search lane is named in the tick actions", t1.actions.some((a) => /^search lane: \d+ of \d+ searches failed/.test(a)), t1.actions);
check("a sig_health row was written", db.prepare("SELECT COUNT(*) n FROM sig_health").get().n === 1);
check("an engine_runs row is not written by sigTick itself (signalsOnly owns it)", db.prepare("SELECT COUNT(*) n FROM engine_runs").get().n === 0);
// make every source due again and run until the failing feed is quarantined and the recurring domain is discovered
for (let k = 0; k < 6; k++) { db.exec("UPDATE sig_sources SET next_at = NULL WHERE state <> 'quarantined'"); await S.sigTick(env); }
const cn = db.prepare("SELECT state, fail_streak FROM sig_sources WHERE id = 'rss:cnbc-top'").get();
check("a feed that keeps failing is quarantined", cn.state === "quarantined" && cn.fail_streak >= 3, cn);
const disc = db.prepare("SELECT * FROM sig_sources WHERE discovered_from = 'domain:repeat.example.com'").get();
check("a recurring publisher's feed is discovered and is scored from probation", disc && disc.url === "https://repeat.example.com/rss" && (disc.state === "probation" || disc.state === "active"), disc);
const dup = db.prepare("SELECT title_key, COUNT(*) n FROM signal_log GROUP BY title_key HAVING n > 1").all();
check("no signal is attributed to news.google.com", db.prepare("SELECT COUNT(*) n FROM signal_log WHERE publisher = 'news.google.com'").get().n === 0);
check("no title is stored twice", dup.length === 0, dup.slice(0, 3));
for (let k = 0; k < 4; k++) { db.exec("UPDATE sig_sources SET next_at = NULL WHERE state <> 'quarantined'"); await S.sigTick(env); }
const hh = S.sigHealthOf(db.prepare("SELECT publisher, source, topic, COUNT(*) n FROM signal_log GROUP BY publisher, source, topic").all(), []);
check("Hacker News share of the stream is under the limit", (hh.top_publishers.find((p) => p.publisher === "news.ycombinator.com") || { share: 0 }).share <= 0.35, hh.top_publishers.slice(0, 3));
check("more than 8 topics covered", hh.topics_covered >= 8, hh.topic_share);
// the signals-only cron path writes one engine_runs row naming the engine
const out = await mod.__gen.governedGenerate(env);
check("governedGenerate in signals mode runs the registry engine", out && out.mode === "signals" && out.added >= 0 && out.health, out);
check("engine_runs row names SIGNALS-ENGINE-2", /SIGNALS-ENGINE-2/.test(db.prepare("SELECT error FROM engine_runs ORDER BY id DESC LIMIT 1").get().error));
globalThis.fetch = realFetch;
console.log("signals-engine: " + passes + " passed, " + fails + " failed");
process.exit(fails ? 1 : 0);
