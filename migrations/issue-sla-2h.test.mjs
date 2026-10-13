// ISSUE-SLA-2H-1 offline suite: applies migrations/2026-10-13-issue-sla-2h.sql on an in-memory SQLite and proves: the drain trigger
// threshold is 1.5 and the open-issue target is 0; issue_auto_close_2h_share_24h counts an open or reopen event as met only when its
// issue reached a disposition within 2 hours and was not closed by a session (channel or triage owner); events younger than 2 hours or older than 26 hours are
// outside the window; a second apply changes nothing.
// Run: node migrations/issue-sla-2h.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-13-issue-sla-2h.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER, enabled INTEGER, notes TEXT);
CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, event TEXT NOT NULL, from_status TEXT, to_status TEXT, has_evidence INTEGER, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, status TEXT, close_channel TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, owner TEXT, close_evidence TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
INSERT INTO metric_registry (metric, target, last_value) VALUES ('issue_drain_ratio_24h', '> 1', '1.154'), ('open_agent_issues', '<=10', '120'), ('issues_open_over_24h', '0', '90');
INSERT INTO analytics_metric_triggers (metric_key, operator, threshold) VALUES ('issue_drain_ratio_24h', 'lt', 1), ('open_agent_issues', 'gt', 20), ('issues_open_over_24h', 'gt', 0);`);
const q = (s, ...a) => db.prepare(s).all(...a);
const ago = (h) => q("SELECT strftime('%Y-%m-%dT%H:%M:%SZ', 'now', ?) t", "-" + h + " hours")[0].t;
const ev = (iid, event, hoursAgo) => db.prepare("INSERT INTO issue_lifecycle (issue_id, event, ts) VALUES (?, ?, ?)").run(iid, event, ago(hoursAgo));
const issue = (iid, ch) => db.prepare("INSERT INTO agent_issues (id, title, status, close_channel) VALUES (?, 'x', 'closed', ?)").run(iid, ch);

// Events in the 2-26 h window: 1 closed by a trigger after 1 h (met), 2 closed by a loop (null channel) after 1.5 h (met),
// 3 closed after 3 h (missed), 4 closed by a session within 1 h (missed: not server-side), 5 never closed (missed).
issue(1, "auto:verified-remediation-trigger"); ev(1, "opened", 10); ev(1, "dispositioned", 9);
issue(2, null); ev(2, "reopened", 5); ev(2, "dispositioned", 3.5);
issue(3, "auto:triage-resolved-sync"); ev(3, "opened", 8); ev(3, "dispositioned", 5);
issue(4, "session:live-evidence"); ev(4, "opened", 6); ev(4, "dispositioned", 5.5);
issue(5, null); ev(5, "opened", 12);
// Outside the window: opened 1 h ago (too young), opened 30 h ago (too old).
issue(6, null); ev(6, "opened", 1);
issue(7, null); ev(7, "opened", 30); ev(7, "dispositioned", 29.5);

db.exec(sql);
const reg = (m) => q("SELECT target, last_value FROM metric_registry WHERE metric = ?", m)[0];
const thr = (m) => q("SELECT operator, threshold FROM analytics_metric_triggers WHERE metric_key = ?", m)[0];
ok(thr("issue_drain_ratio_24h").threshold === 1.5 && /1\.5/.test(reg("issue_drain_ratio_24h").target), "drain: trigger lt 1.5 and target >= 1.5", [thr("issue_drain_ratio_24h"), reg("issue_drain_ratio_24h")]);
ok(thr("open_agent_issues").threshold === 0 && /^0 /.test(reg("open_agent_issues").target), "open issues: target 0, trigger gt 0");
ok(/24 hours/.test(reg("issues_open_over_24h").target) && thr("issues_open_over_24h").threshold === 0, "issues_open_over_24h: target names the directive, trigger unchanged at gt 0");
const t = thr("issue_auto_close_2h_share_24h");
ok(t && t.operator === "lt" && t.threshold === 1, "the 2 h metric has its trigger (lt 1)", t);
ok(reg("issue_auto_close_2h_share_24h").last_value === "0.4", "2 of 5 window events met: closed server-side within 2 h", reg("issue_auto_close_2h_share_24h"));

// A session close is not counted; switching issue 4 to a trigger close makes it count.
db.prepare("UPDATE agent_issues SET close_channel = 'auto:verified-remediation-trigger' WHERE id = 4").run();
db.exec("INSERT INTO fleet_tick (source) VALUES ('test')");
ok(reg("issue_auto_close_2h_share_24h").last_value === "0.6", "a server-side close of the same issue counts (3 of 5)", reg("issue_auto_close_2h_share_24h"));
// Exactly at the 2 h edge counts; just past it does not.
issue(8, null); ev(8, "opened", 20); ev(8, "dispositioned", 18);
issue(9, null); ev(9, "opened", 20); ev(9, "dispositioned", 17.9);
db.exec("INSERT INTO fleet_tick (source) VALUES ('test')");
ok(reg("issue_auto_close_2h_share_24h").last_value === "0.571", "the 2 h edge counts and 2 h 6 min does not (4 of 7)", reg("issue_auto_close_2h_share_24h"));

// A session close through issue_triage (the close-sync triggers leave close_channel empty) is not server-side.
db.prepare("INSERT INTO issue_triage (issue_id, owner, close_evidence) VALUES (8, 'session_01X', 'x')").run();
db.exec("INSERT INTO fleet_tick (source) VALUES ('test')");
ok(reg("issue_auto_close_2h_share_24h").last_value === "0.429", "a triage close owned by a session does not count (3 of 7)", reg("issue_auto_close_2h_share_24h"));
db.prepare("UPDATE issue_triage SET owner = 'fleet-autoremediation' WHERE issue_id = 8").run();
db.exec("INSERT INTO fleet_tick (source) VALUES ('test')");
ok(reg("issue_auto_close_2h_share_24h").last_value === "0.571", "a triage close owned by the fleet counts again (4 of 7)", reg("issue_auto_close_2h_share_24h"));

// A second apply changes nothing.
const before = JSON.stringify([q("SELECT * FROM analytics_metric_triggers ORDER BY id"), q("SELECT metric, target FROM metric_registry ORDER BY metric"), q("SELECT COUNT(*) n FROM decision_log")]);
db.exec(sql);
const after = JSON.stringify([q("SELECT * FROM analytics_metric_triggers ORDER BY id"), q("SELECT metric, target FROM metric_registry ORDER BY metric"), q("SELECT COUNT(*) n FROM decision_log")]);
ok(before === after, "applying the migration twice changes nothing");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
