// PAGEVIEWS-HUMAN-1 offline suite (qnfo-fleet-dashboard 1.18.6, pillar reach). Replays refreshRegistryMetrics from
// worker.js against an in-memory SQLite D1 and a scripted Cloudflare GraphQL that answers like Web Analytics: a query
// carrying the Exclude-bots filter (bot: 0) gets human page loads only, any other query gets human + crawler loads.
// Proves: both 30-day windows behind pageviews_30d and impressions_growth_30d carry the filter inside the filter object;
// pageviews_30d is the human total and its registry formula says so; the growth figure compares filtered with filtered;
// referral_30d keeps its own read; the 55-minute throttle is unchanged; the source stays ASCII (ASCII-SOURCE-1).
// Run: node qnfo-fleet-dashboard/pageviews-human.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const consts = src.slice(src.indexOf("var REGISTRY_GUARD_WORKFLOWS = "), src.indexOf("async function refreshRegistryMetrics(env) {"));
const fn = src.slice(src.indexOf("async function refreshRegistryMetrics(env) {"), src.indexOf("// ---- ENGAGED-HUMAN-SESSIONS-1:BEGIN"));
if (!consts || !fn || consts.indexOf("REGISTRY_PV_FILTER") < 0) throw new Error("PAGEVIEWS-HUMAN-1 source not found in worker.js");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, formula TEXT, source_of_truth TEXT, target TEXT, owner TEXT, last_value TEXT, last_refreshed TEXT, state TEXT)");
  for (const m of ["pageviews_30d", "impressions_growth_30d", "referral_30d", "guard_rcs", "fleet_context_tokens"]) {
    db.prepare("INSERT INTO metric_registry (metric, formula, last_value, last_refreshed, state) VALUES (?, 'old formula', '6060', ?, 'MEASURED')").run(m, "2026-10-02T06:00:00.000Z");
  }
  return db;
}
function d1(db) {
  return {
    prepare(sql) {
      let args = [];
      const s = {
        bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return s; },
        async all() { return { results: db.prepare(sql).all(...args) }; },
        async first() { return db.prepare(sql).get(...args) || null; },
        async run() { db.prepare(sql).run(...args); return { success: true }; }
      };
      return s;
    }
  };
}
// 30 days of RUM: 199 human + 3 crawler page loads per day now, 160 + 2 per day in the prior window.
const days = (n, base) => Array.from({ length: n }, (_, i) => new Date(Date.parse(base) - i * 864e5).toISOString().slice(0, 10));
function rum(query) {
  const human = /bot: 0/.test(query);
  if (/refererHost/.test(query)) return [{ count: 40, dimensions: { refererHost: "news.ycombinator.com" } }, { count: 25, dimensions: { refererHost: "qnfo.org" } }];
  if (/dimensions \{ date \}/.test(query)) return days(30, "2026-09-01").map((d) => ({ count: human ? 160 : 162, dimensions: { date: d } }));
  return days(30, "2026-10-01").map(() => ({ count: human ? 199 : 202 }));
}
function load(db, queries) {
  const cx = vm.createContext({ console, Date, JSON, Math, Number, String, Object, Array, isFinite, isNaN });
  cx.__db = db; cx.__q = queries; cx.__rum = rum;
  vm.runInContext(
    "var ACCOUNT = 'acct';\n" +
    "async function d1all(db, sql, params) { let ps = db.prepare(sql); if (params && params.length) ps = ps.bind.apply(ps, params); const r = await ps.all(); return r.results || []; }\n" +
    "async function roiGf(env, query) { __q.push(query); return { viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: __rum(query) }] } }; }\n" +
    "async function refreshEngagedHumanSessions() { return { value: 5580, why: null }; }\n" +
    "async function ghCall() { throw new Error('no GitHub in this suite'); }\n" +
    consts + fn + "\nthis.__run = refreshRegistryMetrics; this.__k = { REGISTRY_PV_FILTER, REGISTRY_PV_FORMULA };", cx);
  return cx;
}

// 1. A due refresh: both page-view windows are bot-filtered, the referral read is not.
{
  const db = freshDb(), q = [];
  const cx = load(db, q);
  const out = await cx.__run({ AUDIT: d1(db) });
  const pvq = q.filter((s) => !/refererHost/.test(s));
  ok(pvq.length === 2, "two page-view reads (current 30d and prior 30d)");
  ok(pvq.every((s) => /datetime_leq: "[^"]+", bot: 0 \}\)/.test(s)), "each page-view read carries bot: 0 inside its filter object");
  const refq = q.filter((s) => /refererHost/.test(s));
  ok(refq.length === 1 && !/bot: 0/.test(refq[0]), "referral_30d keeps its own (unfiltered) read");
  const pv = db.prepare("SELECT last_value, formula, state FROM metric_registry WHERE metric = 'pageviews_30d'").get();
  ok(pv.last_value === String(30 * 199), "pageviews_30d is the human total (5970), not the crawler-inclusive 6060: " + pv.last_value);
  ok(pv.formula === cx.__k.REGISTRY_PV_FORMULA && /bot: 0/.test(pv.formula), "the registry formula names the Exclude-bots filter");
  ok(pv.state === "MEASURED", "state stays MEASURED");
  const g = db.prepare("SELECT last_value FROM metric_registry WHERE metric = 'impressions_growth_30d'").get().last_value;
  const want = Math.round(1e4 * (30 * 199 - 30 * 160) / (30 * 160)) / 100;
  ok(g === "+" + want.toFixed(2) + "%", "impressions_growth_30d compares filtered with filtered: " + g + " (want +" + want.toFixed(2) + "%)");
  ok(db.prepare("SELECT last_value FROM metric_registry WHERE metric = 'referral_30d'").get().last_value === "40", "referral_30d still excludes own hosts");
  ok(out.refreshed.includes("pageviews_30d") && out.refreshed.includes("impressions_growth_30d"), "the refresh reports both metrics");
}
// 2. Throttle unchanged: a refresh within 55 minutes reads nothing.
{
  const db = freshDb(), q = [];
  db.prepare("UPDATE metric_registry SET last_refreshed = ? WHERE metric = 'pageviews_30d'").run(new Date(Date.now() - 10 * 6e4).toISOString());
  const cx = load(db, q);
  const out = await cx.__run({ AUDIT: d1(db) });
  ok(out.throttled === true && q.length === 0, "a refresh within 55 minutes is throttled and makes no GraphQL read");
}
// 3. An unreadable RUM leaves the row untouched (never a fabricated zero).
{
  const db = freshDb(), q = [];
  const cx = load(db, q);
  cx.__rum = () => null;
  vm.runInContext("roiGf = async function(env, query) { __q.push(query); return null; };", cx);
  const out = await cx.__run({ AUDIT: d1(db) });
  const pv = db.prepare("SELECT last_value, formula FROM metric_registry WHERE metric = 'pageviews_30d'").get();
  ok(pv.last_value === "6060" && pv.formula === "old formula", "an unreadable RUM read leaves pageviews_30d untouched");
  ok(out.skipped.some((s) => /^pageviews_30d: RUM unreadable/.test(s)), "and reports it as skipped");
}
// 4. ASCII-SOURCE-1: the canonical deploy uploads the file as Latin-1.
ok(!/[^\x00-\x7f]/.test(src), "worker.js stays ASCII");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
