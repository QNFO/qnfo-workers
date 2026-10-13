// personal-api cron-heartbeat suite (4.9.0, CRON-ONLY-HEARTBEAT-1, charter pillar: autonomy, agent_issues 2397).
// Loads the real worker.js and drives scheduled() against in-memory SQLite stand-ins for personal-life (PERSONAL) and
// qnfo-audit (AUDIT). Proves: one fleet_heartbeat upsert (worker, VERSION, ISO ts, ok=1) after a finished run, ok=0 when
// the brief step fails, and a failing heartbeat write never throws out of scheduled().
// Run: node personal-api/cron-heartbeat.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mod = await import("data:text/javascript;base64," + Buffer.from(src).toString("base64"));
const W = mod.default;
const VERSION = /var VERSION = "([^"]*)"/.exec(src)[1];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

const wrap = (d, opts) => ({
  prepare(sql) {
    if (opts && opts.failAll) throw new Error("db down");
    if (opts && opts.failHeartbeat && /fleet_heartbeat/.test(sql)) throw new Error("audit down");
    if (opts && opts.calls) opts.calls.push(sql);
    let args = [];
    const s = {
      bind(...x) { args = x.map((v) => (v === undefined ? null : v)); if (opts && opts.binds && /fleet_heartbeat/.test(sql)) opts.binds.push(args); return s; },
      async all() { return { results: d.prepare(sql).all(...args) }; },
      async first() { return d.prepare(sql).get(...args) || null; },
      async run() { const r = d.prepare(sql).run(...args); return { success: true, meta: { changes: Number(r.changes) } }; }
    };
    return s;
  }
});
function makeEnv(po, ao) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE events (id TEXT PRIMARY KEY, category TEXT, title TEXT, venue TEXT, city TEXT, country TEXT, start_date TEXT, end_date TEXT, energy INTEGER, energy_label TEXT)");
  db.exec("CREATE TABLE daily_briefs (date TEXT PRIMARY KEY, payload TEXT, built_at TEXT)");
  const audit = new DatabaseSync(":memory:");
  audit.exec("CREATE TABLE fleet_heartbeat (worker TEXT PRIMARY KEY, version TEXT, ts TEXT, ok INTEGER)");
  const CAL_API = { async fetch() { return new Response(JSON.stringify({ events: [] }), { status: 200 }); } };
  const binds = [];
  const env = { PERSONAL: wrap(db, po || {}), AUDIT: wrap(audit, Object.assign({ binds }, ao || {})), CAL_API, CAL_TOKEN: "c", API_KEY: "k" };
  return { env, audit, binds };
}
globalThis.fetch = async () => new Response("{}", { status: 200 });
const quiet = console.log, qerr = console.error;
const errs = [];
console.log = () => {};
console.error = (...a) => errs.push(a.join(" "));
const run = (T) => W.scheduled({}, T.env, { waitUntil() {} });
const rows = (T) => T.audit.prepare("SELECT worker, version, ts, ok FROM fleet_heartbeat").all();

// 1. finished run: one upsert, ok=1
let T = makeEnv();
await run(T);
ok(T.binds.length === 1, "exactly one heartbeat write per run (" + T.binds.length + ")");
let r = rows(T);
ok(r.length === 1 && r[0].worker === "personal-api" && r[0].version === VERSION && r[0].ok === 1, "row is (personal-api, VERSION, ts, 1): " + JSON.stringify(r));
ok(r[0] && !isNaN(Date.parse(r[0].ts)) && new Date(r[0].ts).toISOString() === r[0].ts, "ts is an ISO string");
await run(T);
ok(rows(T).length === 1 && T.binds.length === 2, "a second run upserts the same row");

// 2. the work fails: ok=0, the row is still written
T = makeEnv({ failAll: true });
await run(T);
r = rows(T);
ok(r.length === 1 && r[0].ok === 0, "ok=0 when the scheduled work fails: " + JSON.stringify(r));

// 3. the heartbeat write fails: scheduled() still resolves, the error is logged
T = makeEnv({}, { failHeartbeat: true });
let threw = false;
try { await run(T); } catch (e) { threw = true; }
ok(!threw, "a failing heartbeat write does not throw out of scheduled()");
ok(errs.some((e) => /fleet-heartbeat-failed/.test(e)), "the failure is logged with console.error");

console.log = quiet; console.error = qerr;
// source shape: the write is last in scheduled(), after cronBuildBrief, in a finally
const sched = src.slice(src.indexOf("async scheduled(event, env, ctx)"), src.indexOf("TWIN-MCP-1 (2026-10-02)"));
ok(sched.indexOf("cronBuildBrief(env)") > 0 && sched.indexOf("cronBuildBrief(env)") < sched.indexOf("INSERT INTO fleet_heartbeat"), "the heartbeat write follows the brief step");
ok(/finally\s*\{\s*try\s*\{\s*await env\.AUDIT/.test(sched), "the write sits in a finally with its own try/catch");
ok(/^\d+\.(\d+)\.\d+/.test(VERSION) && Number(VERSION.split(".")[1]) >= 9, "VERSION minor is at least 9: " + VERSION);
console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
