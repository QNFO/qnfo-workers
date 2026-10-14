// SLA-120M-2 offline suite: applies migrations/2026-10-14-sla-120m-2.sql on an in-memory SQLite shaped like qnfo-audit and proves: the
// escalation fires at 120 minutes and repeats only after 120 minutes; issues_open_over_120m counts age_min >= 120 on every fleet_tick
// while issues_open_over_24h is still written; non-terminal content stages are capped at 120; the mttr triggers sit at 2 h and the 24 h
// issue trigger is disabled; the fm- detector reads 0 after the file and 1 before it; a second apply changes nothing.
// Run: node migrations/sla-120m-2.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-14-sla-120m-2.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
const nowMs = () => db.prepare("SELECT CAST(strftime('%s','now') AS INTEGER) * 1000 AS t").get().t;
db.exec(`CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT, kind TEXT, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
INSERT INTO metric_registry (metric, target) VALUES ('issues_open_over_24h', '0'), ('unverified_blocker_claims', '0'), ('mttr_h_7d', '<= 1 cycle'), ('issue_mttr_h_30d', '<= 48');
CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER, enabled INTEGER, notes TEXT);
INSERT INTO analytics_metric_triggers (metric_key, operator, threshold, enabled) VALUES ('issues_open_over_24h', 'gt', 0, 1), ('mttr_h_7d', 'gt', 24, 1), ('issue_mttr_h_30d', 'gt', 48, 1);
CREATE TABLE content_stages (stage TEXT PRIMARY KEY, ord INTEGER, label TEXT, definition TEXT, exit_gate TEXT, enforced_by TEXT, sla_min INTEGER, terminal INTEGER);
INSERT INTO content_stages (stage, ord, definition, sla_min, terminal) VALUES ('intake', 1, 'd', 120, 0), ('triage', 2, 'd', 1440, 0), ('revise', 3, 'd', 720, 0), ('published', 4, 'd', NULL, 1);
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE fleet_tick (id INTEGER PRIMARY KEY AUTOINCREMENT, source TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY, title TEXT, priority TEXT, status TEXT, created_at INTEGER, updated_at INTEGER);
CREATE TABLE issue_age_bumps (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, from_priority TEXT, to_priority TEXT, age_h INTEGER, ts TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE blocker_claims_src (x INTEGER); CREATE VIEW v_blocker_claims AS SELECT x FROM blocker_claims_src;
CREATE VIEW v_issue_age AS SELECT a.id, a.priority, a.title,
  CAST(((CAST(strftime('%s', 'now') AS INTEGER) * 1000) - a.created_at) / 60000 AS INTEGER) AS age_min,
  CAST(((CAST(strftime('%s', 'now') AS INTEGER) * 1000) - a.created_at) / 3600000 AS INTEGER) AS age_h,
  (SELECT MAX(b.ts) FROM issue_age_bumps b WHERE b.issue_id = a.id) AS last_bump
FROM agent_issues a WHERE a.status = 'open';
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (id INTEGER PRIMARY KEY AUTOINCREMENT, class TEXT UNIQUE, issue_id INTEGER, precondition TEXT, action TEXT, verify_probe TEXT, verify_transport TEXT, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, assumption TEXT, action TEXT, evidence TEXT, outcome TEXT, blast_radius TEXT, rollback_path TEXT, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT);
CREATE TRIGGER antifragile_tick_10m AFTER INSERT ON fleet_tick BEGIN SELECT 1; END;`);
const q = (s, ...a) => db.prepare(s).all(...a);
// The detector as written in the file, read back after apply; before apply the same check is computed inline.
const before = q("SELECT (SELECT COUNT(*) FROM content_stages WHERE COALESCE(terminal, 0) = 0 AND sla_min > 120) + (SELECT COUNT(*) FROM analytics_metric_triggers WHERE enabled = 1 AND ((metric_key IN ('mttr_h_7d', 'issue_mttr_h_30d') AND threshold > 2) OR metric_key = 'issues_open_over_24h')) AS n")[0].n;
ok(before > 0, "before the file the old thresholds are seen", before);
db.exec(sql);
const now = nowMs();
db.prepare("INSERT INTO agent_issues VALUES (1, 'old', 'medium', 'open', ?, ?), (2, 'fresh', 'low', 'open', ?, ?), (3, 'day', 'low', 'open', ?, ?)").run(now - 130 * 60000, now, now - 30 * 60000, now, now - 25 * 3600000, now);
db.exec("INSERT INTO fleet_tick (source) VALUES ('t')");
const pr = Object.fromEntries(q("SELECT id, priority FROM agent_issues").map((r) => [r.id, r.priority]));
ok(pr[1] === "high" && pr[2] === "low" && pr[3] === "medium", "escalation fires at 120 minutes, not for a 30-minute issue", pr);
ok(q("SELECT last_value v FROM metric_registry WHERE metric = 'issues_open_over_120m'")[0].v === "2", "issues_open_over_120m counts age_min >= 120");
ok(q("SELECT last_value v FROM metric_registry WHERE metric = 'issues_open_over_24h'")[0].v === "1", "issues_open_over_24h is still written for history");
db.exec("INSERT INTO fleet_tick (source) VALUES ('t')");
ok(q("SELECT priority p FROM agent_issues WHERE id = 3")[0].p === "medium" && q("SELECT COUNT(*) n FROM issue_age_bumps")[0].n === 2, "no second bump within 120 minutes");
db.exec("UPDATE issue_age_bumps SET ts = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-130 minutes')");
db.exec("INSERT INTO fleet_tick (source) VALUES ('t')");
ok(q("SELECT priority p FROM agent_issues WHERE id = 3")[0].p === "high", "a second bump after 120 minutes");
ok(q("SELECT COUNT(*) n FROM content_stages WHERE terminal = 0 AND sla_min > 120")[0].n === 0 && q("SELECT sla_min s FROM content_stages WHERE stage = 'published'")[0].s === null, "non-terminal stages capped, terminal untouched");
const t = Object.fromEntries(q("SELECT metric_key, threshold, enabled FROM analytics_metric_triggers").map((r) => [r.metric_key, r]));
ok(t.mttr_h_7d.threshold === 2 && t.issue_mttr_h_30d.threshold === 2 && t.issues_open_over_24h.enabled === 0 && t.issues_open_over_120m.enabled === 1 && t.issues_open_over_120m.threshold === 0, "triggers: mttr at 2 h, 24 h issue trigger off, 120 m trigger on", t);
const det = q(q("SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-sla-over-120m-outside-queue-sla'")[0].p)[0];
ok(det.expected === "0" && det.observed === "0", "the fm- detector reads 0 after the file", det);
ok(q("SELECT COUNT(*) n FROM bak_20261014_sla_120m_2 WHERE kind = 'trigger'")[0].n === 1 && q("SELECT COUNT(*) n FROM bak_20261014_sla_120m_2 WHERE kind = 'content_stage'")[0].n === 4, "the backup holds the old trigger and stages");
db.exec(sql);
ok(q("SELECT COUNT(*) n FROM analytics_metric_triggers WHERE metric_key = 'issues_open_over_120m'")[0].n === 1 && q("SELECT COUNT(*) n FROM decision_log")[0].n === 1 && q("SELECT COUNT(*) n FROM remediation_contracts")[0].n === 1, "idempotent");
console.log(`sla-120m-2: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
