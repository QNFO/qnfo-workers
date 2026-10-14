// PAPER-ROLLUP-1 offline suite: applies migrations/2026-10-14-sla-drain-1.sql's trigger state (simulated) and then
// migrations/2026-10-14-paper-rollup.sql on an in-memory SQLite and proves: the newest-only trigger is gone (a new queued row no longer
// suppresses older ones); SLA-DRAIN-1-suppressed rows of 30 days are queued again and listed in the backup; the detector probe reads the
// 120-minute SLA; the metric counts queued rows older than 120 minutes on the next tick; v_channel_impact_7d counts a roll-up thread once;
// a second apply changes nothing.
// Run: node migrations/paper-rollup.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-14-paper-rollup.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE dissemination_tracker (id TEXT PRIMARY KEY, paper_slug TEXT, paper_title TEXT, channel TEXT, action TEXT, post_id TEXT, post_url TEXT, post_text_snippet TEXT, mode TEXT, posted_at TEXT, created_at TEXT, updated_at TEXT);
CREATE TRIGGER dissemination_queue_newest_only AFTER INSERT ON dissemination_tracker WHEN NEW.action = 'queued'
BEGIN UPDATE dissemination_tracker SET action = 'suppressed', post_text_snippet = 'SLA-DRAIN-1: superseded by ' || NEW.id WHERE channel = NEW.channel AND action = 'queued' AND id <> NEW.id; END;
CREATE TABLE social_threads (id INTEGER PRIMARY KEY, status TEXT, posted_at TEXT);
CREATE TABLE social_media_posts (id TEXT PRIMARY KEY, platform TEXT, status TEXT, published_at TEXT);
CREATE TABLE outreach_log (id INTEGER PRIMARY KEY, status TEXT, sent_at TEXT);
CREATE TABLE reach_signals (date TEXT, source TEXT, channel TEXT, metric TEXT, value REAL);
CREATE VIEW v_channel_impact_7d AS SELECT 'old' AS channel;
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, verify_probe TEXT, precondition TEXT);
INSERT INTO remediation_contracts VALUES ('fm-dissemination-queue-over-cadence', 'old', 'SLA-DRAIN-1');
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, remediation TEXT, detector TEXT);
INSERT INTO failure_modes VALUES ('fm-dissemination-queue-over-cadence', 'old', 'old');
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER, enabled INTEGER, notes TEXT);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT, kind TEXT, guards_against TEXT, critical_path TEXT, disposition TEXT, disposition_state TEXT, alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT, issue_id INTEGER, reviewed_at TEXT);
CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);`);
const ins = db.prepare("INSERT INTO dissemination_tracker (id, paper_slug, channel, action, created_at, updated_at) VALUES (?, ?, 'bluesky', 'queued', datetime('now', ?), datetime('now', ?))");
ins.run("a", "a", "-3 days", "-3 days"); ins.run("b", "b", "-2 days", "-2 days"); ins.run("c", "c", "-1 days", "-1 days");
db.exec("INSERT INTO dissemination_tracker (id, paper_slug, channel, action, post_text_snippet, created_at) VALUES ('old', 'o', 'bluesky', 'suppressed', 'SLA-DRAIN-1: x', datetime('now', '-40 days')), ('gone', 'g', 'bluesky', 'suppressed', 'SUPPRESSED: target paper gone', datetime('now', '-1 days'))");
const q = (s) => db.prepare(s).all();
ok(q("SELECT COUNT(*) n FROM dissemination_tracker WHERE action = 'queued'")[0].n === 1, "before: the trigger left only the newest queued");
db.exec(sql);
ok(q("SELECT COUNT(*) n FROM sqlite_master WHERE name = 'dissemination_queue_newest_only'")[0].n === 0, "trigger dropped");
{ const d = q("SELECT description FROM agent_issues")[0].description; ok(/\ncode-task: repo=qnfo-workers path=qnfo-fleet-dashboard\/worker\.js\ncode-anchor: \{ key: "social-channels", what:\ncode-probe: \{"paths": \["qnfo-fleet-dashboard\/worker\.js"\], "contains": "key: \\"social-rollup\\""\}$/.test(d), "watchmaker issue carries code-task, anchor and code-probe lines", d.slice(-260)); }
ok(q("SELECT id FROM dissemination_tracker WHERE action = 'queued' ORDER BY id").map((r) => r.id).join() === "a,b,c", "the two SLA-DRAIN-1 rows of 30 days are queued again; the 40-day row and a gone paper stay suppressed");
ok(q("SELECT COUNT(*) n FROM bak_20261014_paper_rollup WHERE kind = 'restored'")[0].n === 2 && q("SELECT COUNT(*) n FROM bak_20261014_paper_rollup WHERE kind = 'trigger'")[0].n === 1, "backup lists the trigger and the restored ids");
db.exec("INSERT INTO dissemination_tracker (id, paper_slug, channel, action, created_at, updated_at) VALUES ('d', 'd', 'bluesky', 'queued', datetime('now'), datetime('now'))");
ok(q("SELECT COUNT(*) n FROM dissemination_tracker WHERE action = 'queued'")[0].n === 4, "a new queued row no longer suppresses the others");
ok(/updated_at < datetime\('now', '-120 minutes'\)/.test(q("SELECT verify_probe p FROM remediation_contracts")[0].p), "detector reads the 120-minute SLA");
ok(q("SELECT last_value v FROM metric_registry WHERE metric = 'papers_queued_over_120m'")[0].v === "1", "re-queued rows start their clock at re-queue; the row queued for a day counts");
db.exec("UPDATE dissemination_tracker SET updated_at = datetime('now', '-3 hours') WHERE id IN ('a', 'b'); INSERT INTO fleet_tick (source) VALUES ('cron')");
ok(q("SELECT last_value v FROM metric_registry WHERE metric = 'papers_queued_over_120m'")[0].v === "3", "rows past 120 minutes are counted on the next tick");
db.exec("UPDATE dissemination_tracker SET action = 'posted', mode = 'rollup:bluesky', posted_at = datetime('now') WHERE id IN ('a', 'b', 'c'); INSERT INTO social_media_posts VALUES ('r1', 'bluesky-rollup', 'published', datetime('now'))");
ok(q("SELECT posts_7d FROM v_channel_impact_7d WHERE channel = 'bluesky'")[0].posts_7d === 1, "a roll-up thread counts once in v_channel_impact_7d");
db.exec(sql);
ok(q("SELECT COUNT(*) n FROM analytics_metric_triggers")[0].n === 1 && q("SELECT COUNT(*) n FROM decision_log")[0].n === 1 && q("SELECT COUNT(*) n FROM control_registry")[0].n === 1 && q("SELECT COUNT(*) n FROM agent_issues")[0].n === 1, "idempotent");
console.log(`paper-rollup migration: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
