// SLA-120M-7 offline suite: runs migrations/2026-10-14-sla-120m-7-cadence-overdue.sql on SQLite. Proves: v_cadence_overdue reads each
// producer's lateness in minutes (reading.q08.org due at the first generation slot after its last piece, the others at last + interval),
// over_sla only past 120 minutes; cadence_sla refuses an SLA above 120 or off the 10-minute grid; every fleet_tick refreshes
// cadence_overdue_over_120m and the publish ages (no hourly gate); v_sla_over_120m adds the late producers to its total and the
// fm-view-alias-capture probe still sums the total; the five hour/day alarms are disabled, deploy_freshness_h fires at 2 h, the new
// trigger exists once; the definitions metric counts an alarm re-enabled on a superseded hour metric; the detector passes; re-applying
// the file changes nothing; the backup holds what the file replaced.
// Run: node migrations/sla-120m-7.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-14-sla-120m-7-cadence-overdue.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
const iso = (minAgo) => new Date(Date.now() - minAgo * 6e4).toISOString();
const OLD_PROBE = "SELECT '1' AS expected, CASE WHEN total_over_120m = issues_open_over_120m + research_review_error + research_head_stalled + research_queued_180m + intents_pending + outreach_waiting + code_tasks_stalled + issues_without_doer_3h + zenodo_exit_pending_stalled + research_held_over_sla + triage_gap + contracts_cadence_drift + code_tasks_queued_over_120m + predictions_unscored_over_sla + doctrine_proposals_waiting + content_items_over_sla + research_claims_over_120m AND issues_open_over_120m = (SELECT COUNT(*) FROM v_issue_age WHERE age_min > 120) THEN '1' ELSE '0' END AS observed FROM v_sla_over_120m";
db.exec(`CREATE TABLE analytics_metric_triggers(id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, ts TEXT, module TEXT, budget_ms INTEGER, max_items INTEGER, requires_container INTEGER, attempts INTEGER);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), source TEXT NOT NULL);
CREATE TABLE research_queue (id INTEGER PRIMARY KEY, status TEXT, claimed_at TEXT, published_at TEXT, created_at TEXT);
CREATE TABLE idea_proposals (id INTEGER PRIMARY KEY, created_at TEXT);
CREATE TABLE social_media_posts (id INTEGER PRIMARY KEY, status TEXT, published_at TEXT);
CREATE TABLE cf_changelog_runs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, status TEXT);
CREATE TABLE continuity_snapshots (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, ok INTEGER);
CREATE TABLE queue_sla (stuck_type TEXT PRIMARY KEY, cycle_min INTEGER, sla_min INTEGER, producer_cycle_min INTEGER);
CREATE TABLE content_stages (stage TEXT PRIMARY KEY, sla_min INTEGER);
CREATE TABLE sla_registry (sla_id TEXT PRIMARY KEY, window TEXT);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, status TEXT, created_at TEXT);
CREATE TABLE open_issue_ages (id INTEGER PRIMARY KEY, age_min INTEGER);
CREATE TABLE content_items (id INTEGER PRIMARY KEY, over_sla INTEGER);
CREATE VIEW v_issue_age AS SELECT id, age_min FROM open_issue_ages;
CREATE VIEW v_content_pipeline AS SELECT id, over_sla FROM content_items;
CREATE VIEW v_stuck_summary AS SELECT 0 AS research_review_error, 0 AS research_head_stalled, 1 AS research_queued_180m, 0 AS intents_pending, 0 AS outreach_waiting,
  0 AS code_tasks_stalled, 2 AS issues_unprobed_60m, 0 AS issues_without_doer_3h, 0 AS zenodo_exit_pending_stalled, 0 AS research_held_over_sla, 0 AS triage_gap,
  0 AS contracts_cadence_drift, 0 AS code_tasks_queued_oldest_min;
CREATE VIEW v_stuck_summary_kernel AS SELECT 0 AS predictions_unscored_over_sla, 0 AS doctrine_proposals_waiting, 0 AS tick_steps_missed_last_slot;
CREATE VIEW v_sla_over_120m AS SELECT 1 AS total_over_120m;
CREATE TRIGGER publish_freshness_tick AFTER INSERT ON fleet_tick WHEN strftime('%M', 'now') < '10' BEGIN SELECT 1; END;
CREATE TRIGGER sla_definitions_120_tick AFTER INSERT ON fleet_tick BEGIN SELECT 1; END;`);
db.prepare("INSERT INTO remediation_contracts (class, verify_probe, verify_transport, status) VALUES ('fm-view-alias-capture', ?, 'd1-query', 'active')").run(OLD_PROBE);
for (const m of ["papers_hours_since_last_publish", "ideas_hours_since_last_proposal", "social_hours_since_last_post", "sla_breaches_over_120m", "sla_definitions_over_120m"]) {
  db.prepare("INSERT INTO metric_registry (metric, formula, refresh_cadence) VALUES (?, 'base', '1h')").run(m);
}
// the companion's last piece: 2026-10-10 04:05:04 (written as hours since, at its refresh time)
db.prepare("INSERT INTO metric_registry (metric, last_value, last_refreshed) VALUES ('companion_hours_since_last_piece', '1.0', '2026-10-10T05:05:04Z')").run();
db.prepare("INSERT INTO metric_registry (metric, last_value, last_refreshed) VALUES ('q08_hours_since_last_piece', '0.5', ?)").run(iso(10));
const trig = [["papers_hours_since_last_publish", 48], ["ideas_hours_since_last_proposal", 24], ["social_hours_since_last_post", 168], ["cf_changelog_audit_age_h", 48], ["continuity_snapshot_age_h", 26], ["deploy_freshness_h", 6]];
for (const [k, t] of trig) db.prepare("INSERT INTO analytics_metric_triggers (metric_key, operator, threshold, cooldown_hours, enabled, notes) VALUES (?, 'gt', ?, 2, 1, 'n')").run(k, t);
db.prepare("INSERT INTO research_queue (id, status, published_at) VALUES (1, 'published', ?)").run(iso(60));
db.prepare("INSERT INTO idea_proposals (id, created_at) VALUES (1, ?)").run(iso(200));
db.prepare("INSERT INTO social_media_posts (id, status, published_at) VALUES (1, 'published', ?), (2, 'queued', ?)").run(iso(3000), iso(1));
db.prepare("INSERT INTO cf_changelog_runs (ts, status) VALUES (?, 'ok'), (?, 'error')").run(iso(900), iso(5));
db.prepare("INSERT INTO continuity_snapshots (ts, ok) VALUES (?, 1), (?, 0)").run(iso(1500), iso(30));
db.exec("INSERT INTO open_issue_ages VALUES (1, 300), (2, 30); INSERT INTO content_items VALUES (1, 1), (2, 0);");

db.exec(sql);
const q = (s, ...a) => db.prepare(s).all(...a);
const one = (s, ...a) => db.prepare(s).get(...a);
const co = Object.fromEntries(q("SELECT * FROM v_cadence_overdue").map((r) => [r.surface, r]));
ok(Object.keys(co).length === 7, "seven producers are measured", Object.keys(co));
ok(co["reading.q08.org"].last_at === "2026-10-10T04:05:04Z" && co["reading.q08.org"].due_at === "2026-10-10T08:00:00Z" && co["reading.q08.org"].over_sla === 1, "reading.q08.org: last piece read from the hours metric, due at the next generation slot (08:00), over the SLA", co["reading.q08.org"]);
ok(co["q08.org"].over_sla === 0 && co["q08.org"].overdue_min === 0 && co["q08.org"].age_min >= 39 && co["q08.org"].age_min <= 41, "q08.org: 40 minutes since its last piece, not due for 8 hours", co["q08.org"]);
ok(co["papers.qnfo.org"].over_sla === 0 && co["papers.qnfo.org"].age_min >= 59 && co["papers.qnfo.org"].age_min <= 61, "papers: published an hour ago, not late", co["papers.qnfo.org"]);
ok(co["ideas.qnfo.org"].over_sla === 1 && co["ideas.qnfo.org"].overdue_min >= 139 && co["ideas.qnfo.org"].overdue_min <= 141, "ideas: 200 minutes since the last proposal on a 60-minute interval is 140 minutes late, over the SLA", co["ideas.qnfo.org"]);
ok(co["social"].over_sla === 0 && co["social"].age_min >= 2999, "social: 50 hours on the owner's weekly cadence is not late; a queued post does not count as published", co["social"]);
ok(co["cf-changelog"].over_sla === 0 && co["cf-changelog"].age_min >= 899 && co["cf-changelog"].age_min <= 901, "cf-changelog: the last ok run counts, an error run does not", co["cf-changelog"]);
ok(co["continuity-snapshot"].over_sla === 0 && co["continuity-snapshot"].overdue_min >= 59 && co["continuity-snapshot"].overdue_min <= 61, "continuity: 60 minutes past its daily due time is late but inside the 120-minute SLA", co["continuity-snapshot"]);

// generation-slot arithmetic
const slot = (lastIso) => { db.prepare("UPDATE metric_registry SET last_value = '0', last_refreshed = ? WHERE metric = 'companion_hours_since_last_piece'").run(lastIso); return one("SELECT due_at FROM v_cadence_overdue WHERE surface = 'reading.q08.org'").due_at; };
ok(slot("2026-10-10T21:30:00Z") === "2026-10-11T04:00:00Z", "a piece after 20:00 is next due at 04:00 the next day");
ok(slot("2026-10-10T02:00:00Z") === "2026-10-10T04:00:00Z", "a piece before 04:00 is due at 04:00 the same day");
ok(slot("2026-10-10T16:00:30Z") === "2026-10-10T20:00:00Z", "a piece in the 16:00 slot is next due at 20:00");
db.prepare("UPDATE metric_registry SET last_value = 'n/a', last_refreshed = ? WHERE metric = 'companion_hours_since_last_piece'").run(iso(1));
ok(one("SELECT over_sla, due_at FROM v_cadence_overdue WHERE surface = 'reading.q08.org'").due_at === null, "a non-numeric metric is unmeasured, not a breach");
db.prepare("UPDATE metric_registry SET last_value = '99.1', last_refreshed = ? WHERE metric = 'companion_hours_since_last_piece'").run(iso(0));

// the table refuses an SLA above 120 or off the grid
let refused = 0;
for (const bad of [180, 125]) { try { db.prepare("INSERT INTO cadence_sla (surface, producer, interval_min, sla_min) VALUES (?, 'x', 60, ?)").run("bad" + bad, bad); } catch (e) { refused++; } }
ok(refused === 2, "cadence_sla refuses sla_min 180 and 125");

// every tick refreshes the count and the publish ages
db.exec("INSERT INTO fleet_tick (source) VALUES ('test')");
const reg = Object.fromEntries(q("SELECT metric, last_value, refresh_cadence FROM metric_registry").map((r) => [r.metric, r]));
ok(reg.cadence_overdue_over_120m.last_value === "2", "cadence_overdue_over_120m counts reading.q08.org and ideas", reg.cadence_overdue_over_120m);
ok(reg.papers_hours_since_last_publish.last_value === "1.0" && reg.papers_hours_since_last_publish.refresh_cadence === "10m", "papers age refreshed on the tick, cadence 10m", reg.papers_hours_since_last_publish);
ok(!/WHEN strftime\('%M'/.test(one("SELECT sql FROM sqlite_master WHERE name = 'publish_freshness_tick'").sql), "publish_freshness_tick has no hourly gate");
ok(reg.sla_definitions_over_120m.last_value === "0", "the definitions metric reads 0 after the file", reg.sla_definitions_over_120m);

// the master view and its alias detector
const v = one("SELECT * FROM v_sla_over_120m");
ok(v.cadence_overdue_over_120m === 2 && v.total_over_120m === 1 + 1 + 1 + 2, "v_sla_over_120m adds the late producers to its total (1 issue + 1 content item + 1 research + 2 producers)", v);
const probe = one("SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-view-alias-capture'").p;
ok(/research_claims_over_120m \+ cadence_overdue_over_120m AND/.test(probe), "the alias detector sums the new column");
const pr = one(probe);
ok(pr.observed === pr.expected, "the alias detector passes on the new view", pr);
ok(one(OLD_PROBE).observed === "0", "the old probe text would have failed on the new view (why it is updated)");

// alarms
const tg = Object.fromEntries(q("SELECT metric_key, enabled, threshold FROM analytics_metric_triggers").map((r) => [r.metric_key, r]));
ok(["papers_hours_since_last_publish", "ideas_hours_since_last_proposal", "social_hours_since_last_post", "cf_changelog_audit_age_h", "continuity_snapshot_age_h"].every((k) => tg[k].enabled === 0), "the five hour/day alarms are disabled", tg);
ok(tg.deploy_freshness_h.enabled === 1 && tg.deploy_freshness_h.threshold === 2, "deploy_freshness_h fires at 2 h (120 minutes)", tg.deploy_freshness_h);
const nt = one("SELECT * FROM analytics_metric_triggers WHERE metric_key = 'cadence_overdue_over_120m'");
ok(nt && nt.enabled === 1 && nt.operator === "gt" && nt.threshold === 0 && nt.cooldown_hours === 2 && /v_cadence_overdue/.test(nt.action) && /2552/.test(nt.action), "the new trigger fires above 0 with a 2 h cooldown and names each producer's lever", nt);

// the detector, and a guard escape
const fm = one("SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-producer-lateness-in-hours'").p;
let r = one(fm);
ok(r.observed === r.expected, "fm-producer-lateness-in-hours passes after the file and one tick", r);
db.exec("UPDATE analytics_metric_triggers SET enabled = 1 WHERE metric_key = 'ideas_hours_since_last_proposal'; INSERT INTO fleet_tick (source) VALUES ('test2');");
ok(one("SELECT last_value v FROM metric_registry WHERE metric = 'sla_definitions_over_120m'").v === "1" && one(fm).observed === "1", "an alarm re-enabled on a superseded hour metric is counted and fails the detector");
db.exec("UPDATE analytics_metric_triggers SET enabled = 0 WHERE metric_key = 'ideas_hours_since_last_proposal'");

// backup and idempotence
const bk = q("SELECT kind, COUNT(*) n FROM bak_20261014_sla_120m_7 GROUP BY kind").reduce((a, x) => (a[x.kind] = x.n, a), {});
ok(bk.trigger === 6 && bk.sql === 3 && bk.probe === 1 && bk.metric === 3, "the backup holds 6 alarms, 3 definitions, the probe and 3 cadences", bk);
ok(one("SELECT v2 FROM bak_20261014_sla_120m_7 WHERE kind = 'trigger' AND k = 'deploy_freshness_h'").v2 === "6.0" && /WHEN strftime\('%M'/.test(one("SELECT sql FROM bak_20261014_sla_120m_7 WHERE k = 'publish_freshness_tick'").sql), "the backup holds the old threshold and the old gated trigger");
const notesBefore = one("SELECT notes FROM analytics_metric_triggers WHERE metric_key = 'papers_hours_since_last_publish'").notes;
db.exec(sql);
ok(one("SELECT COUNT(*) n FROM decision_log WHERE instr(action, 'SLA-120M-7:') = 1").n === 1 && one("SELECT COUNT(*) n FROM analytics_metric_triggers WHERE metric_key = 'cadence_overdue_over_120m'").n === 1, "re-applying adds no second decision or trigger");
ok(one("SELECT notes FROM analytics_metric_triggers WHERE metric_key = 'papers_hours_since_last_publish'").notes === notesBefore && one("SELECT COUNT(*) n FROM cadence_sla").n === 7, "re-applying appends no second note and no cadence row");
ok(/research_claims_over_120m \+ cadence_overdue_over_120m AND/.test(one("SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-view-alias-capture'").p) && !/cadence_overdue_over_120m \+ cadence_overdue_over_120m/.test(one("SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-view-alias-capture'").p), "re-applying does not add the column to the probe twice");
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
