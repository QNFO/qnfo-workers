// HUMAN-AUDIENCE-1 offline suite (qnfo-fleet-dashboard 1.22.3, pillar reach; owner directive 2026-10-06). Replays the
// HUMAN-AUDIENCE-1 block from worker.js against an in-memory SQLite D1 and a scripted Cloudflare GraphQL that answers the
// requestHost x refererHost read like Web Analytics did on 2026-10-06. Proves: the tally counts only the public hosts,
// puts a referrer outside the fleet's domains under external_referred_pageviews_7d, a referrer that is another public
// page under continuation_pageviews_7d, drops direct loads and the owner's surfaces; the read carries bot: 0 and a 7-day
// window; both registry rows, the daily ledger row and the reach_signals series are written; a failed read leaves the
// registry untouched; WATCHMAKER_OPS carries the two new runners; the source stays ASCII (ASCII-SOURCE-1).
// Run: node qnfo-fleet-dashboard/human-audience.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const block = src.slice(src.indexOf("// ---- HUMAN-AUDIENCE-1:BEGIN"), src.indexOf("// ---- HUMAN-AUDIENCE-1:END"));
if (!block || block.indexOf("async function refreshHumanAudience(env, nowMs)") < 0) throw new Error("HUMAN-AUDIENCE-1 block not found in worker.js");
const helpers = src.slice(src.indexOf("function reachRumQuery(dims, geq, leq, extraFilter) {"), src.indexOf("// Multi-row INSERT OR REPLACE: 12 rows x 8 bound values"));
if (!helpers || helpers.indexOf("function reachRumGroups(data)") < 0) throw new Error("reach helpers not found in worker.js");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE reach_signals (date TEXT NOT NULL, source TEXT NOT NULL, channel TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL, quality TEXT, collected_at TEXT DEFAULT (datetime('now')), PRIMARY KEY (date, source, channel, entity_type, entity_id, metric));`);
  return db;
}
function d1(db) {
  return { prepare(sql) {
    let args = [];
    const s = {
      bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; },
      async all() { return { results: db.prepare(sql).all(...args) }; },
      async first() { return db.prepare(sql).get(...args) || null; },
      async run() { db.prepare(sql).run(...args); return { success: true }; }
    };
    return s;
  } };
}
// The 2026-10-06 live read, abridged (counts are RUM's sampled multiples of 10).
const LIVE = [
  { count: 490, dimensions: { refererHost: "", requestHost: "papers.qnfo.org" } },
  { count: 190, dimensions: { refererHost: "", requestHost: "qnfo.org" } },
  { count: 220, dimensions: { refererHost: "", requestHost: "fleet.qnfo.org" } },
  { count: 80, dimensions: { refererHost: "fleet.qnfo.org", requestHost: "fleet.qnfo.org" } },
  { count: 10, dimensions: { refererHost: "t.co", requestHost: "papers.qnfo.org" } },
  { count: 10, dimensions: { refererHost: "www.google.com", requestHost: "qnfo.org" } },
  { count: 10, dimensions: { refererHost: "www.google.com", requestHost: "q08.org" } },
  { count: 30, dimensions: { refererHost: "qnfo.org", requestHost: "papers.qnfo.org" } },
  { count: 80, dimensions: { refererHost: "qnfo.org", requestHost: "qnfo.org" } },
  { count: 50, dimensions: { refererHost: "q08.org", requestHost: "q08.org" } },
  { count: 20, dimensions: { refererHost: "ideas.qnfo.org", requestHost: "qnfo.org" } },
  { count: 10, dimensions: { refererHost: "qnfo.org", requestHost: "ideas.qnfo.org" } },
  { count: 60, dimensions: { refererHost: "ask.qwav.tech", requestHost: "ask.qwav.tech" } },
  { count: 10, dimensions: { refererHost: "qnfo-social.q08.workers.dev", requestHost: "qnfo.org" } },
  { count: 10, dimensions: { refererHost: "Www.Bing.com", requestHost: "papers.qnfo.org" } }
];
function load(db, queries, answer) {
  const cx = vm.createContext({ console, Date, JSON, Math, Number, String, Object, Array, isFinite, isNaN, RegExp });
  cx.__q = queries; cx.__answer = answer;
  vm.runInContext(
    "var ACCOUNT = 'acct'; var DAY_MS = 86400000; var REACH_RUM_LIMIT = 10000;\n" +
    "function reachErr(e) { return String(e && e.message || e); }\n" +
    helpers + block +
    // the real reachGf (inside helpers) is replaced AFTER it is declared, so the scripted answer wins
    "\nreachGf = async function(env, query) { __q.push(query); return __answer(query); };" +
    "\nthis.__run = refreshHumanAudience; this.__tally = humanAudienceTally; this.__k = { HA_PUBLIC_HOSTS, HA_FLEET_HOST_RE };", cx);
  return cx;
}
const answerLive = () => ({ data: { viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: LIVE }] } }, err: null });

// 1. The pure tally on the live shape.
{
  const cx = load(freshDb(), [], answerLive);
  const t = cx.__tally(LIVE);
  ok(t.external === 40, "external: t.co 10 + google 20 + bing 10 = 40 (got " + t.external + ")");
  ok(t.continuation === 220, "continuation: qnfo.org->papers 30, qnfo.org->qnfo.org 80, q08->q08 50, ask->ask 60 = 220 (got " + t.continuation + ")");
  ok(t.direct === 680, "direct on public hosts only: papers 490 + qnfo.org 190 = 680 (fleet.qnfo.org's 220 are not public pages) (got " + t.direct + ")");
  ok(t.refs["www.bing.com"] === 10 && t.refs["t.co"] === 10 && t.refs["www.google.com"] === 20, "referrer breakdown is lower-cased and summed");
  ok(cx.__k.HA_FLEET_HOST_RE.test("qnfo-social.q08.workers.dev") && cx.__k.HA_FLEET_HOST_RE.test("fleet.qnfo.org") && !cx.__k.HA_FLEET_HOST_RE.test("news.ycombinator.com") && !cx.__k.HA_FLEET_HOST_RE.test("qnfo.org.evil.example"), "the fleet-host rule matches every owned domain and workers.dev, not outside hosts");
  ok(cx.__tally(null).external === 0 && cx.__tally([{ count: 5, dimensions: { requestHost: "fleet.qnfo.org", refererHost: "www.google.com" } }]).external === 0, "no groups and owner-surface pages count nothing");
}
// 2. The refresh: one bot-filtered 7-day read, both registry rows, the ledger and the series.
{
  const db = freshDb(), q = [];
  const cx = load(db, q, answerLive);
  const now = Date.parse("2026-10-06T07:00:00Z");
  const r = await cx.__run({ AUDIT: d1(db) }, now);
  ok(r.why === null && r.value && r.value.external === 40, "the refresh returns the tally");
  ok(q.length === 1 && /bot: 0/.test(q[0]) && /requestHost refererHost/.test(q[0]) && /datetime_geq: "2026-09-29T07:00:00.000Z"/.test(q[0]), "one RUM read with bot: 0, both dimensions and a 7-day window");
  const e = db.prepare("SELECT last_value, state, owner, target FROM metric_registry WHERE metric='external_referred_pageviews_7d'").get();
  const c = db.prepare("SELECT last_value, state, owner FROM metric_registry WHERE metric='continuation_pageviews_7d'").get();
  ok(e && e.last_value === "40" && e.state === "MEASURED" && e.owner === "qnfo-social" && /2026-12-31/.test(e.target), "external_referred_pageviews_7d registered and measured: " + JSON.stringify(e));
  ok(c && c.last_value === "220" && c.state === "MEASURED" && c.owner === "qnfo-gateway", "continuation_pageviews_7d registered and measured: " + JSON.stringify(c));
  const led = db.prepare("SELECT ts, status, meta, text FROM cloud_ops_events WHERE id='human-audience-2026-10-06'").get();
  ok(led && led.status === "ok" && JSON.parse(led.meta).refs["www.google.com"] === 20 && /external 40, continuation 220, direct 680/.test(led.text), "one ledger row per day carries the breakdown");
  const sig = db.prepare("SELECT metric, value, quality FROM reach_signals WHERE source='cf-rum-human' AND date='2026-10-06' ORDER BY metric").all();
  ok(sig.length === 3 && sig[0].metric === "continuation_7d" && sig[0].value === 220 && sig[1].metric === "direct_7d" && sig[1].quality === "unknown" && sig[2].metric === "external_referred_7d" && sig[2].value === 40, "reach_signals keeps the daily series: " + JSON.stringify(sig));
  // a second refresh the same day replaces, never duplicates
  await cx.__run({ AUDIT: d1(db) }, now + 36e5);
  ok(db.prepare("SELECT COUNT(*) AS n FROM cloud_ops_events").get().n === 1 && db.prepare("SELECT COUNT(*) AS n FROM reach_signals").get().n === 3, "a second refresh the same day replaces the day's rows");
}
// 3. A failed read leaves the registry untouched (never a fabricated zero).
{
  const db = freshDb(), q = [];
  db.prepare("INSERT INTO metric_registry (metric, layer, kind, last_value, last_refreshed, state) VALUES ('external_referred_pageviews_7d', 'fleet', 'leading', '33', '2026-10-05T00:00:00Z', 'MEASURED')").run();
  const cx = load(db, q, () => ({ data: null, err: "graphql http 500: boom" }));
  const r = await cx.__run({ AUDIT: d1(db) }, Date.parse("2026-10-06T07:00:00Z"));
  ok(r.value === null && /boom/.test(r.why), "a failed read reports why");
  const e = db.prepare("SELECT last_value, last_refreshed FROM metric_registry WHERE metric='external_referred_pageviews_7d'").get();
  ok(e.last_value === "33" && e.last_refreshed === "2026-10-05T00:00:00Z" && db.prepare("SELECT COUNT(*) AS n FROM cloud_ops_events").get().n === 0, "the registry row and the ledger are untouched");
  const cx2 = load(freshDb(), [], () => ({ data: { viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: Array.from({ length: 10000 }, () => ({ count: 1, dimensions: { requestHost: "qnfo.org", refererHost: "x.example" } })) }] } }, err: null }));
  ok((await cx2.__run({ AUDIT: d1(freshDb()) })).value === null, "a read at the group limit is reported, not written as a total");
}
// 4. The refresh is wired into refreshRegistryMetrics, and WATCHMAKER_OPS carries the two new runners.
{
  const fn = src.slice(src.indexOf("async function refreshRegistryMetrics(env) {"), src.indexOf("// ---- ENGAGED-HUMAN-SESSIONS-1:BEGIN"));
  ok(/refreshHumanAudience\(env, Date\.now\(\)\)/.test(fn) && /out\.refreshed\.push\("external_referred_pageviews_7d"\)/.test(fn), "refreshRegistryMetrics calls refreshHumanAudience and reports both metrics");
  const ops = src.slice(src.indexOf("var WATCHMAKER_OPS = ["), src.indexOf("function wmIso(v) {"));
  ok(/key: "social-channels"[^\n]*runner: "cron:qnfo-social"[^\n]*social-channels-/.test(ops), "WATCHMAKER_OPS measures the per-channel drain ledger (social-channels-<day>)");
  ok(/key: "signal-intake"[^\n]*runner: "cron:radar-hub"[^\n]*signal-intake-/.test(ops), "WATCHMAKER_OPS measures the signal intake ledger (signal-intake-<day>)");
}
// 5. ASCII-SOURCE-1: the canonical deploy uploads the file as Latin-1.
ok(!/[^\x00-\x7f]/.test(src), "worker.js stays ASCII");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
