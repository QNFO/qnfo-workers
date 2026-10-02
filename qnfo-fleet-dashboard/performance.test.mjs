// ENGAGED-HUMAN-SESSIONS-1 offline suite (PERFORMANCE-LOOP-1, qnfo-fleet-dashboard 1.17.4; STRATEGY s6.3 and s9).
// Replays the engaged_human_sessions_28d reader from worker.js, with the reach ingest's own query and group helpers, against
// an in-memory SQLite D1 carrying the live metric_registry guards and a scripted Cloudflare GraphQL. Proves: the query is the
// bot-filtered RUM read by date over 28 days; 26 or more days with data is measured as the page-view total; a failed read, a
// response at the group limit, or fewer than 26 days is UNMEASURED with an 'n/a' text that carries no digit (never 0, never a
// number a reader could parse); the registry row is created once with a canonical cadence and updated in place; the
// refresh in refreshRegistryMetrics reports it.
// Run: node qnfo-fleet-dashboard/performance.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const a = src.indexOf("// ---- ENGAGED-HUMAN-SESSIONS-1:BEGIN"), b = src.indexOf("// ---- ENGAGED-HUMAN-SESSIONS-1:END ----");
if (a < 0 || b < a) throw new Error("ENGAGED-HUMAN-SESSIONS-1 block not found in worker.js");
// the real helpers the reader calls (top-level functions in worker.js)
function fnSrc(name) {
  const i = src.indexOf("function " + name + "(");
  if (i < 0) throw new Error(name + " not found");
  const j = src.indexOf("\n}\n", i);
  return src.slice(i, j + 3);
}
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TRIGGER metric_registry_source_required_ins BEFORE INSERT ON metric_registry FOR EACH ROW WHEN NEW.source_of_truth IS NULL OR trim(NEW.source_of_truth)='' OR NEW.disposition_actor IS NULL OR trim(NEW.disposition_actor)='' OR NEW.refresh_cadence IS NULL OR trim(NEW.refresh_cadence)='' BEGIN SELECT RAISE(ABORT,'METRIC-INTEGRITY-1'); END;
CREATE TRIGGER metric_registry_cadence_canonical_ins BEFORE INSERT ON metric_registry FOR EACH ROW WHEN NEW.refresh_cadence IS NOT NULL AND trim(NEW.refresh_cadence) <> '' AND ( instr(trim(NEW.refresh_cadence),' ') > 0 OR NOT ( lower(trim(NEW.refresh_cadence)) IN ('hourly','daily','weekly','monthly') OR trim(NEW.refresh_cadence) GLOB '*/[0-9]*' OR trim(NEW.refresh_cadence) GLOB '[0-9]*m' OR trim(NEW.refresh_cadence) GLOB '[0-9]*h' ) ) BEGIN SELECT RAISE(ABORT,'METRIC-CADENCE-CANONICAL-1'); END;`);
function stmtOn(sql) {
  let args = [];
  const self = {
    bind(...x) { args = x.map((v) => (v === undefined ? null : v)); return self; },
    async all() { return { results: db.prepare(sql).all(...args) }; },
    async first() { return db.prepare(sql).get(...args) || null; },
    async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
  };
  return self;
}
const env = { AUDIT: { prepare: (sql) => stmtOn(sql) } };
// scripted GraphQL: the reader goes through reachGf, which returns { data, err }
let reply = null, queries = [];
const cx = vm.createContext({ console, Date, JSON, Math, Number, String, Object, isNaN, isFinite, Array });
vm.runInContext("var DAY_MS = 864e5; var ACCOUNT = 'acct'; var REACH_RUM_LIMIT = 1e4;\n" +
  "async function reachGf(env, query) { __q.push(query); return __reply(); }\n" +
  fnSrc("reachRumQuery") + fnSrc("reachRumGroups") + src.slice(a, b) +
  "\n;this.__api = { refreshEngagedHumanSessions, engagedTally, engagedNa, ENGAGED_MIN_DAYS, ENGAGED_DAYS };", Object.assign(cx, { __q: queries, __reply: () => reply }));
const api = cx.__api;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };
const NOW = Date.parse("2026-10-06T08:00:00Z");
const groups = (days, perDay) => Array.from({ length: days }, (_, k) => ({ count: perDay, dimensions: { date: new Date(NOW - k * 864e5).toISOString().slice(0, 10) } }));
const data = (g) => ({ data: { viewer: { accounts: [{ rumPageloadEventsAdaptiveGroups: g }] } }, err: null });
const row = () => db.prepare("SELECT last_value v, state, refresh_cadence c, target FROM metric_registry WHERE metric = 'engaged_human_sessions_28d'").get();

reply = data(groups(28, 100));
let r = await api.refreshEngagedHumanSessions(env, NOW);
ok(r.value === 2800 && r.days === 28, "28 days with data: the bot-filtered page-view total (" + r.value + ")");
ok(/bot: 0/.test(queries[0]) && /dimensions \{ date \}/.test(queries[0]), "the query is the Exclude-bots RUM read by date");
const geq = (queries[0].match(/datetime_geq: "([^"]+)"/) || [])[1];
ok(geq && Math.abs(Date.parse(geq) - (NOW - 28 * 864e5)) < 1000, "over the last 28 days");
let x = row();
ok(x && x.v === "2800" && x.state === "MEASURED" && x.c === "hourly" && /^maximize/.test(x.target), "the registry row is created with a canonical cadence and a 'maximize' target, and measured");

reply = data(groups(26, 10));
r = await api.refreshEngagedHumanSessions(env, NOW);
ok(r.value === 260, "26 days with data is enough");
reply = data(groups(25, 10));
r = await api.refreshEngagedHumanSessions(env, NOW);
x = row();
ok(r.value === null && x.state === "UNMEASURED" && /^n\/a: /.test(x.v) && !/\d/.test(x.v), "25 days: UNMEASURED, a digit-free n/a text, not 0 (" + x.v + ")");
ok(/25 of 28/.test(r.why), "the returned reason keeps the numbers for the refresh log");

reply = { data: null, err: "graphql http 400: unknown field bot" };
r = await api.refreshEngagedHumanSessions(env, NOW);
x = row();
ok(r.value === null && /read failed/.test(x.v) && !/\d/.test(x.v), "a rejected query is UNMEASURED with its reason");
reply = data(Array.from({ length: 1e4 }, () => ({ count: 1, dimensions: { date: "2026-10-01" } })));
r = await api.refreshEngagedHumanSessions(env, NOW);
ok(r.value === null && /group limit/.test(r.why), "a response at the group limit is a lower bound, so UNMEASURED");
reply = data(groups(28, 0).concat(groups(27, 5)));
r = await api.refreshEngagedHumanSessions(env, NOW);
ok(r.value === 135 && r.days === 27, "days with no page views do not count as covered");
ok(db.prepare("SELECT COUNT(*) n FROM metric_registry").get().n === 1, "one registry row, updated in place");
// refreshRegistryMetrics calls the reader and reports it
const rr = src.slice(src.indexOf("async function refreshRegistryMetrics(env) {"), src.indexOf("async function persistRoiSnapshot(env) {"));
ok(/await refreshEngagedHumanSessions\(env, Date\.now\(\)\)/.test(rr) && /engaged_human_sessions_28d/.test(rr), "refreshRegistryMetrics runs the reader hourly with the other RUM metrics");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
