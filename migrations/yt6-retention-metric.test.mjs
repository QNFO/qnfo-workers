// YT-6 retention metric offline suite: replays migrations/2026-10-28-yt6-retention-metric.sql on SQLite (node:sqlite).
// Proves: the metric is registered UNMEASURED together with an enabled trigger (a metric and its trigger land together), the owner card carries an IDENTITY-BOUND line, its default in effect and the
// closing condition, a replay adds nothing, and the file writes no metric value (no zero is ever written by the migration).
// Run: node migrations/yt6-retention-metric.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-28-yt6-retention-metric.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 300))); } };
const hdr = sql.split("\n").filter((l) => l.startsWith("--"));
ok(hdr.some((l) => l === "-- APPLY-BY: ci") && hdr.some((l) => l === "-- DB: qnfo-audit") && hdr.some((l) => l.startsWith("-- Rollback: ")), "header lines");

const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, state TEXT, refresh_class TEXT, last_value TEXT, last_refreshed TEXT);
CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER, enabled INTEGER, notes TEXT);
CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT UNIQUE, title TEXT, why TEXT, default_in_effect TEXT, action TEXT, url TEXT, sev TEXT, status TEXT, source TEXT, created_at TEXT, updated_at TEXT);`);
db.exec(sql);
const m = db.prepare("SELECT * FROM metric_registry WHERE metric = 'youtube_avg_view_duration_s'").get();
ok(m && m.state === "UNMEASURED" && m.last_value === null && m.owner === "qnfo-youtube-shorts" && m.refresh_cadence === "hourly", "the metric is registered UNMEASURED with no value", m);
const t = db.prepare("SELECT * FROM analytics_metric_triggers WHERE metric_key = 'youtube_avg_view_duration_s'").all();
ok(t.length === 1 && t[0].enabled === 1 && t[0].operator === "lt" && t[0].threshold === 10 && t[0].queue_target === "agent_issues" && /Definition of done/.test(t[0].action), "one enabled trigger with a definition of done", t);
const c = db.prepare("SELECT * FROM human_actions WHERE slug = 'yt-analytics-consent'").get();
ok(c && /IDENTITY-BOUND:/.test(c.why) && /youtube\.readonly/.test(c.action) && /yt-analytics\.readonly/.test(c.action) && c.default_in_effect.length > 20 && /closes when/.test(c.action) && c.status === "open", "the owner card carries the IDENTITY-BOUND line, the scopes, the default in effect and its closing condition", c && c.slug);
db.exec(sql);
ok(db.prepare("SELECT COUNT(*) n FROM metric_registry").get().n === 1 && db.prepare("SELECT COUNT(*) n FROM analytics_metric_triggers").get().n === 1 && db.prepare("SELECT COUNT(*) n FROM human_actions").get().n === 1, "a replay adds nothing");
ok(!/UPDATE\s+metric_registry/i.test(sql) && !/last_value/i.test(sql), "the file writes no metric value");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
