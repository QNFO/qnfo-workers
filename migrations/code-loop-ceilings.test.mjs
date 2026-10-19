// CODE-LOOP-CEILINGS-TUNABLE-1 offline suite: runs migrations/2026-10-19-code-loop-ceilings.sql on SQLite. Proves both rows are
// written with values inside the worker's bounds, an existing tuned row is kept, re-applying changes nothing, and the Rollback line
// removes exactly the two rows. Run: node migrations/code-loop-ceilings.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-code-loop-ceilings.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')))");
db.exec("INSERT INTO ops_config (key, value) VALUES ('code_loop_daily_calls', '1500')");
db.exec(sql);
const v = (k) => (db.prepare("SELECT value FROM ops_config WHERE key = ?").get(k) || {}).value;
ok(v("code_plan_daily_cap") === "48" && v("code_tick_lanes") === "12", "the plan cap is 48 and the lanes 12", [v("code_plan_daily_cap"), v("code_tick_lanes")]);
ok(+v("code_plan_daily_cap") <= 200 && +v("code_tick_lanes") <= 16, "both values sit inside the worker's bounds");
const snap = JSON.stringify(db.prepare("SELECT key, value, note FROM ops_config ORDER BY key").all());
db.exec(sql);
ok(JSON.stringify(db.prepare("SELECT key, value, note FROM ops_config ORDER BY key").all()) === snap, "re-applying the file changes nothing");
const db2 = new DatabaseSync(":memory:");
db2.exec("CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT DEFAULT (datetime('now')))");
db2.exec("INSERT INTO ops_config (key, value) VALUES ('code_tick_lanes', '6')");
db2.exec(sql);
ok(db2.prepare("SELECT value FROM ops_config WHERE key = 'code_tick_lanes'").get().value === "6", "a value someone already tuned is kept");
const rb = sql.match(/^-- Rollback: (.*)$/m);
ok(!!rb, "the file has a Rollback line");
db.exec(rb[1]);
ok(v("code_plan_daily_cap") === undefined && v("code_tick_lanes") === undefined && v("code_loop_daily_calls") === "1500", "the Rollback line removes exactly the two rows");
console.log(`code-loop-ceilings: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
