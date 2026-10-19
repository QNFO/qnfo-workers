// RUM-ZERO-DAY-1 part C+D offline suite (issue 100171, qnfo-fleet-dashboard 1.51.13): the reach scorecard window reads one source per day
// and leaves the owner's own hosts out of its top pages. Slices reachLatestAgg..reachWindow (and the REACH_PV_* / REACH_TOP_PAGES_SQL constants)
// out of worker.js and runs them against an in-memory SQLite D1 (node:sqlite) with no network.
// Proves: a day's pageviews are its cf-rum-human site row, else its cf-rum row (human rows begin 2026-10-06); a stored 0 with a same-source referrer
// row above 0 is skipped (the day falls back to the other source, or is left out of the days count); the 7- and 28-day sums and day counts match
// what was computed by hand from the fixtures; the old cf-rum-only query reads lower on the same fixtures (the 2026-10-19 defect: 5,815 against 7,331);
// top pages never list fleet.qnfo.org, ideas.qnfo.org or a workers.dev host, count a day from one source only (no double counting where both exist),
// fall back to cf-rum on days with no human site row and on a day whose human row is a false zero; the old top-pages query listed the dashboard first.
// Run: node qnfo-fleet-dashboard/rum-zero-day.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const a = src.indexOf("async function reachLatestAgg(env, source, from, to) {");
const b = src.indexOf("// DASHBOARD-COST-FEED-1", a);
if (a < 0 || b < a || src.indexOf("var REACH_PV_SQL = ", a) < 0 || src.indexOf("async function reachWindow(env, from, to) {", a) < 0) throw new Error("reachWindow block not found in worker.js");
const h1 = src.indexOf("function reachErr(e) {"), h2 = src.indexOf("function reachShiftDay", h1);
if (h1 < 0 || h2 < h1) throw new Error("reachErr not found");

const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE reach_signals (date TEXT NOT NULL, source TEXT NOT NULL, channel TEXT NOT NULL DEFAULT 'web', entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, metric TEXT NOT NULL, value REAL, quality TEXT, PRIMARY KEY (date, source, channel, entity_type, entity_id, metric));");
const stmtOn = (sql) => { let args = []; const self = { bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return self; }, async all() { return { results: db.prepare(sql).all(...args) }; } }; return self; };
const env = { AUDIT: { prepare: stmtOn } };
const cx = vm.createContext({ console });
vm.runInContext("var VERSION = 'test'; function d1all(db, sql, params) { let ps = db.prepare(sql); if (params && params.length) ps = ps.bind.apply(ps, params); return ps.all().then(function(r) { return r.results || []; }); }\n" +
  src.slice(h1, h2) + "\n" + src.slice(a, b) + "\n;this.__api = { reachWindow, REACH_PV_SQL, REACH_TOP_PAGES_SQL };", cx);
const api = cx.__api;
let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (extra !== undefined ? " :: " + JSON.stringify(extra) : "")); } };

const day = (n) => new Date(Date.UTC(2026, 8, 21 + n)).toISOString().slice(0, 10); // 0 = 2026-09-21 .. 27 = 2026-10-18
const put = (date, source, type, id, metric, value) => db.prepare("INSERT INTO reach_signals (date, source, entity_type, entity_id, metric, value) VALUES (?, ?, ?, ?, ?, ?)").run(date, source, type, id, metric, value);
const HUMAN_FROM = "2026-10-06", FALSE_HUMAN = "2026-10-10", FALSE_RUM = "2026-09-22", FALSE_RUM_HUMAN_DAY = "2026-10-13";
for (let i = 0; i < 28; i++) {
  const d = day(i), human = d >= HUMAN_FROM;
  put(d, "cf-rum", "site", "(all)", "pageviews", d === FALSE_RUM || d === FALSE_RUM_HUMAN_DAY ? 0 : human ? 90 : 100);
  if (d === FALSE_RUM) put(d, "cf-rum", "referrer", "news.example", "pageviews", 25);
  if (d === FALSE_RUM_HUMAN_DAY) put(d, "cf-rum", "referrer", "news.example", "pageviews", 40);
  if (human) {
    put(d, "cf-rum-human", "site", "(all)", "pageviews", d === FALSE_HUMAN ? 0 : 110);
    if (d === FALSE_HUMAN) put(d, "cf-rum-human", "referrer", "news.example", "pageviews", 30);
    if (d !== FALSE_HUMAN) {
      put(d, "cf-rum-human", "page", "papers.qnfo.org/papers", "pageviews", 50);
      put(d, "cf-rum-human", "paper", "slug-a", "pageviews", 30);
      put(d, "cf-rum-human", "page", "fleet.qnfo.org/content", "pageviews", 80);
      put(d, "cf-rum-human", "page", "ideas.qnfo.org/ideas", "pageviews", 60);
      put(d, "cf-rum-human", "page", "x.workers.dev/y", "pageviews", 70);
    }
  }
  put(d, "cf-rum", "page", "papers.qnfo.org/papers", "pageviews", 45);
  put(d, "cf-rum", "paper", "slug-a", "pageviews", 25);
  put(d, "cf-rum", "page", "fleet.qnfo.org/content", "pageviews", 85);
  put(d, "cf-rum", "page", "(other)", "pageviews", 999);
}

const d7 = await api.reachWindow(env, "2026-10-12", "2026-10-18");
const d28 = await api.reachWindow(env, "2026-09-21", "2026-10-18");
// d7: seven human days at 110 (10-13's cf-rum zero is never read: the human row exists). d28: 14 cf-rum days at 100 (09-22 is a false zero with
// referrers and no human row, so it is left out), 12 human days at 110, and 10-10 (a human false zero) falls back to its cf-rum 90.
ok(d7.pageviews && d7.pageviews.value === 770 && d7.pageviews.days === 7, "7 days: seven human rows of 110", d7.pageviews);
ok(d28.pageviews && d28.pageviews.value === 2810 && d28.pageviews.days === 27, "28 days: 14x100 cf-rum + 12x110 human + the 10-10 fallback 90, the 09-22 false zero left out (27 days)", d28.pageviews);
const old = (from, to) => db.prepare("SELECT COUNT(DISTINCT date) AS days, SUM(value) AS v FROM reach_signals WHERE source = 'cf-rum' AND entity_type = 'site' AND metric = 'pageviews' AND date >= ? AND date <= ?").get(from, to);
ok(old("2026-10-12", "2026-10-18").v === 540 && old("2026-10-12", "2026-10-18").v < d7.pageviews.value, "the old cf-rum-only read is lower on the same fixtures (cf-rum 90 and a stored zero against the human 110)", old("2026-10-12", "2026-10-18"));
ok(d28.errors === undefined || !d28.errors.some((e) => /reach_signals/.test(String(e))), "no reach_signals error in the window", d28.errors);

const ids = (w) => w.top_pages.map((r) => r.id);
ok(ids(d7).join() === "papers.qnfo.org/papers,slug-a" && d7.top_pages[0].v === 350 && d7.top_pages[1].v === 210, "7 days: only the two public entries, human rows only (7x50, 7x30), (other) and the owner hosts left out", d7.top_pages);
ok(ids(d28).join() === "papers.qnfo.org/papers,slug-a" && d28.top_pages[0].v === 12 * 50 + 16 * 45 && d28.top_pages[1].v === 12 * 30 + 16 * 25, "28 days: human rows on 12 days plus cf-rum rows on 15 pre-human days and the 10-10 false-zero day, no day counted from both", d28.top_pages);
ok(![d7, d28].some((w) => w.top_pages.some((r) => /fleet\.qnfo\.org|ideas\.qnfo\.org|workers\.dev/.test(r.id))), "no owner host in any top-pages list");
const oldTop = db.prepare("SELECT entity_id AS id, SUM(value) AS v FROM reach_signals WHERE source = 'cf-rum' AND entity_type IN ('paper','page') AND metric = 'pageviews' AND entity_id != '(other)' AND date >= '2026-10-12' AND date <= '2026-10-18' GROUP BY entity_id ORDER BY v DESC LIMIT 5").all();
ok(oldTop[0].id === "fleet.qnfo.org/content", "the old top-pages read listed the owner's dashboard first on the same fixtures", oldTop);

// The bound parameters: four for the top-pages statement, two for the sums (D1 numbered parameters).
ok((api.REACH_TOP_PAGES_SQL.match(/\?\d/g) || []).join() === "?1,?2,?3,?4" && (api.REACH_PV_SQL.match(/\?\d/g) || []).join() === "?1,?2", "numbered parameters match the bound arrays", [api.REACH_TOP_PAGES_SQL.match(/\?\d/g), api.REACH_PV_SQL.match(/\?\d/g)]);
ok(!/LIKE '[^']{50,}'/.test(api.REACH_TOP_PAGES_SQL), "no LIKE literal reaches D1's 50 byte limit");
const mirror = readFileSync(join(here, "deployed-current.worker.js"), "utf8");
ok(mirror === src, "deployed-current.worker.js is identical to worker.js");
const v = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src);
ok(v && (Number(v[2]) > 51 || (Number(v[2]) === 51 && Number(v[3]) >= 13)), "VERSION is at least 1.51.13", v && v[0]);

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
