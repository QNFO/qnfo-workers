// OUTREACH-ACCELERATE-1 offline suite: applies migrations/2026-10-14-outreach-accelerate.sql on an in-memory SQLite and proves: the caps
// and the share floor are written; v_channel_impact_7d counts posts per channel (Bluesky from both ledgers, Buffer channels by platform,
// email from outreach_log) and joins human clicks only; the fleet_tick trigger refreshes the five metrics (silent channels counts a
// connected channel with no post); four triggers are armed and the ratio is exempt; a second apply changes nothing.
// Run: node migrations/outreach-accelerate.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-14-outreach-accelerate.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE pipeline_flags (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT);
INSERT INTO pipeline_flags VALUES ('social_channel_caps', '{"linkedin":3,"mastodon":7,"twitter":7}', NULL);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER, enabled INTEGER, notes TEXT);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT, kind TEXT, guards_against TEXT, critical_path TEXT, disposition TEXT, disposition_state TEXT, alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT, issue_id INTEGER, reviewed_at TEXT);
CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT, ts TEXT);
CREATE TABLE human_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, slug TEXT, title TEXT, why TEXT, default_in_effect TEXT, action TEXT, url TEXT, sev TEXT, due TEXT, status TEXT, source TEXT, created_at TEXT, updated_at TEXT, resolved_at TEXT, resolution TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TABLE social_threads (id INTEGER PRIMARY KEY, status TEXT, posted_at TEXT);
CREATE TABLE dissemination_tracker (id TEXT PRIMARY KEY, channel TEXT, action TEXT, posted_at TEXT);
CREATE TABLE social_media_posts (id TEXT PRIMARY KEY, platform TEXT, status TEXT, published_at TEXT);
CREATE TABLE outreach_log (id INTEGER PRIMARY KEY, status TEXT, sent_at TEXT);
CREATE TABLE reach_signals (date TEXT, source TEXT, channel TEXT, entity_type TEXT, entity_id TEXT, metric TEXT, value REAL);
CREATE TABLE social_channels (channel_id TEXT PRIMARY KEY, service TEXT, name TEXT, connected INTEGER, checked_at TEXT, checked_day TEXT);
INSERT INTO social_threads VALUES (1, 'posted', datetime('now', '-1 days')), (2, 'posted', datetime('now', '-9 days'));
INSERT INTO dissemination_tracker VALUES ('d1', 'bluesky', 'posted', datetime('now', '-2 days'));
INSERT INTO social_media_posts VALUES ('a', 'buffer-mastodon', 'published', datetime('now', '-1 days')), ('b', 'buffer-mastodon', 'published', datetime('now', '-2 days')), ('c', 'buffer-x', 'published', datetime('now', '-1 days')), ('d', 'buffer-linkedin', 'published', datetime('now', '-10 days'));
INSERT INTO outreach_log VALUES (1, 'sent', datetime('now', '-1 days')), (2, 'followup', datetime('now', '-1 days')), (3, 'replied', datetime('now', '-1 days'));
INSERT INTO reach_signals VALUES (date('now'), 'utm', 'mastodon', 'paper', 'p', 'clicks_human', 6), (date('now'), 'utm', 'mastodon', 'paper', 'p', 'clicks_bot', 50), (date('now'), 'utm', 'probe', 'paper', 'p', 'clicks_human', 9), (date('now', '-20 days'), 'utm', 'x', 'paper', 'p', 'clicks_human', 4);
INSERT INTO social_channels VALUES ('1', 'linkedin', 'r', 1, NULL, NULL), ('2', 'mastodon', 'q', 1, NULL, NULL), ('3', 'twitter', 'x', 1, NULL, NULL);`);
db.exec(sql);
const q = (s) => db.prepare(s).all();
const v = (m) => q("SELECT last_value FROM metric_registry WHERE metric = '" + m + "'")[0].last_value;
ok(JSON.parse(q("SELECT value FROM pipeline_flags WHERE key = 'social_channel_caps'")[0].value).substack === 14 && q("SELECT value FROM pipeline_flags WHERE key = 'social_share_floor'")[0].value === "0.5", "caps and floor written");
const imp = Object.fromEntries(q("SELECT channel, posts_7d, human_clicks_7d FROM v_channel_impact_7d").map((r) => [r.channel, r]));
ok(imp.bluesky.posts_7d === 2 && imp.mastodon.posts_7d === 2 && imp.x.posts_7d === 1 && !imp.linkedin && imp.email.posts_7d === 2, "posts per channel in 7 days", imp);
ok(imp.mastodon.human_clicks_7d === 6 && imp.x.human_clicks_7d === 0, "human clicks only, 7 days only", imp);
ok(v("social_posts_7d") === "5" && v("outreach_human_clicks_7d") === "6" && v("outreach_emails_sent_7d") === "2", "metrics: 5 social posts, 6 human clicks (probe excluded), 2 mails", [v("social_posts_7d"), v("outreach_human_clicks_7d"), v("outreach_emails_sent_7d")]);
ok(v("social_channels_silent_7d") === "1", "LinkedIn is connected and silent", v("social_channels_silent_7d"));
ok(v("outreach_clicks_per_post_7d") === "0.86", "clicks per post over social and email posts (6 / 7)", v("outreach_clicks_per_post_7d"));
const t = q("SELECT metric_key, enabled, cooldown_hours FROM analytics_metric_triggers ORDER BY metric_key");
ok(t.length === 4 && t.every((x) => x.enabled === 1 && x.cooldown_hours <= 2) && !t.some((x) => x.metric_key === "outreach_clicks_per_post_7d"), "four triggers, cooldown at most 2 h; the ratio is exempt", t);
ok(q("SELECT COUNT(*) n FROM control_registry")[0].n === 2, "two control_registry rows");
ok(q("SELECT COUNT(*) n FROM human_actions WHERE status = 'open' AND why LIKE 'IDENTITY-BOUND:%' AND action LIKE '%Closes when: SELECT%'")[0].n === 2, "two owner cards, each IDENTITY-BOUND with its closing query");
db.exec("INSERT INTO social_media_posts VALUES ('e', 'buffer-linkedin', 'published', datetime('now')); INSERT INTO fleet_tick (source) VALUES ('cron')");
ok(v("social_channels_silent_7d") === "0", "a LinkedIn post clears the silent channel on the next tick");
db.exec(sql);
ok(q("SELECT COUNT(*) n FROM analytics_metric_triggers")[0].n === 4 && q("SELECT COUNT(*) n FROM decision_log")[0].n === 1 && q("SELECT COUNT(*) n FROM metric_registry")[0].n === 5 && q("SELECT COUNT(*) n FROM human_actions")[0].n === 2, "idempotent");
// OUTREACH-CLICKS-SCOPE-1: site and referral tags (q08, qnfo.org, chatgpt.com) are not outreach.
db.exec(readFileSync(new URL("./2026-10-14-outreach-clicks-scope.sql", import.meta.url), "utf8"));
const before = v("outreach_human_clicks_7d");
db.exec("INSERT INTO reach_signals VALUES (date('now'), 'utm', 'q08', 'paper', 'p', 'clicks_human', 40), (date('now'), 'utm', 'bluesky', 'paper', 'p', 'clicks_human', 3); INSERT INTO fleet_tick (source) VALUES ('cron')");
ok(before === "6" && v("outreach_human_clicks_7d") === "9", "only outreach channels count: q08 40 ignored, Bluesky 3 added", [before, v("outreach_human_clicks_7d")]);
ok(q("SELECT COUNT(*) n FROM bak_20261014_outreach_clicks_scope")[0].n === 1, "the old trigger is kept in the backup");
console.log(`outreach-accelerate migration: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
