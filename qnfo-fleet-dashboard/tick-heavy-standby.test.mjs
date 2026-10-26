// STANDBY-PROOF-2 (qnfo-fleet-dashboard 1.71.2, agent_issues 1000271 FLEET-TICK-HEAVY-SECOND-PRODUCER-1) offline suite.
// The dashboard cron is the second producer of fleet_tick_heavy beside qnfo-code-orchestrator. Its insert was guarded by "no heavy row in the last 9 minutes", which the primary
// (every 10 minutes) always satisfies, so the standby wrote nothing for 12 hours and the second producer was declared but unproven (the issue's own definition of done is a
// cron:qnfo-fleet-dashboard row in 6 hours). feedFallbackTick solved the same shape for fleet_tick with STANDBY-PROOF-1; this is the same rule for the heavy table.
// This suite slices the REAL statement out of worker.js and runs it on node:sqlite. Proves: it writes when the primary is silent; it stays silent while the primary is fresh and the
// dashboard has a row inside 6 hours; it writes once the dashboard's own last row is older than 6 hours even though the primary is fresh; rows of other sources never count as the
// dashboard's own; and the statement is one insert, bound to no parameter, with the primary-silent clause kept.
// Output MUST contain "0 failed" on success.   node qnfo-fleet-dashboard/tick-heavy-standby.test.mjs
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const src = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const mirror = readFileSync(new URL("./deployed-current.worker.js", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };

ok(src === mirror, "deployed-current.worker.js is identical to worker.js");
const ver = (src.match(/^var VERSION = "(\d+)\.(\d+)\.(\d+)/m) || []).slice(1).map(Number);
ok(ver.length === 3 && (ver[0] > 1 || ver[1] > 71 || (ver[1] === 71 && ver[2] >= 2)), "VERSION is at least 1.71.2", ver);

const m = /await env\.AUDIT\.prepare\(("INSERT INTO fleet_tick_heavy \(source\) SELECT [^\n]*?")\)\.run\(\);/.exec(src);
ok(!!m, "the worker carries the fleet_tick_heavy insert in its scheduled handler");
const stmt = m ? JSON.parse(m[1]) : "";
ok(/^INSERT INTO fleet_tick_heavy \(source\) SELECT 'cron:qnfo-fleet-dashboard' WHERE /.test(stmt) && !/\?/.test(stmt) && stmt.split("INSERT").length === 2, "one plain insert, no bound parameter", stmt.slice(0, 120));
ok(stmt.includes("'-9 minutes'") && stmt.includes("'-360 minutes'") && /source LIKE 'cron:qnfo-fleet-dashboard%'/.test(stmt), "it keeps the 9-minute primary-silent clause and adds the 6-hour own-row clause");

function world(rows) {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE fleet_tick_heavy (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), source TEXT NOT NULL)");
  const ago = (min) => new Date(Date.now() - min * 60000).toISOString().slice(0, 19) + "Z";
  for (const [source, min] of rows) db.prepare("INSERT INTO fleet_tick_heavy (ts, source) VALUES (?, ?)").run(ago(min), source);
  return db;
}
const CO = "cron:qnfo-code-orchestrator", DASH = "cron:qnfo-fleet-dashboard";
const run = (rows) => { const db = world(rows); const before = db.prepare("SELECT COUNT(*) n FROM fleet_tick_heavy").get().n; db.exec(stmt); const after = db.prepare("SELECT COUNT(*) n FROM fleet_tick_heavy").get().n; return { wrote: after - before, last: db.prepare("SELECT source FROM fleet_tick_heavy ORDER BY id DESC LIMIT 1").get().source }; };

ok(run([]).wrote === 1, "an empty table: the standby writes");
ok(run([[CO, 30], [DASH, 100]]).wrote === 1 && run([[CO, 30]]).last === DASH, "the primary silent for 30 minutes: the standby writes (the existing failover)");
ok(run([[CO, 3], [DASH, 100]]).wrote === 0, "primary fresh (3 minutes) and the dashboard wrote 100 minutes ago: nothing written");
ok(run([[CO, 3]]).wrote === 1, "primary fresh but the dashboard has no row of its own in 6 hours: the standby proves itself (the defect this file removes)");
ok(run([[CO, 3], [DASH, 400]]).wrote === 1, "primary fresh and the dashboard's own last row is 400 minutes old: writes");
ok(run([[CO, 3], [DASH, 359]]).wrote === 0, "the dashboard's own row 359 minutes old still counts as proof");
ok(run([[CO, 3], ["cron:someone-else", 10]]).wrote === 1, "a row of another source is not the dashboard's own proof");
{
  const db = world([[CO, 3]]);
  db.exec(stmt); db.exec(stmt); db.exec(stmt);
  ok(db.prepare("SELECT COUNT(*) n FROM fleet_tick_heavy WHERE source = ?").get(DASH).n === 1, "three consecutive cron runs write one dashboard row, not three");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
