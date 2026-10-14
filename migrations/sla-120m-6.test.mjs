// SLA-120M-6 offline suite: applies 2026-10-13-autonomy-selfheal-score.sql, then 2026-10-14-sla-120m-6-doer-120m.sql, on an in-memory
// SQLite (fixtures shared with autonomy-selfheal-score.test.mjs) and proves: open_issues_without_doer_120m counts open issues older than
// 120 minutes with no doer, refreshes on every fleet_tick (no minute filter), feeds autonomy_selfheal_score; the 24 h trigger is disabled
// and the 120 m trigger is armed; the backup holds the old trigger; a second apply changes nothing.
// Run: node migrations/sla-120m-6.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-13-autonomy-selfheal-score.sql", import.meta.url), "utf8");
const sql6 = readFileSync(new URL("./2026-10-14-sla-120m-6-doer-120m.sql", import.meta.url), "utf8");
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
// 15: open, 3 h old, no doer: past 120 minutes, inside 24 h. 16: open, 90 minutes old, no doer: not yet counted.
iss.run(15, "O", "plain", "open", null, nowMs - 3 * 3600000, nowMs);
iss.run(16, "P", "plain", "open", null, nowMs - 90 * 60000, nowMs);
db.exec(sql6);
ok(v("open_issues_without_doer_120m") === "4", "120 m without doer: 1, 5, 6 and the 3 h old 15; not 7, 8, 9 (1 h) or 16 (90 min)", v("open_issues_without_doer_120m"));
ok(v("open_issues_without_doer_24h") === "3", "the 24 h count is still written for history", v("open_issues_without_doer_24h"));
const expect = Math.round(1000 * (0.9 + 0.5 + 0.5 + 1 + 1 + 0.8 + (1 - 4 / 11)) / 7) / 10;
ok(Number(v("autonomy_selfheal_score")) === expect, "score reads the 120 m count over 11 open issues", [v("autonomy_selfheal_score"), expect]);
const t = q("SELECT metric_key, enabled, threshold, cooldown_hours FROM analytics_metric_triggers WHERE metric_key LIKE 'open_issues_without_doer%' ORDER BY metric_key");
ok(t.length === 2 && t[0].metric_key === "open_issues_without_doer_120m" && t[0].enabled === 1 && t[0].threshold === 10 && t[0].cooldown_hours <= 2, "120 m trigger armed, cooldown at most 2 h", t);
ok(t[1].enabled === 0, "24 h trigger disabled", t[1]);
ok(!/86400/.test(q("SELECT action FROM analytics_metric_triggers WHERE metric_key = 'open_issues_without_doer_120m'")[0].action), "the lever text reads the 120 m window");
const bak = q("SELECT kind, name, sql FROM bak_20261014_doer_120m ORDER BY kind");
ok(bak.length === 2 && bak[1].kind === "trigger" && /< 10/.test(bak[1].sql), "backup holds the old hourly trigger and the 24 h trigger state", bak.map((b) => b.kind));
ok(!/strftime\('%M'/.test(q("SELECT sql FROM sqlite_master WHERE name = 'autonomy_selfheal_tick'")[0].sql), "the new trigger has no minute filter");
// A later 10-minute tick refreshes the count: 16 passes 120 minutes.
db.prepare("UPDATE agent_issues SET created_at = ? WHERE id = 16").run(nowMs - 130 * 60000);
db.prepare("INSERT INTO fleet_tick (source) VALUES ('cron')").run();
ok(v("open_issues_without_doer_120m") === "5", "any fleet_tick refreshes it (16 now counted)", v("open_issues_without_doer_120m"));
db.exec(sql6);
ok(q("SELECT COUNT(*) n FROM analytics_metric_triggers WHERE metric_key = 'open_issues_without_doer_120m'")[0].n === 1 && q("SELECT COUNT(*) n FROM decision_log WHERE action LIKE 'SLA-120M-6:%'")[0].n === 1, "idempotent");
console.log(`sla-120m-6: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
