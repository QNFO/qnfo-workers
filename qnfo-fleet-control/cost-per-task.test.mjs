// COST-PER-TASK-WINDOW-1 offline suite (qnfo-fleet-control 0.4.98, pillar cost). Replays refreshOwnedMetrics' cost step
// from worker.js against an in-memory SQLite D1 seeded with the live qnfo-audit ledgers of 2026-10-02 (model_ladder_budget
// with its tier-0 September seed of $188.10, model_ladder_daily, ops_ai_log). Proves: the old month-granularity query read
// 0.1379 because it summed the tier-0 seed and whole calendar months; the fixed query reads the daily ladder ledger over the
// same 30 days as the task count (about 0.0023); spend older than 30 days does not count; no ledger row or no successful
// call leaves the row untouched and says why (never a fabricated value); the registry formula and source say what is read.
// Run: node qnfo-fleet-control/cost-per-task.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, "worker.js"), "utf8");
const a = src.indexOf("// ---- COST-PER-TASK-WINDOW-1:BEGIN"), b = src.indexOf("// ---- COST-PER-TASK-WINDOW-1:END");
const f0 = src.indexOf("async function refreshOwnedMetrics(env) {"), f1 = src.indexOf("__name(refreshOwnedMetrics");
if (a < 0 || b < a || f0 < 0 || f1 < f0) throw new Error("COST-PER-TASK-WINDOW-1 source not found in worker.js");

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log("FAIL " + m); } };

function freshDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, formula TEXT, source_of_truth TEXT, last_value TEXT, last_refreshed TEXT, state TEXT);
INSERT INTO metric_registry (metric, formula, source_of_truth, last_value, state) VALUES ('cost_per_successful_task_by_class', 'old', 'old', '0.1379', 'OK');
CREATE TABLE model_ladder_budget (tier INTEGER, month TEXT, spent_usd REAL, blocked INTEGER DEFAULT 0, PRIMARY KEY (tier, month));
CREATE TABLE model_ladder_daily (tier INTEGER, day TEXT, spent_usd REAL DEFAULT 0, calls INTEGER DEFAULT 0, PRIMARY KEY (tier, day));
CREATE TABLE ops_ai_log (id INTEGER PRIMARY KEY, ts TEXT, ok INTEGER);`);
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
// The live ledgers on 2026-10-02 (qnfo-audit): model_ladder_budget 2026-09 tiers 0..3 and 2026-10 tiers 1..2; the daily
// ledger has the same tier 1..3 spend spread over the last days and no tier-0 row; 1387 successful ops calls in 30 days.
function seedLive(db) {
  const prevMonth = db.prepare("SELECT strftime('%Y-%m', 'now', '-20 day') AS m").get().m;
  const thisMonth = db.prepare("SELECT strftime('%Y-%m', 'now') AS m").get().m;
  const ins = db.prepare("INSERT INTO model_ladder_budget (tier, month, spent_usd) VALUES (?, ?, ?)");
  [[0, prevMonth, 188.1], [1, prevMonth, 1.3294], [2, prevMonth, 1.7166], [3, prevMonth, 0.0204]].forEach((r) => ins.run(...r));
  if (thisMonth !== prevMonth) [[1, thisMonth, 0.0003], [2, thisMonth, 0.062]].forEach((r) => ins.run(...r));
  const day = db.prepare("INSERT INTO model_ladder_daily (tier, day, spent_usd, calls) VALUES (?, date('now', ?), ?, 1)");
  [[1, "-5 day", 1.3294], [2, "-4 day", 1.7166], [3, "-3 day", 0.0204], [1, "-1 day", 0.0003], [2, "-0 day", 0.062]].forEach((r) => day.run(...r));
  const log = db.prepare("INSERT INTO ops_ai_log (ts, ok) VALUES (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?), ?)");
  db.exec("BEGIN");
  for (let i = 0; i < 1387; i++) log.run("-" + (1 + (i % 10)) + " day", 1);
  for (let i = 0; i < 86; i++) log.run("-2 day", 0);
  db.exec("COMMIT");
}
function load() {
  const cx = vm.createContext({ console, Date, JSON, Math, Number, String, Object, Array, isFinite, isNaN });
  vm.runInContext(src.slice(a, b) + src.slice(f0, f1) + "\nthis.__run = refreshOwnedMetrics; this.__k = { costPerSuccessfulTask, COST_PER_TASK_SPENT_SQL, COST_PER_TASK_FORMULA };", cx);
  return cx;
}
const reg = (db) => db.prepare("SELECT * FROM metric_registry WHERE metric = 'cost_per_successful_task_by_class'").get();

// 1. The live replay: the old query reproduces the defect, the new one reads the ladder's own 30-day spend.
{
  const db = freshDb();
  seedLive(db);
  const old = db.prepare("SELECT SUM(spent_usd) AS s FROM model_ladder_budget WHERE month >= strftime('%Y-%m', 'now', '-30 day')").get().s;
  ok(old > 188 && (old / 1387).toFixed(4) >= "0.1378", "the old month-granularity query includes the $188.10 tier-0 seed (ratio " + (old / 1387).toFixed(4) + ")");
  const cx = load();
  const out = await cx.__run({ AUDIT: d1(db) });
  const r = reg(db);
  ok(r.last_value === (3.1287 / 1387).toFixed(4), "the fixed ratio is ladder spend / successful calls over 30 days: " + r.last_value);
  ok(Number(r.last_value) < 0.05, "and is inside the 0.05 target the old reading breached");
  ok(r.formula === cx.__k.COST_PER_TASK_FORMULA && /model_ladder_daily/.test(r.formula) && /unified_cost_usd_30d/.test(r.formula), "the registry formula names the daily ledger and where account-wide spend is measured");
  ok(/model_ladder_daily/.test(r.source_of_truth) && /1387 successful calls/.test(r.source_of_truth), "source_of_truth records what was read");
  ok(r.state === "MEASURED" && !!r.last_refreshed, "state and last_refreshed are written");
  ok(out.written.some((w) => w.indexOf("cost_per_successful_task_by_class=") === 0), "the refresh reports the write");
  ok(out.skipped.drift_total === "no CF_API_TOKEN", "without a token the step returns before the CF API reads, as before");
}
// 2. The 30-day window is one window: spend and calls older than 30 days do not count.
{
  const db = freshDb();
  db.exec("INSERT INTO model_ladder_daily (tier, day, spent_usd) VALUES (2, date('now', '-45 day'), 50), (2, date('now', '-2 day'), 0.5)");
  db.exec("INSERT INTO ops_ai_log (ts, ok) VALUES (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-40 day'), 1), (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day'), 1), (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day'), 1)");
  await load().__run({ AUDIT: d1(db) });
  ok(reg(db).last_value === "0.2500", "only in-window spend over in-window calls: 0.50 / 2 = 0.2500, got " + reg(db).last_value);
}
// 3. No value is invented.
{
  const db = freshDb();
  db.exec("INSERT INTO ops_ai_log (ts, ok) VALUES (strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-1 day'), 1)");
  const out = await load().__run({ AUDIT: d1(db) });
  ok(reg(db).last_value === "0.1379" && reg(db).formula === "old", "no daily ledger row in 30 days leaves the row untouched");
  ok(/no row in 30d/.test(out.skipped.cost_per_successful_task_by_class || ""), "and says why");
}
{
  const db = freshDb();
  db.exec("INSERT INTO model_ladder_daily (tier, day, spent_usd) VALUES (2, date('now', '-2 day'), 0.5)");
  const out = await load().__run({ AUDIT: d1(db) });
  ok(reg(db).last_value === "0.1379", "0 successful calls leaves the row untouched");
  ok(out.skipped.cost_per_successful_task_by_class === "0 successful ops calls in 30d", "and says why");
}
// 4. The pure helper.
{
  const { costPerSuccessfulTask: f } = load().__k;
  ok(f(3.1287, 1387).value === "0.0023" && f(0, 10).value === "0.0000", "a measured spend divides by the call count, a zero spend reads 0");
  ok(f(null, 10).value === null && f(NaN, 10).value === null && f(1, 0).value === null, "null, NaN and zero calls are unmeasured");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
