// ANALYTICS-LOOP-1: runs the real migration and each real loop step against an in-memory SQLite (node:sqlite) seeded like reach_signals.
// Proves: rising, external_pull and fading are classified from 7 days against the prior 7; an unpublished page is ignored; at most two follow-up research items a day reach research_queue; a
// re-run adds nothing (idempotent); a finding settles after 8 days against what the paper really got; the rising threshold rises when the last settled findings missed and does not compound.
// Run: node --no-warnings migrations/analytics-loop.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x !== undefined ? " :: " + JSON.stringify(x) : "")); } };

const db = new DatabaseSync(":memory:");
db.exec(`
CREATE TABLE reach_signals (date TEXT, source TEXT, channel TEXT, entity_type TEXT, entity_id TEXT, metric TEXT, value REAL, quality TEXT);
CREATE TABLE paper_readership (slug TEXT PRIMARY KEY, published_at TEXT);
CREATE TABLE research_queue (id TEXT PRIMARY KEY, source TEXT, source_id TEXT, idea TEXT, summary TEXT, score REAL, decision TEXT, status TEXT DEFAULT 'queued', created_at TEXT, UNIQUE(source, source_id));
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, formula TEXT, source_of_truth TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, state TEXT, last_value TEXT, last_refreshed TEXT);
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT, type TEXT, definition TEXT, timeout_ms INTEGER, retries INTEGER, version INTEGER, enabled INTEGER, updated_at TEXT);
CREATE TABLE fleet_crons (name TEXT PRIMARY KEY, cron_expr TEXT, task_id TEXT, enabled INTEGER, timezone TEXT, updated_at TEXT);
`);
db.exec(readFileSync(new URL("./2026-11-14-analytics-loop.sql", import.meta.url), "utf8"));
db.exec(readFileSync(new URL("./2026-11-14-ga4-consent-share.sql", import.meta.url), "utf8"));
db.exec(readFileSync(new URL("./2026-11-14-analytics-null-1.sql", import.meta.url), "utf8")); // ANALYTICS-NULL-1 replaces both tasks: the steps below are the latest

const task = db.prepare("SELECT definition, enabled FROM fleet_tasks WHERE id = 'analytics-loop'").get();
const steps = JSON.parse(task.definition).steps;
ok(task.enabled === 1 && steps.length === 9 && steps.every((s) => s.type === "sql" && s.db === "AUDIT"), "the task has nine SQL steps on the audit database", steps.length);
const cron = db.prepare("SELECT cron_expr FROM fleet_crons WHERE name = 'analytics-loop-hourly'").get();
ok(cron && Number(cron.cron_expr.split(" ")[0]) % 5 === 0 && /^\d+ \* \* \* \*$/.test(cron.cron_expr), "the cron is hourly on the 5-minute grid", cron);
const run = () => { for (const s of steps) db.exec(s.sql); };
const metric = (m) => db.prepare("SELECT last_value v FROM metric_registry WHERE metric = ?").get(m).v;

// ANALYTICS-NULL-1: nothing to measure reads NULL, never a measured-looking zero.
{
  const g = JSON.parse(db.prepare("SELECT definition d FROM fleet_tasks WHERE id = 'ga4-consent-share'").get().d).steps;
  const runG = () => { for (const x of g) db.exec(x.sql); };
  db.exec("INSERT INTO reach_signals VALUES (date('now','-1 days'), 'ga4', '', 'host', 'h', 'screenPageViews', 5, 'human')");
  runG();
  ok(metric("ga4_consent_share_7d") === null, "no cookie-free rows: the GA4 share is NULL, not 0.0000", metric("ga4_consent_share_7d"));
  db.exec("INSERT INTO reach_signals VALUES (date('now','-1 days'), 'cf-rum-human', '', 'host', 'h', 'pageviews', 1000, 'human')");
  runG();
  ok(metric("ga4_consent_share_7d") === "0.0050", "5 GA4 views over 1000 cookie-free views read 0.0050", metric("ga4_consent_share_7d"));
  db.exec("DELETE FROM reach_signals");
  run();
  ok(metric("analytics_trend_precision_28d") === null, "no settled finding: the precision is NULL, not 0.00", metric("analytics_trend_precision_28d"));
}


const day = (n) => `date('now','-${n} days')`;
const put = (slug, metric, daysAgo, value) => db.exec(`INSERT INTO reach_signals VALUES (${day(daysAgo)}, 'cf-rum-human', '', 'paper', '${slug}', '${metric}', ${value}, 'human')`);
const paper = (slug, published = "2026-11-01T00:00:00Z") => db.exec(`INSERT INTO paper_readership VALUES ('${slug}', ${published ? `'${published}'` : "NULL"})`);

// rising: 0 before, 51 now. external_pull: 6 external views. fading: 76 before, 14 now. steady: 30 and 28. tags: unpublished page. tiny: 4 views, never rising.
for (const [slug, pub] of [["rise-a", "x"], ["pull-b", "x"], ["fade-c", "x"], ["steady-d", "x"], ["tags", null], ["tiny-e", "x"], ["rise-f", "x"], ["rise-g", "x"]]) paper(slug, pub ? "2026-11-01T00:00:00Z" : null);
put("rise-a", "pageviews", 2, 51);
put("pull-b", "pageviews", 2, 12); put("pull-b", "external_pageviews", 2, 6);
put("fade-c", "pageviews", 10, 76); put("fade-c", "pageviews", 2, 14);
put("steady-d", "pageviews", 10, 30); put("steady-d", "pageviews", 2, 28);
put("tags", "pageviews", 2, 130);
put("tiny-e", "pageviews", 2, 4);
put("rise-f", "pageviews", 2, 40);
put("rise-g", "pageviews", 2, 35);

const kinds = () => Object.fromEntries(db.prepare("SELECT entity, kind FROM analytics_findings").all().map((r) => [r.entity, r.kind]));
run();
let k = kinds();
ok(k["rise-a"] === "rising" && k["pull-b"] === "external_pull" && k["fade-c"] === "fading", "rising, external_pull and fading are classified", k);
ok(!("steady-d" in k) && !("tags" in k) && !("tiny-e" in k), "a steady paper, an unpublished page and a tiny one produce no finding", k);

const queued = db.prepare("SELECT id, source, score, decision, status, idea FROM research_queue WHERE source = 'analytics' ORDER BY id").all();
ok(queued.length === 2, "at most two follow-ups reach research_queue in a day", queued.length);
ok(queued.every((q) => q.decision === "ACCEPT" && q.status === "queued" && q.score === 0.95 && /Demand-led follow-up/.test(q.idea)), "each follow-up is an accepted, queued, high-score item", queued[0]);
ok(db.prepare("SELECT COUNT(*) n FROM analytics_findings WHERE status = 'acted' AND action LIKE 'research_queue%' AND action_ref LIKE 'an-%'").get().n === 2, "the two acted findings name their research item");
ok(db.prepare("SELECT status, action FROM analytics_findings WHERE kind = 'fading'").get().status === "acted", "a fading finding is recorded with its disposition, not left open");
ok(db.prepare("SELECT COUNT(*) n FROM analytics_findings WHERE status = 'open'").get().n >= 1, "the third rising paper waits for the next day's budget, still open", db.prepare("SELECT entity, status FROM analytics_findings").all());

const n1 = db.prepare("SELECT COUNT(*) n FROM analytics_findings").get().n, q1 = db.prepare("SELECT COUNT(*) n FROM research_queue").get().n;
run(); run();
ok(db.prepare("SELECT COUNT(*) n FROM analytics_findings").get().n === n1 && db.prepare("SELECT COUNT(*) n FROM research_queue").get().n === q1, "re-running the loop adds no finding and no research item (idempotent)");

// Settle: age the findings 9 days, give rise-a a held week and the other rising papers nothing, then settle.
db.exec(`UPDATE analytics_findings SET created_at = datetime('now','-9 days')`);
db.exec(`UPDATE analytics_findings SET window_end = date('now','-9 days')`);
db.exec(`INSERT INTO reach_signals VALUES (date('now','-8 days'), 'cf-rum-human', '', 'paper', 'rise-a', 'pageviews', 40, 'human')`);
run();
const settled = Object.fromEntries(db.prepare("SELECT entity, status, observed, outcome FROM analytics_findings WHERE status = 'settled'").all().map((r) => [r.entity, r]));
ok(settled["rise-a"] && settled["rise-a"].outcome === "held" && settled["rise-a"].observed === 40, "a rising paper whose next week kept 40 of 51 views settles as held", settled["rise-a"]);
ok(settled["rise-f"] && settled["rise-f"].outcome === "missed", "a rising paper that then got nothing settles as missed", settled["rise-f"]);
ok(settled["fade-c"] && settled["fade-c"].outcome === "held", "a fading paper that stayed low settles as held", settled["fade-c"]);
ok(db.prepare("SELECT last_value FROM metric_registry WHERE metric = 'analytics_trend_precision_28d'").get().last_value !== null, "the precision metric is refreshed");

// Tune: twelve settled rising findings that all missed raise the threshold once, and a second run does not compound it.
db.exec(`UPDATE ops_config SET updated_at = datetime('now','-1 day') WHERE key = 'analytics_rise_min_views'`);
db.exec(`DELETE FROM analytics_findings WHERE kind = 'rising'`);
for (let i = 0; i < 12; i++) db.exec(`INSERT INTO analytics_findings (kind, entity, window_end, v7, status, outcome, created_at, settled_at) VALUES ('rising', 'old-${i}', date('now','-20 days'), 30, 'settled', 'missed', datetime('now','-20 days'), datetime('now','-1 hours'))`);
run();
const v1 = Number(db.prepare("SELECT value FROM ops_config WHERE key = 'analytics_rise_min_views'").get().value);
ok(v1 === 25, "a threshold whose last settled findings all missed rises from 20 to 25", v1);
run(); run();
ok(Number(db.prepare("SELECT value FROM ops_config WHERE key = 'analytics_rise_min_views'").get().value) === 25, "the threshold does not compound on a re-run");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
