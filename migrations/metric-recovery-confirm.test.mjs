// METRIC-RECOVERY-CONFIRM-1 offline suite: applies migrations/2026-10-06-probe-templates.sql and then
// migrations/2026-10-13-metric-recovery-confirm.sql on an in-memory SQLite (schema copied from scripts/probe_templates_test.py)
// and proves: a METRIC-TRIGGER closing probe reads '0' in breach, 'recovering' on the first reading with hit = 0, and '1' only
// once a later refresh of the metric confirms the recovery; a relapse starts over; a metric with no refresh stamp needs the
// recovery to hold 50 minutes; new issues are born with the same probe (module probe-template-v1h); only integer ids reach the
// probe text; the backup holds the old probes; the fm-metric-close-flap detector counts flapping issues; a second apply changes
// nothing.
// Run: node migrations/metric-recovery-confirm.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const base = readFileSync(new URL("./2026-10-06-probe-templates.sql", import.meta.url), "utf8");
const sql = readFileSync(new URL("./2026-10-13-metric-recovery-confirm.sql", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const db = new DatabaseSync(":memory:");
db.exec(`CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
CREATE TABLE cloud_ops_events (id TEXT PRIMARY KEY, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE analytics_dash_meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE analytics_dash_records(metric TEXT PRIMARY KEY, value INTEGER);
CREATE TABLE analytics_metric_triggers(id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, title TEXT, source_table TEXT, operator TEXT, threshold REAL, priority INTEGER DEFAULT 5, action TEXT, owner TEXT, queue_target TEXT, cooldown_hours INTEGER DEFAULT 168, enabled INTEGER DEFAULT 1, notes TEXT, created_at TEXT DEFAULT (datetime('now')));
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT);
CREATE TABLE issue_lifecycle (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, event TEXT NOT NULL, from_status TEXT, to_status TEXT, has_evidence INTEGER, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE VIEW v_metric_trigger_state AS
WITH raw AS (
  SELECT t.id, t.metric_key, t.title, t.operator, t.threshold, t.owner, t.queue_target, t.priority,
    COALESCE(
      CASE WHEN t.source_table = 'records' THEN (SELECT CASE WHEN rtrim(trim(x.value), '% ') <> '' AND rtrim(trim(x.value), '% ') NOT GLOB '*[^0-9.+-]*' THEN CAST(rtrim(trim(x.value), '% ') AS REAL) END FROM analytics_dash_records x WHERE x.metric = t.metric_key) END,
      (SELECT CASE WHEN rtrim(trim(m.value), '% ') <> '' AND rtrim(trim(m.value), '% ') NOT GLOB '*[^0-9.+-]*' THEN CAST(rtrim(trim(m.value), '% ') AS REAL) END FROM analytics_dash_meta m WHERE m.key = t.metric_key),
      (SELECT CASE WHEN rtrim(trim(r.last_value), '% ') <> '' AND rtrim(trim(r.last_value), '% ') NOT GLOB '*[^0-9.+-]*' THEN CAST(rtrim(trim(r.last_value), '% ') AS REAL) END FROM metric_registry r WHERE r.metric = t.metric_key)
    ) AS val
  FROM analytics_metric_triggers t WHERE t.enabled = 1
)
SELECT id, metric_key, title, operator, threshold, owner, queue_target, priority, val,
  CASE WHEN val IS NULL THEN NULL
       WHEN operator = 'gt' THEN val > threshold
       WHEN operator = 'lte' THEN val <= threshold
       WHEN operator = 'lt' THEN val < threshold
       WHEN operator = 'eq' THEN val = threshold
       ELSE val >= threshold END AS hit
FROM raw;`);

const q = (s, ...a) => db.prepare(s).all(...a);
const issue = (title, status = "open") => Number(db.prepare("INSERT INTO agent_issues (title, status) VALUES (?, ?)").run(title, status).lastInsertRowid);
const placeholder = (iid) => db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, status) VALUES (?, ?, 'issue open', 'x', 'needs-machine-probe', 'needs-machine-probe', 'x', 'needs-machine-probe')").run("issue-" + iid, iid);
const contract = (iid) => q("SELECT status, verify_transport, verify_probe, module FROM remediation_contracts WHERE class = ?", "issue-" + iid)[0];
const probe = (iid) => { const r = db.prepare(contract(iid).verify_probe).get(); return r ? r.observed : null; };
// Records a verification the way both executors do (class, observed, verified_at in 'YYYY-MM-DD HH:MM:SS').
const verify = (iid, at) => { const o = probe(iid); db.prepare("INSERT INTO remediation_verifications (issue_id, class, transport, expected, observed, pass, verified_at) VALUES (?, ?, 'd1-query', '1', ?, ?, ?)").run(iid, "issue-" + iid, o, o === "1" ? 1 : 0, at); return o; };
const setMetric = (m, v, refreshed) => db.prepare("UPDATE metric_registry SET last_value = ?, last_refreshed = ? WHERE metric = ?").run(v, refreshed, m);

// Before: an open METRIC-TRIGGER issue templated by PROBE-TEMPLATES-1 (module probe-template-v1), and an unrelated contract.
db.exec("INSERT INTO analytics_metric_triggers (id, metric_key, operator, threshold) VALUES (404, 'social_engagement_rate_30d', 'lt', 0.2)");
db.exec("INSERT INTO metric_registry (metric, layer, kind, last_value, last_refreshed) VALUES ('social_engagement_rate_30d', 'fleet', 'leading', '0', '2026-10-13T09:00:00Z')");
const old = issue("METRIC-TRIGGER-404-SOCIAL-ENGAGEMENT-RATE-30D: Reach gap");
placeholder(old);
const other = issue("TWIN-NATIVE-TOOLS-1: a feature");
placeholder(other);
db.exec(base);
ok(contract(old).module === "probe-template-v1", "the old template applied first", contract(old));
const oldProbe = contract(old).verify_probe;

db.exec(sql);
const c = contract(old);
ok(c.module === "probe-template-v1h" && c.status === "active" && c.verify_transport === "d1-query", "the existing v1 contract is rewritten to probe-template-v1h", c);
ok(c.verify_probe.indexOf("id = 404)") > 0 && c.verify_probe.indexOf("class = 'issue-" + old + "'") > 0, "the rewritten probe names its trigger and its own contract by integer id");
ok(contract(other).status === "needs-machine-probe", "other families are untouched");
ok(q("SELECT verify_probe FROM bak_20261013_v1_probes WHERE class = ?", "issue-" + old)[0].verify_probe === oldProbe, "the backup holds the old probe text");

// The recovery has to be confirmed by a later refresh of the metric.
ok(verify(old, "2026-10-13 09:10:00") === "0", "breach (0 < 0.2) reads 0");
setMetric("social_engagement_rate_30d", "0.35", "2026-10-13T09:30:00Z");
ok(verify(old, "2026-10-13 09:40:00") === "recovering", "the first reading with hit = 0 reads recovering, not a pass");
ok(probe(old) === "recovering", "without a refresh after that reading it stays recovering");
setMetric("social_engagement_rate_30d", "0.36", "2026-10-13T10:30:00Z");
ok(verify(old, "2026-10-13 10:40:00") === "1", "a refresh after the recovering reading that still has hit = 0 passes");
ok(probe(old) === "1", "a passing contract keeps passing while hit = 0 (the post-close hold)");
setMetric("social_engagement_rate_30d", "0.1", "2026-10-13T11:30:00Z");
ok(verify(old, "2026-10-13 11:40:00") === "0", "a relapse reads 0");
setMetric("social_engagement_rate_30d", "0.5", "2026-10-13T12:30:00Z");
ok(verify(old, "2026-10-13 12:40:00") === "recovering", "after a relapse the recovery starts over");
setMetric("social_engagement_rate_30d", "n/a", "2026-10-13T13:30:00Z");
ok(probe(old) === "0", "an unmeasured value never passes");

// A metric with no refresh stamp: the recovery must hold 50 minutes.
db.exec("INSERT INTO analytics_metric_triggers (id, metric_key, operator, threshold) VALUES (395, 'ask_retrieval_mrr', 'lt', 0.3)");
db.exec("INSERT INTO metric_registry (metric, layer, kind, last_value) VALUES ('ask_retrieval_mrr', 'fleet', 'quality', '0.2969')");
const mt = issue("METRIC-TRIGGER-395-ASK-RETRIEVAL-MRR: quality gap");
placeholder(mt);
ok(contract(mt).module === "probe-template-v1h" && contract(mt).status === "active" && probe(mt) === "0", "a new METRIC-TRIGGER issue is born with the confirming probe", contract(mt));
db.exec("UPDATE metric_registry SET last_value = '0.95' WHERE metric = 'ask_retrieval_mrr'");
const recent = q("SELECT datetime('now', '-10 minutes') t")[0].t, older = q("SELECT datetime('now', '-70 minutes') t")[0].t;
ok(verify(mt, recent) === "recovering", "no refresh stamp: the first recovered reading is recovering");
ok(probe(mt) === "recovering", "no refresh stamp: a recovery 10 minutes old does not pass");
db.prepare("UPDATE remediation_verifications SET verified_at = ? WHERE class = ?").run(older, "issue-" + mt);
ok(probe(mt) === "1", "no refresh stamp: a recovery that held 70 minutes passes");

// Only the integer id reaches the probe text.
db.exec("INSERT INTO analytics_metric_triggers (id, metric_key, operator, threshold) VALUES (7, 'm7', 'gte', 5)");
const evil = issue("METRIC-TRIGGER-7'); DROP TABLE agent_issues; --: x");
placeholder(evil);
ok(contract(evil).status === "active" && contract(evil).verify_probe.indexOf("id = 7)") > 0 && contract(evil).verify_probe.indexOf("DROP") < 0, "only the integer trigger id reaches the probe text", contract(evil));
const evil2 = issue("METRIC-TRIGGER-x'); DROP TABLE agent_issues; -- [error]");
placeholder(evil2);
ok(contract(evil2).status === "needs-machine-probe", "a title without an integer id is never templated");
ok(q("SELECT COUNT(*) n FROM agent_issues")[0].n >= 5, "nothing was dropped");

// The failure-mode row and its detector.
ok(q("SELECT probe_class FROM failure_modes WHERE fm_key = 'metric-close-flap'")[0].probe_class === "fm-metric-close-flap", "the failure mode is recorded with its detector");
const det = () => db.prepare(q("SELECT verify_probe p FROM remediation_contracts WHERE class = 'fm-metric-close-flap'")[0].p).get();
ok(det().expected === "0" && det().observed === "0", "the detector reads 0 with no flapping issue", det());
for (let i = 0; i < 3; i++) db.prepare("INSERT INTO issue_lifecycle (issue_id, event) VALUES (?, 'reopened')").run(old);
db.prepare("INSERT INTO issue_lifecycle (issue_id, event) VALUES (?, 'reopened')").run(other);
ok(det().observed === "1", "three reopens of one METRIC-TRIGGER issue in 24 h read 1 (other families are not counted)", det());

// A second apply changes nothing.
const before = q("SELECT class, status, verify_probe, module FROM remediation_contracts ORDER BY class");
db.exec(sql);
const after = q("SELECT class, status, verify_probe, module FROM remediation_contracts ORDER BY class");
ok(JSON.stringify(before) === JSON.stringify(after), "applying the migration twice changes nothing");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
