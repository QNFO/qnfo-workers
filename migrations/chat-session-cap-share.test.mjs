// IDEAS-CHAT-SESSION-CAP-SHARE-1 offline suite: runs migrations/2026-10-19-chat-session-cap-share.sql on SQLite. Proves: the metric
// reads 0 with no chat-session intake, reads the right share once chat-session rows enter research_queue, ignores rows older
// than 7 days and non-proposal sources, refreshes only in the :00-:09 slot or on a migration tick, and the trigger row carries
// the code-task; re-applying adds nothing.
// Run: node migrations/chat-session-cap-share.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-19-chat-session-cap-share.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER, enabled INTEGER, notes TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, source TEXT);
CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, created_at TEXT);`);
const iso = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 19) + "Z";
const prop = db.prepare("INSERT INTO idea_proposals VALUES (?, ?)");
const rq = db.prepare("INSERT INTO research_queue VALUES (?, ?, ?, ?)");
for (let i = 1; i <= 6; i++) { prop.run(i, "owner-corpus"); rq.run("r" + i, "proposal", String(i), iso(1)); }
db.exec(sql);
const v = () => db.prepare("SELECT last_value FROM metric_registry WHERE metric = 'chat_session_research_share_7d'").get().last_value;
ok(Number(v()) === 0, "0 with no chat-session intake", v());
prop.run(7, "chat-session"); rq.run("r7", "proposal", "7", iso(1));
prop.run(8, "chat-session"); rq.run("r8", "proposal", "8", iso(10));
prop.run(9, "chat-session"); rq.run("r9", "seed", "9", iso(1));
db.exec("INSERT INTO fleet_tick (source) VALUES ('migration:test')");
ok(v() === "0.143", "one chat-session row of seven recent proposal rows", v());
db.exec("DELETE FROM research_queue; INSERT INTO fleet_tick (source) VALUES ('migration:test')");
ok(v() !== null && Number(v()) === 0, "an empty window reads 0, not null", v());
const t = db.prepare("SELECT threshold, operator, action FROM analytics_metric_triggers").get();
ok(t.threshold === 0.25 && t.operator === "gt" && /code-task: repo=qnfo-workers path=idea-hub\/worker\.js/.test(t.action), "trigger at 0.25 with its code-task", t);
const trig = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'chat_session_research_share_tick'").get().sql;
ok(/strftime\('%M', 'now'\) < '10'/.test(trig), "the refresh is gated to the hourly slot");
db.exec(sql);
ok(db.prepare("SELECT COUNT(*) AS n FROM analytics_metric_triggers").get().n === 1 && db.prepare("SELECT COUNT(*) AS n FROM decision_log").get().n === 1, "re-applying adds nothing");
console.log(`chat-session-cap-share: ${pass} pass, ${fail} fail`);
if (fail) process.exit(1);
