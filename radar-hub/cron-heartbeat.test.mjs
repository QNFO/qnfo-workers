// radar-hub cron-heartbeat suite (1.4.0, CRON-ONLY-HEARTBEAT-1, agent_issues 2397, charter pillar: autonomy).
// Loads the real worker.js and runs the exported scheduled() handler with a stubbed AUDIT binding backed by node:sqlite.
// Proves: after a finished scheduled run exactly one fleet_heartbeat upsert lands with (radar-hub, VERSION, ISO ts, ok=1);
// ok=0 when the run's work throws (the error still propagates); a failing heartbeat write never throws out of scheduled().
// Run: node radar-hub/cron-heartbeat.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const IMPORT = 'import { WorkflowEntrypoint } from "cloudflare:workers";';
const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
if (!src.startsWith(IMPORT)) throw new Error("worker.js import line changed: update the loader in this test");
const mod = await import("data:text/javascript;base64," + Buffer.from(src.replace(IMPORT, "var WorkflowEntrypoint = class {};")).toString("base64"));
const W = mod.default;
const VERSION = /^var VERSION = "([^"]+)";/m.exec(src)[1];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

function makeEnv(opts) {
  opts = opts || {};
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE fleet_heartbeat (worker TEXT PRIMARY KEY, version TEXT, ts TEXT, ok INTEGER)");
  const calls = [];
  const AUDIT = {
    prepare(sql) {
      calls.push(sql);
      return { bind(...a) { return { async run() { if (opts.failHeartbeat && /fleet_heartbeat/.test(sql)) throw new Error("D1 down"); db.prepare(sql.replace(/\?(\d)/g, "?")).run(...a); return { success: true }; } }; } };
    }
  };
  return { env: { AUDIT }, db, calls };
}
const rows = (db) => db.prepare("SELECT worker, version, ts, ok FROM fleet_heartbeat").all();
const origErr = console.error;
const errs = [];
console.error = (...a) => { errs.push(a.join(" ")); };

// 1. successful hourly tick (03:00Z Wednesday: no CRON_TABLE entry is due, so the run finishes without touching other bindings)
{
  const { env, db } = makeEnv();
  await W.scheduled({ cron: "0 * * * *", scheduledTime: Date.UTC(2026, 9, 14, 3, 0, 0) }, env, { waitUntil() {} });
  const r = rows(db);
  ok(r.length === 1, "one heartbeat row after a successful run, got " + r.length);
  ok(r[0] && r[0].worker === "radar-hub", "worker name is radar-hub");
  ok(r[0] && r[0].version === VERSION, "version is the worker VERSION " + VERSION);
  ok(r[0] && !isNaN(Date.parse(r[0].ts)) && new Date(r[0].ts).toISOString() === r[0].ts && Date.now() - Date.parse(r[0].ts) < 60000, "ts is a fresh ISO timestamp");
  ok(r[0] && r[0].ok === 1, "ok=1 after a successful run");
  await W.scheduled({ cron: "0 * * * *", scheduledTime: Date.UTC(2026, 9, 14, 4, 0, 0) }, env, { waitUntil() {} });
  ok(rows(db).length === 1, "second run upserts the same row (no duplicate)");
}

// 2. the work throws: the work throws on a direct event -> heartbeat ok=0, error still propagates
{
  const { env, db } = makeEnv();
  const base = env.AUDIT;
  env.AUDIT = { prepare(sql) { if (/fleet_heartbeat/.test(sql)) return base.prepare(sql); throw new Error("boom"); } };
  let threw = null;
  // a direct (non-tick) event reaches the work unwrapped: a cron getter that explodes makes the work throw
  const ev = { get cron() { throw new Error("work failed"); }, scheduledTime: Date.UTC(2026, 9, 14, 3, 0, 0) };
  try { await W.scheduled(ev, env, { waitUntil() {} }); } catch (e) { threw = e; }
  ok(threw && /work failed/.test(threw.message), "the work's error still propagates out of scheduled()");
  const r = rows(db);
  ok(r.length === 1 && r[0].ok === 0, "ok=0 when the work throws, got " + JSON.stringify(r));
}

// 3. work handed to ctx.waitUntil is awaited before the heartbeat and counts: the 05:00Z Monday tick runs the events radar, which
// runs through ctx.waitUntil; with every D1 read failing its promise rejects -> ok=0, and the row is still written
{
  const { env, db } = makeEnv();
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("network blocked in test"); };
  const base = env.AUDIT;
  env.AUDIT = { prepare(sql) { if (/fleet_heartbeat/.test(sql)) return base.prepare(sql); throw new Error("boom"); } };
  env.AUDIT_DB = env.AUDIT; env.RADAR_DB = env.AUDIT;
  errs.length = 0;
  let threw = null;
  try { await W.scheduled({ cron: "0 * * * *", scheduledTime: Date.UTC(2026, 9, 12, 5, 0, 0) }, env, { waitUntil() {} }); } catch (e) { threw = e; }
  globalThis.fetch = realFetch;
  const r = rows(db);
  ok(threw === null, "a rejected waitUntil promise does not throw out of scheduled()");
  ok(r.length === 1 && r[0].ok === 0, "ok=0 when the waitUntil work rejected, got " + JSON.stringify(r));
}

// 4. heartbeat write fails: scheduled() does not throw, the failure is logged
{
  const { env, db, calls } = makeEnv({ failHeartbeat: true });
  errs.length = 0;
  let threw = null;
  try { await W.scheduled({ cron: "0 * * * *", scheduledTime: Date.UTC(2026, 9, 14, 3, 0, 0) }, env, { waitUntil() {} }); } catch (e) { threw = e; }
  ok(threw === null, "a failing heartbeat write does not throw out of scheduled()");
  ok(calls.some((s) => /fleet_heartbeat/.test(s)), "the heartbeat write was attempted");
  ok(errs.some((s) => /fleet_heartbeat radar-hub/.test(s) && /D1 down/.test(s)), "the failure is logged with console.error");
  ok(rows(db).length === 0, "no row when the write failed");
}

// 5. source text: upsert is the CRON-ONLY-HEARTBEAT-1 statement on the existing AUDIT binding, written after the work
{
  ok(/INSERT INTO fleet_heartbeat \(worker, version, ts, ok\) VALUES \(\?1, \?2, \?3, \?4\) ON CONFLICT\(worker\) DO UPDATE SET version=excluded\.version, ts=excluded\.ts, ok=excluded\.ok/.test(src), "source has the CRON-ONLY-HEARTBEAT-1 upsert");
  ok(/CRON-ONLY-HEARTBEAT-1/.test(src) && /2397/.test(src), "source names CRON-ONLY-HEARTBEAT-1 and agent_issues 2397");
  ok(/allSettled\(pending\)[\s\S]*finally \{\s*await cronHeartbeat\(env, state\.ok\);/.test(src), "heartbeat runs in finally, after the work and its waitUntil promises");
}

console.error = origErr;
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
