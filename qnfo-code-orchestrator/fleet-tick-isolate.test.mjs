// FLEET-TICK-ISOLATE-1 offline suite (qnfo-code-orchestrator 0.18.30, agent_issues 2600, pillar autonomy).
// Measured 2026-10-19: tick_completion_24h read 90.3 (130 of 144 ten-minute slots) because ONE gap, 2026-10-18 12:14Z to 14:38Z, 144 minutes,
// held every slot of it: the orchestrator logged "UNIQUE constraint failed: index 'idx_agent_issues_open_title_ci'" every two minutes. The
// fleet_tick insert fans out through D1 AFTER INSERT triggers, one of them raised that violation, and the whole insert rolled back, so the
// tick row was never written and every other fixer skipped the slot. qnfo-fleet-dashboard's fallback runs the same insert through the same
// triggers, so it failed in the same way. This suite runs the real feedFleetTick and logTickError sliced from worker.js against the same
// shape in node:sqlite (a unique partial index on open titles, a trigger that violates it, an unrelated fixer). Proves: a healthy tick is
// written once under the old source; a failing trigger still logs fleet-cron-tick-error, then the retry commits an ":isolated" tick, the
// unrelated fixer runs and only the violating statement is skipped; a second failure is logged and never thrown; a tick younger than 9
// minutes is not duplicated; the old plain insert (the control) loses the tick and the unrelated fixer.
// Run: node --no-warnings qnfo-code-orchestrator/fleet-tick-isolate.test.mjs   (exit 0 = all passed)
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const here = path.dirname(fileURLToPath(import.meta.url));
const src = readFileSync(path.join(here, "worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x).slice(0, 300) : "")); } };
const grab = (a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i); return i >= 0 && j > i ? src.slice(i, j) : ""; };
const body = grab("async function feedFleetTick(env) {", "\nasync function logTickError") + "\n" + grab("async function logTickError(env, step, e) {", "\nasync function runTick");
ok(body.indexOf("feedFleetTick") >= 0 && body.indexOf("logTickError") >= 0, "feedFleetTick and logTickError are found in worker.js", body.length);
const lib = new Function(body + "\nreturn { feedFleetTick };")();

const mk = (opts = {}) => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT);
    CREATE UNIQUE INDEX idx_agent_issues_open_title_ci ON agent_issues (lower(title)) WHERE status = 'open';
    CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')), source TEXT);
    CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, status TEXT, text TEXT, job TEXT);
    CREATE TABLE fixer_marks (n INTEGER);
    INSERT INTO agent_issues (title, status) VALUES ('same title', 'open'), ('same title', 'closed');
    CREATE TRIGGER fixer_unrelated AFTER INSERT ON fleet_tick BEGIN INSERT INTO fixer_marks VALUES (1); END;
  `);
  if (!opts.healthy) db.exec(`CREATE TRIGGER fixer_reopen_twin AFTER INSERT ON fleet_tick BEGIN UPDATE agent_issues SET status = 'open' WHERE title = 'same title' AND status = 'closed'; END;`);
  if (opts.broken) db.exec("DROP TABLE fleet_tick");
  const stmt = (sql, args = []) => ({ bind: (...a) => stmt(sql, a), run: async () => { db.prepare(sql).run(...args); return { success: true }; } });
  return { db, env: { AUDIT: { prepare: (sql) => stmt(sql) } } };
};
const ticks = (db) => db.prepare("SELECT source FROM fleet_tick ORDER BY id").all().map((r) => r.source);
const marks = (db) => db.prepare("SELECT COUNT(*) n FROM fixer_marks").get().n;
const errs = (db) => db.prepare("SELECT text FROM cloud_ops_events WHERE kind = 'fleet-cron-tick-error' ORDER BY ts, id").all().map((r) => r.text);
const quiet = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };

{ // healthy fan-out: unchanged behaviour
  const { db, env } = mk({ healthy: true });
  await lib.feedFleetTick(env);
  ok(ticks(db).join() === "cron:qnfo-code-orchestrator" && marks(db) === 1 && errs(db).length === 0, "a healthy tick is written once under the old source with no error", { t: ticks(db), e: errs(db) });
}
{ // the 2026-10-18 shape: one trigger violates the unique index
  const { db, env } = mk();
  await lib.feedFleetTick(env);
  ok(ticks(db).join() === "cron:qnfo-code-orchestrator:isolated", "the failing fan-out still gets a tick row, under the :isolated source", ticks(db));
  ok(marks(db) === 1, "the unrelated fixer ran in the slot (it skipped every slot for 144 minutes before)", marks(db));
  ok(db.prepare("SELECT status FROM agent_issues WHERE id = 2").get().status === "closed", "only the violating statement was skipped: the closed twin stays closed");
  const e = errs(db);
  ok(e.length === 1 && /^fleet_tick: .*UNIQUE constraint failed: index 'idx_agent_issues_open_title_ci'/.test(e[0]), "the first error is still logged as fleet-cron-tick-error", e);
}
{ // a younger tick: no insert, no error
  const { db, env } = mk({ healthy: true });
  await lib.feedFleetTick(env);
  await lib.feedFleetTick(env);
  ok(ticks(db).length === 1 && errs(db).length === 0, "a tick younger than 9 minutes is not duplicated", ticks(db));
}
{ // both attempts fail: two errors, nothing thrown
  const { db, env } = mk({ broken: true });
  let threw = false;
  await quiet(async () => { try { await lib.feedFleetTick(env); } catch (e) { threw = true; } });
  ok(!threw, "a second failure never throws out of the producer");
  ok(db.prepare("SELECT COUNT(*) n FROM cloud_ops_events WHERE kind = 'fleet-cron-tick-error'").get().n === 2, "both failures are logged (fleet_tick and fleet_tick-isolated)");
}
{ // control: the plain insert alone, as before the change
  const { db } = mk();
  let plain = null;
  try { db.prepare("INSERT INTO fleet_tick (source) SELECT 'cron:qnfo-code-orchestrator' WHERE NOT EXISTS (SELECT 1 FROM fleet_tick WHERE ts > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-9 minutes'))").run(); } catch (e) { plain = String(e.message); }
  ok(/UNIQUE constraint failed/.test(plain || "") && ticks(db).length === 0 && marks(db) === 0, "control: the plain insert loses the tick and the unrelated fixer, which is the outage", { plain, t: ticks(db), m: marks(db) });
}
{ const m = /var VERSION = "(\d+)\.(\d+)\.(\d+)/.exec(src); ok(m && Number(m[1]) * 1e6 + Number(m[2]) * 1e3 + Number(m[3]) >= 18030, "VERSION is at least 0.18.30", m && m[0]); }
console.log(fail ? fail + " failed, " + pass + " passed" : pass + " passed, 0 failed");
process.exit(fail ? 1 : 0);
