// AUTONOMY-SELFHEAL-SCORE-1 offline suite: applies migrations/2026-10-13-autonomy-selfheal-score.sql on an in-memory SQLite and proves
// each metric counts what it says (doer coverage, probe executability, tick age, server-side close share), the score is the mean of its
// seven components, the trigger refreshes only in the hour's first slot or on a migration tick, and a second apply changes nothing.
// Run: node migrations/autonomy-selfheal-score.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-13-autonomy-selfheal-score.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER, enabled INTEGER, notes TEXT);
CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, description TEXT, status TEXT, close_channel TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, owner TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, goal TEXT, status TEXT);
CREATE TABLE work_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT, holder TEXT, issue_id INTEGER, expires_at TEXT, released_at TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, verify_probe TEXT, status TEXT, last_verdict TEXT);
CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, verifier TEXT, verified_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
INSERT INTO metric_registry (metric, last_value) VALUES ('autonomy_rate_7d', '0.9'), ('issue_auto_close_2h_share_24h', '0.5'), ('issue_drain_ratio_24h', '3');`);
const q = (s, ...a) => db.prepare(s).all(...a);
const nowMs = Date.now(), day = 86400000;
const iss = db.prepare("INSERT INTO agent_issues (id, title, description, status, close_channel, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)");
// Open, older than 24 h: 1 no doer; 2 code-task line; 3 unfinished code task; 4 live claim; 5 failed code task only (no doer);
// 6 expired claim only (no doer). Open, younger than 24 h: 7 (not counted). 9 open issues in all with 8 and 9 below.
iss.run(1, "A", "plain", "open", null, nowMs - 2 * day, nowMs);
iss.run(2, "B", "x\ncode-task: repo=qnfo-workers path=a/worker.js", "open", null, nowMs - 2 * day, nowMs);
iss.run(3, "C", "plain", "open", null, nowMs - 2 * day, nowMs);
iss.run(4, "D", "plain", "open", null, nowMs - 2 * day, nowMs);
iss.run(5, "E", "plain", "open", null, nowMs - 2 * day, nowMs);
iss.run(6, "F", "plain", "open", null, nowMs - 2 * day, nowMs);
iss.run(7, "G", "plain", "open", null, nowMs - 3600000, nowMs);
db.exec(`INSERT INTO code_tasks VALUES ('ct3', '[issue #3] fix', 'queued'), ('ct5', '[issue #5] fix', 'failed'), ('ct13', '[issue #13] fix', 'queued');
INSERT INTO work_claims (path, holder, issue_id, expires_at, released_at) VALUES ('issue:4', 's', NULL, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+1 hour'), NULL),
  ('issue:6', 's', 6, strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 hour'), NULL);`);
// Probes: 8 vacuous verdict, 9 self-referential probe, 1 a good probe; 10 closed issue with a vacuous verdict (not counted).
iss.run(8, "H", "plain", "open", null, nowMs - 3600000, nowMs);
iss.run(9, "I", "plain", "open", null, nowMs - 3600000, nowMs);
db.exec(`INSERT INTO remediation_contracts VALUES ('issue-8', 8, 'SELECT 1', 'active', 'vacuous-probe-result'),
  ('issue-9', 9, 'SELECT ''closed'' AS expected, (SELECT CASE WHEN status IN (''closed'', ''resolved'') THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = 9) AS observed', 'active', NULL),
  ('issue-1', 1, 'SELECT ''0'' AS expected, ''1'' AS observed', 'active', 'fail'), ('issue-10', 10, 'x', 'active', 'vacuous-probe-result');`);
// Closed in 7 days: 10 by a trigger, 11 by a session channel, 12 by a triage owner session, 13 by a loop; 14 closed 8 days ago (out).
iss.run(10, "J", "", "closed", "auto:verified-remediation-trigger", nowMs - 3 * day, nowMs - day);
iss.run(11, "K", "", "closed", "session:x", nowMs - 3 * day, nowMs - day);
iss.run(12, "L", "", "closed", null, nowMs - 3 * day, nowMs - day);
iss.run(13, "M", "", "resolved", null, nowMs - 3 * day, nowMs - day);
iss.run(14, "N", "", "closed", "session:y", nowMs - 9 * day, nowMs - 8 * day);
db.exec(`INSERT INTO issue_triage VALUES (12, 'session_01Z'), (13, 'fleet-autoremediation');
INSERT INTO remediation_verifications (verifier, verified_at) VALUES ('qnfo-fleet-control/remediation-tick@0.26.5', datetime('now', '-15 minutes')),
  ('remediation-consumer@abc', datetime('now', '-1 minutes'));`);

db.exec(sql);
const v = (m) => (q("SELECT last_value FROM metric_registry WHERE metric = ?", m)[0] || {}).last_value;
ok(v("open_issues_without_doer_24h") === "3", "without doer: 1, 5 (failed task), 6 (expired claim); not 2, 3, 4 or the young 7", v("open_issues_without_doer_24h"));
ok(v("contracts_unexecutable_open") === "2", "unexecutable: 8 (vacuous) and 9 (self-referential); not 1 or the closed 10", v("contracts_unexecutable_open"));
ok(v("remediation_tick_age_min") === "15", "tick age reads the fleet-control verifier only (15, not the consumer's 1)", v("remediation_tick_age_min"));
ok(v("server_side_close_share_7d") === "0.5", "server-side share: 10 and 13 of 10-13; 14 is outside 7 days", v("server_side_close_share_7d"));
// score: autonomy 0.9, ss 0.5, 2h 0.5, drain min(1, 3/1.5) = 1, tick (120-15)/100 = 1 (capped), exec 1 - 2/10 = 0.8, doer 1 - 3/9 = 0.667
const expect = Math.round(1000 * (0.9 + 0.5 + 0.5 + 1 + 1 + 0.8 + (1 - 3 / 9)) / 7) / 10;
ok(Number(v("autonomy_selfheal_score")) === expect, "score is the mean of the seven components x 100 (" + expect + ")", v("autonomy_selfheal_score"));
const trig = q("SELECT metric_key, operator, threshold FROM analytics_metric_triggers ORDER BY metric_key");
ok(trig.length === 4 && !trig.some((t) => t.metric_key === "autonomy_selfheal_score"), "four component triggers; the score is exempt", trig);

// A stale tick lowers the score; a fresh one restores it (only on a slot or migration tick).
db.exec("DELETE FROM remediation_verifications WHERE verifier LIKE 'qnfo-fleet-control%'; INSERT INTO remediation_verifications (verifier, verified_at) VALUES ('qnfo-fleet-control/remediation-tick@x', datetime('now', '-170 minutes'))");
db.exec("INSERT INTO fleet_tick (source) VALUES ('migration:test')");
ok(v("remediation_tick_age_min") === "170", "tick age 170 after an outage", v("remediation_tick_age_min"));
const expect2 = Math.round(1000 * (0.9 + 0.5 + 0.5 + 1 + 0 + 0.8 + (1 - 3 / 9)) / 7) / 10;
ok(Number(v("autonomy_selfheal_score")) === expect2, "an outage takes the tick component to 0 (" + expect2 + ")", v("autonomy_selfheal_score"));
// Fixing the doers raises the score.
db.exec("UPDATE agent_issues SET description = 'code-task: repo=qnfo-workers path=b/worker.js' WHERE id IN (1, 5, 6); INSERT INTO fleet_tick (source) VALUES ('migration:test')");
ok(v("open_issues_without_doer_24h") === "0", "every old open issue has a doer", v("open_issues_without_doer_24h"));

// Off-slot ticks from a cron source do not refresh unless minute < 10.
const minute = Number(q("SELECT strftime('%M', 'now') m")[0].m);
db.exec("UPDATE metric_registry SET last_value = 'sentinel' WHERE metric = 'remediation_tick_age_min'; INSERT INTO fleet_tick (source) VALUES ('cron:qnfo-code-orchestrator')");
ok(minute < 10 ? v("remediation_tick_age_min") !== "sentinel" : v("remediation_tick_age_min") === "sentinel", "a cron tick refreshes only in minutes 00-09 (minute " + minute + ")", v("remediation_tick_age_min"));

// A second apply changes nothing in the trigger rows or the decision log.
const before = JSON.stringify([q("SELECT * FROM analytics_metric_triggers ORDER BY id"), q("SELECT COUNT(*) n FROM decision_log"), q("SELECT metric, target FROM metric_registry ORDER BY metric")]);
db.exec(sql);
const after = JSON.stringify([q("SELECT * FROM analytics_metric_triggers ORDER BY id"), q("SELECT COUNT(*) n FROM decision_log"), q("SELECT metric, target FROM metric_registry ORDER BY metric")]);
ok(before === after, "applying the migration twice changes nothing");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
