// TRIGGER-FLAP-1 offline suite: replays migrations/2026-10-26-persona-close-clean-streak.sql on SQLite.
// Proves: v_persona_recovered_close lists a METRIC-TRIGGER ticket only when the trigger reads not-hit AND its TRIGGER-RECOVERY-1 streak (a 'recovering' ledger row newer than the
// trigger's last non-recovering row) is 60 minutes old; a single clear reading, a streak under 60 minutes, a streak ended by a relapse or a dispatch, a hit, a stale metric, a ticket
// under 2 hours old, a failing active contract and persona_actions = off each keep the ticket open; the evidence keeps its prefix and names the streak start; the columns are the same
// as before; the old definition is saved; a second apply changes nothing; the decision is logged once; the Rollback header restores a view the persona tick can still read.
// Run: node --no-warnings migrations/persona-close-clean-streak.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-persona-close-clean-streak.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x === undefined ? "" : " :: " + JSON.stringify(x).slice(0, 300))); } };
ok(!/[^\x00-\x7F]/.test(sql), "the file is ASCII only (D1-WRITE-ASCII-1)");
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- BACKUP: bak_20261026_persona_close_view$/m.test(sql) && /^-- Rollback: .+$/m.test(sql), "the opt-in, DB, BACKUP and Rollback headers are present");

const d = new DatabaseSync(":memory:");
d.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT, created_at INTEGER);
  CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY, metric_key TEXT, operator TEXT, threshold REAL);
  CREATE TABLE v_metric_trigger_state (id INTEGER PRIMARY KEY, val REAL, hit INTEGER);
  CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_refreshed TEXT);
  CREATE TABLE issue_project_map (issue_id INTEGER PRIMARY KEY, program_code TEXT);
  CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, status TEXT, last_verdict TEXT);
  CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE analytics_action_log (id INTEGER PRIMARY KEY AUTOINCREMENT, trigger_id INTEGER, fired_at TEXT, metric_value REAL, action TEXT, queue_target TEXT, status TEXT, notes TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
// the production definition before this change (from migrations/2026-10-26-management-personas-2.sql)
const oldView = readFileSync(new URL("./2026-10-26-management-personas-2.sql", import.meta.url), "utf8");
const m = /CREATE VIEW IF NOT EXISTS v_persona_recovered_close AS[\s\S]*?<> 'off';/.exec(oldView);
ok(!!m, "the previous definition is found in management-personas-2");
d.exec(m[0].replace("CREATE VIEW IF NOT EXISTS", "CREATE VIEW"));

const hoursAgoMs = (h) => Math.floor(Date.now() / 1000 - h * 3600) * 1000;
const ago = (min) => d.prepare("SELECT datetime('now', ?) AS t").get("-" + min + " minutes").t;
const refreshed = (min) => d.prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?) AS t").get("-" + min + " minutes").t;
let n = 0;
// one trigger per case: id, ticket 1000+id
const mk = (tid, o = {}) => {
  d.prepare("INSERT INTO analytics_metric_triggers (id, metric_key, operator, threshold) VALUES (?, ?, 'gt', 0)").run(tid, "metric_" + tid);
  d.prepare("INSERT INTO v_metric_trigger_state (id, val, hit) VALUES (?, ?, ?)").run(tid, o.hit ? 1 : 0, o.hit ? 1 : 0);
  d.prepare("INSERT INTO metric_registry (metric, last_refreshed) VALUES (?, ?)").run("metric_" + tid, refreshed(o.refreshedMin ?? 5));
  d.prepare("INSERT INTO agent_issues (id, title, status, created_at) VALUES (?, ?, 'open', ?)").run(1000 + tid, "METRIC-TRIGGER-" + tid + "-X: title", hoursAgoMs(o.ageH ?? 5));
  d.prepare("INSERT INTO issue_project_map (issue_id, program_code) VALUES (?, 'QNFO.OPS')").run(1000 + tid);
  n++;
};
const log = (tid, status, min) => d.prepare("INSERT INTO analytics_action_log (trigger_id, fired_at, metric_value, action, queue_target, status) VALUES (?, ?, 0, 'x', 'agent_issues', ?)").run(tid, ago(min), status);

mk(1); log(1, "dispatched", 300); log(1, "recovering", 90);                                   // clean streak 90 min: listed
mk(2);                                                                                       // a single clear reading, no streak row: not listed
mk(3); log(3, "dispatched", 300); log(3, "recovering", 30);                                   // streak of 30 min: not listed
mk(4); log(4, "recovering", 120); log(4, "relapsed", 60); log(4, "recovering", 20);          // the 120-min streak ended by a relapse; the new one is 20 min: not listed
mk(5); log(5, "recovering", 120); log(5, "recovering", 100); log(5, "recovered", 10);        // recovered rows do not end a streak: listed
mk(6, { hit: true }); log(6, "recovering", 90);                                              // hit now: not listed
mk(7, { refreshedMin: 300 }); log(7, "recovering", 90);                                      // metric not refreshed in 120 min: not listed
mk(8, { ageH: 1 }); log(8, "recovering", 90);                                                // ticket under 2 h old: not listed
mk(9); log(9, "recovering", 90); d.prepare("INSERT INTO remediation_contracts (class, issue_id, status, last_verdict) VALUES ('issue-1009', 1009, 'active', 'fail')").run(); // failing contract: not listed
mk(10); log(10, "recovering", 120); log(10, "dispatched", 50);                               // a dispatch (a fresh breach) after the streak: not listed

d.exec(sql);
const rows = d.prepare("SELECT * FROM v_persona_recovered_close ORDER BY issue_id").all();
ok(JSON.stringify(rows.map((r) => r.issue_id)) === JSON.stringify([1001, 1005]), "only the tickets with a clean 60-minute streak are listed", rows.map((r) => r.issue_id));
ok(JSON.stringify(Object.keys(rows[0])) === JSON.stringify(["issue_id", "program_code", "metric_key", "evidence"]), "the columns are unchanged", Object.keys(rows[0]));
ok(/^MANAGEMENT-PERSONAS-2 metric recovered: metric_1 reads 0\.0? \(trigger gt 0\.0? not hit\), refreshed \d{4}-\d\d-\d\dT[^,]+, clear since \d{4}-\d\d-\d\d \d\d:\d\d:\d\d \(60 minutes or more, TRIGGER-FLAP-1\); the trigger re-files and reopens this issue if the metric breaches again$/.test(rows[0].evidence), "the evidence keeps its prefix and names the streak start", rows[0].evidence);
ok(/clear since \d{4}-\d\d-\d\d \d\d:\d\d:\d\d \(/.test(rows[1].evidence) && rows[1].evidence.indexOf(ago(120).slice(0, 15)) > 0, "a recovered row does not move the streak start (ticket 5 starts at its first recovering row)", rows[1].evidence);
ok(rows[0].program_code === "QNFO.OPS", "the program mapping is kept");
d.prepare("INSERT OR REPLACE INTO ops_config (key, value) VALUES ('persona_actions', 'off')").run();
ok(d.prepare("SELECT COUNT(*) AS n FROM v_persona_recovered_close").get().n === 0, "persona_actions = off lists nothing");
d.prepare("DELETE FROM ops_config").run();

// the old view is saved, the decision is logged once, a second apply changes nothing
const bak = d.prepare("SELECT sql FROM bak_20261026_persona_close_view").all();
ok(bak.length === 1 && /v.hit = 0 AND v.val IS NOT NULL/.test(bak[0].sql) && !/recovering/.test(bak[0].sql), "the previous definition is saved in the backup table", bak.length);
const before = JSON.stringify(d.prepare("SELECT * FROM v_persona_recovered_close").all()), dec = d.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE action LIKE 'TRIGGER-FLAP-1:%'").get().n;
d.exec(sql);
ok(JSON.stringify(d.prepare("SELECT * FROM v_persona_recovered_close").all()) === before && d.prepare("SELECT COUNT(*) AS n FROM decision_log WHERE action LIKE 'TRIGGER-FLAP-1:%'").get().n === 1 && dec === 1, "a second apply changes nothing and logs one decision");
ok(d.prepare("SELECT COUNT(*) AS n FROM bak_20261026_persona_close_view").get().n === 1, "the backup keeps the old definition after a second apply");
// the rollback restores a view that lists a single-reading ticket again
d.exec("DROP VIEW IF EXISTS v_persona_recovered_close");
d.exec(m[0].replace("CREATE VIEW IF NOT EXISTS", "CREATE VIEW"));
ok(d.prepare("SELECT issue_id FROM v_persona_recovered_close WHERE issue_id = 1002").get() !== undefined, "after the Rollback the single-reading ticket is listed again");
console.log("persona-close-clean-streak: " + pass + " passed, " + fail + " failed (" + n + " cases)");
process.exit(fail ? 1 : 0);
