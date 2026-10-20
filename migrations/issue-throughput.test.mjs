// ISSUE-THROUGHPUT-1 offline suite: replays migrations/2026-10-20-issue-throughput.sql on SQLite.
// Proves: v_issue_family_throughput folds the family from the title (METRIC-TRIGGER-<n>-..., "RESEARCH-TERMINAL <hash>: ...", "LOOP-BREAKER-1: ..."), counts the issues opened and closed in the last 24 h,
// the open ones, the net inflow and the drain ratio, and the age of the oldest open one; a family that drains reads net 0 or below; a closed issue older than 24 h counts nowhere; the directive row parses;
// a second apply changes nothing; the Rollback line drops the view and the row.
// Run: node migrations/issue-throughput.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-20-issue-throughput.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
const d = new DatabaseSync(":memory:");
d.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
  CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT);
  CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
const H = 3600000, now = Date.now();
let id = 0;
const add = (title, status, openedAgoH, updatedAgoH) => d.prepare("INSERT INTO agent_issues VALUES (?, ?, ?, ?, ?)").run(++id, title, status, now - openedAgoH * H, now - (updatedAgoH === undefined ? openedAgoH : updatedAgoH) * H);
// RESEARCH-TERMINAL: 2 opened in 24 h (the third was opened 30 h ago), 1 closed in 24 h, 2 open
add("RESEARCH-TERMINAL aaaa1111: revise: no applicable edit", "open", 5);
add("RESEARCH-TERMINAL bbbb2222: review: 6 HARD findings", "open", 30);
add("RESEARCH-TERMINAL cccc3333: revise: x", "closed", 3, 1);
// METRIC-TRIGGER-<n>-NAME folds to one family: 2 opened, 3 closed in 24 h, 1 open
add("METRIC-TRIGGER-357-WATCHMAKER-INDEX: Autonomy gap", "open", 2);
add("METRIC-TRIGGER-410-ISSUE-MTTR-H-30D: Autonomy gap", "closed", 2, 1);
add("METRIC-TRIGGER-1959-ISSUES-WITHOUT-NEXT-ACTION: x", "closed", 60, 2);
add("METRIC-TRIGGER-2934-SESSION-DEPENDENT: x", "closed", 70, 3);
// LOOP-BREAKER-1: closed long ago counts nowhere
add("LOOP-BREAKER-1: qnfo-ops: sig", "closed", 100, 80);
// a title with no space or colon
add("ONEWORD", "open", 1);
d.exec(sql);
const rows = Object.fromEntries(d.prepare("SELECT * FROM v_issue_family_throughput").all().map((r) => [r.family, r]));
const rt = rows["RESEARCH-TERMINAL"], mt = rows["METRIC-TRIGGER"];
ok(rt && rt.opened_24h === 2 && rt.closed_24h === 1 && rt.open_now === 2 && rt.net_inflow_24h === 1 && rt.drain_ratio_24h === 0.5 && rt.oldest_open_h === 30, "RESEARCH-TERMINAL: opened 2, closed 1, net inflow 1, drain 0.5, oldest open 30 h", rt);
ok(mt && mt.opened_24h === 2 && mt.closed_24h === 3 && mt.open_now === 1 && mt.net_inflow_24h === -1 && mt.drain_ratio_24h === 1.5, "METRIC-TRIGGER-<n> folds to one family that drains (net -1, ratio 1.5)", mt);
ok(!("LOOP-BREAKER-1" in rows) || (rows["LOOP-BREAKER-1"].opened_24h === 0 && rows["LOOP-BREAKER-1"].closed_24h === 0 && rows["LOOP-BREAKER-1"].open_now === 0), "a family closed long ago counts nowhere in the 24 h window", rows["LOOP-BREAKER-1"]);
ok(rows["ONEWORD"] && rows["ONEWORD"].open_now === 1, "a title with no space or colon is its own family", rows["ONEWORD"]);
ok(JSON.parse(d.prepare("SELECT value FROM ops_config WHERE key = 'OWNER_DIRECTIVE_2026_10_20_ISSUE_THROUGHPUT_1'").get().value).id === "ISSUE-THROUGHPUT-1", "the directive row parses");
const counts = () => [d.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n, d.prepare("SELECT COUNT(*) AS n FROM ops_config").get().n];
d.exec(sql);
ok(counts().join() === "1,1", "a second apply changes nothing", counts());
d.exec(rollback);
let gone = false; try { d.prepare("SELECT 1 FROM v_issue_family_throughput").get(); } catch (e) { gone = true; }
ok(gone && counts()[1] === 0, "Rollback drops the view and the row");
console.log("issue-throughput: " + pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
