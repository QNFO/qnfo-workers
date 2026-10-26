// METRIC-REFRESHER-CF-AGENT-1 offline suite (METRIC-UNMEASURED-1 issue 1000387; BREACH-DOCTOR-1 family METRIC, rule MD-5).
// Applies migrations/2026-10-26-cf-agent-metric-refresher.sql on SQLite (node:sqlite) over fixtures with the live column lists and the append-only decision_log triggers, and proves
//   1. the header (APPLY-BY ci, DB qnfo-audit, one single-line Rollback that never touches decision_log) and that apply_migrations.py --check accepts the file;
//   2. the refresher task and cron match the working siblings (same step shape, */10, enabled) and the one-statement UPDATE writes the view's over_120m for exactly the cf-agent metric;
//   3. the first reading is taken in the migration, only while the metric has never been read, and a replay changes nothing (including the decision row);
//   4. the detector contract fm-metric-view-never-refreshed (d1-query, no semicolon) reads 1 before the apply, 0 after, 1 again for a new view-sourced metric nobody refreshes, and 0 for
//      free-text sources, refreshed metrics and metrics already measured;
//   5. the Rollback disables the cron and the task, removes the detector and the failure mode, and leaves the decision row.
// Run: node --no-warnings migrations/cf-agent-metric-refresher.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const norm = (t) => t.replace(/\r\n/g, "\n");
const FILE = join(here, "2026-10-26-cf-agent-metric-refresher.sql");
const sql = norm(readFileSync(FILE, "utf8"));
const sibling = norm(readFileSync(join(here, "2026-10-25-personal-invite-reminders.sql"), "utf8"));
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
const body = lines.filter((l) => !l.startsWith("--")).join("\n");
const rollback = hdr("Rollback");
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit", "the file opts in with APPLY-BY: ci and DB: qnfo-audit");
ok(lines.filter((l) => /^-- Rollback: /.test(l)).length === 1 && rollback.length > 100, "one single-line Rollback");
ok(!/decision_log/i.test(rollback), "the Rollback never touches decision_log (append-only)");
ok(!/\bDELETE\b|\bDROP\b/i.test(body) && hdr("BACKUP") === "", "the body has no DELETE or DROP, so no BACKUP header is needed");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/skip[ -]ci/i.test(sql), "no claude.ai link and no skip-CI token");
ok(/decision_log is append-only/.test(sql), "the file says why the Rollback leaves the decision row");

const PY = ["python3", "python"].find((c) => spawnSync(c, ["-I", "-c", "print(1)"], { encoding: "utf8" }).status === 0);
if (PY) {
  const chk = spawnSync(PY, [join(root, "scripts", "apply_migrations.py"), "--check", FILE], { encoding: "utf8" });
  ok(chk.status === 0, "apply_migrations.py --check accepts the file", String(chk.stdout) + String(chk.stderr));
}

// the sibling that works: same workflow shape (one sql step on AUDIT), same cadence
ok(/'\*\/10 \* \* \* \*'/.test(sibling) && /\*\/10 \* \* \* \*/.test(sql), "the cron cadence matches the working sibling (every 10 minutes)");
ok(/json_object\('steps', ?json_array\(json_object\('name', ?'measure', ?'type', ?'sql', ?'db', ?'AUDIT'/.test(sibling.replace(/\s+/g, " ")) && /json_object\('steps', json_array\(json_object\('name', 'measure', 'type', 'sql', 'db', 'AUDIT'/.test(sql.replace(/\s+/g, " ")), "the task has the sibling's single measure step on AUDIT");

const DDL = `
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, definition TEXT NOT NULL, timeout_ms INTEGER NOT NULL DEFAULT 30000, retries INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT);
CREATE TABLE fleet_crons (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL UNIQUE, cron_expr TEXT NOT NULL, task_id TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, timezone TEXT NOT NULL DEFAULT 'UTC', last_fired TEXT, next_fire TEXT, updated_at TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, layer TEXT NOT NULL, kind TEXT NOT NULL, formula TEXT, source_of_truth TEXT, baseline TEXT, target TEXT, owner TEXT, disposition_actor TEXT, refresh_cadence TEXT, warning_band TEXT, kill_band TEXT, last_value TEXT, last_refreshed TEXT, state TEXT, refresh_class TEXT);
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL,
  capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TABLE cf_agent_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, requester TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE VIEW v_cf_agent_requests_health AS
SELECT COUNT(*) AS open_n,
  COALESCE(SUM(CASE WHEN (julianday('now') - julianday(created_at)) * 1440 > 120 THEN 1 ELSE 0 END), 0) AS over_120m,
  COALESCE(CAST(MAX((julianday('now') - julianday(created_at)) * 1440) AS INTEGER), 0) AS oldest_min
FROM cf_agent_requests WHERE status IN ('queued', 'running');
INSERT INTO metric_registry (metric, layer, kind, formula, source_of_truth, target, owner, disposition_actor, refresh_cadence, state)
VALUES ('cf_agent_requests_over_120m', 'operational', 'guard', 'cf_agent_requests rows queued or running more than 120 minutes after they were written', 'v_cf_agent_requests_health', '0', 'qnfo-agents', 'qnfo-agents:drainRequests', '10m', 'UNMEASURED');
`;
const q = (db, s, ...a) => db.prepare(s).all(...a);
const one = (db, s, ...a) => db.prepare(s).get(...a);
const world = () => { const db = new DatabaseSync(":memory:"); db.exec(DDL); return db; };
const snap = (db) => JSON.stringify(["fleet_tasks", "fleet_crons", "metric_registry", "failure_modes", "remediation_contracts", "decision_log"].map((t) => q(db, "SELECT * FROM " + t + " ORDER BY 1")));
const probeSql = (db) => one(db, "SELECT verify_probe AS p FROM remediation_contracts WHERE class = 'fm-metric-view-never-refreshed'").p;

// ---- before the apply: the defect (the metric has no reading) ----
let db = world();
const pre = one(db, "SELECT last_value, last_refreshed, state FROM metric_registry WHERE metric = 'cf_agent_requests_over_120m'");
ok(pre.last_value === null && pre.last_refreshed === null && pre.state === "UNMEASURED", "before the apply the metric has no value and no refresh time (the live defect)", pre);

// ---- apply ----
db.exec(sql);
const task = one(db, "SELECT * FROM fleet_tasks WHERE id = 'cf-agent-requests-monitor'");
ok(task && task.type === "workflow" && task.enabled === 1 && task.timeout_ms === 30000, "the task is an enabled workflow", task && { t: task.type, e: task.enabled });
const def = JSON.parse(task.definition);
ok(def.steps.length === 1 && def.steps[0].type === "sql" && def.steps[0].db === "AUDIT" && def.steps[0].name === "measure", "one sql step on AUDIT named measure", def);
const cron = one(db, "SELECT * FROM fleet_crons WHERE name = 'cf-agent-requests-monitor-10m'");
ok(cron && cron.cron_expr === "*/10 * * * *" && cron.task_id === "cf-agent-requests-monitor" && cron.enabled === 1 && cron.timezone === "UTC", "the cron runs the task every 10 minutes", cron);
const m = one(db, "SELECT * FROM metric_registry WHERE metric = 'cf_agent_requests_over_120m'");
ok(m.state === "MEASURED" && m.last_value === "0" && m.last_refreshed !== null, "the first reading is taken in the migration: MEASURED with the view's over_120m", m);
ok(q(db, "SELECT * FROM decision_log").length === 1, "one decision row");

// ---- the task's statement writes the right metric from the view ----
const stmt = def.steps[0].sql;
ok(!stmt.includes(";") && /^UPDATE metric_registry SET /.test(stmt) && /WHERE metric = 'cf_agent_requests_over_120m'$/.test(stmt), "the step is one UPDATE bound to exactly this metric", stmt);
db.prepare("INSERT INTO metric_registry (metric, layer, kind, source_of_truth, state, last_value) VALUES ('other_metric', 'operational', 'guard', 'v_other', 'MEASURED', '7')").run();
db.prepare("INSERT INTO cf_agent_requests (requester, status, created_at) VALUES ('t', 'queued', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-3 hours'))").run();
db.prepare("INSERT INTO cf_agent_requests (requester, status, created_at) VALUES ('t', 'running', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 minutes'))").run();
db.prepare("INSERT INTO cf_agent_requests (requester, status, created_at) VALUES ('t', 'done', strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-9 hours'))").run();
db.exec(stmt);
ok(one(db, "SELECT last_value AS v FROM metric_registry WHERE metric = 'cf_agent_requests_over_120m'").v === "1", "one queued request older than 120 minutes reads 1 (a running one at 30 minutes and a done one do not count)");
ok(one(db, "SELECT last_value AS v FROM metric_registry WHERE metric = 'other_metric'").v === "7", "no other metric is touched");

// ---- replay: nothing changes, including the decision row and a later reading ----
const before = snap(db);
db.exec(sql);
ok(snap(db) === before, "a replay changes nothing (the first-reading UPDATE is guarded by last_refreshed IS NULL; the decision row is guarded)");

// ---- the detector ----
db = world();
let p0 = (() => { const t = world(); t.exec(sql); return probeSql(t); })();
ok(!p0.includes(";") && /^SELECT/.test(p0), "the probe is a single SELECT without a semicolon");
const c = one((() => { const t = world(); t.exec(sql); return t; })(), "SELECT * FROM remediation_contracts WHERE class = 'fm-metric-view-never-refreshed'");
ok(c && c.verify_transport === "d1-query" && c.status === "active" && c.module === "failure-mode" && c.issue_id === null, "the detector is an active d1-query failure-mode contract with no issue", c && { t: c.verify_transport, s: c.status });
const fm = q((() => { const t = world(); t.exec(sql); return t; })(), "SELECT * FROM failure_modes");
ok(fm.length === 1 && fm[0].fm_key === "metric-view-never-refreshed" && fm[0].issue_id === 1000387 && fm[0].probe_class === "fm-metric-view-never-refreshed", "one failure mode on issue 1000387 naming its detector class", fm.map((r) => r.fm_key));
// the detector as written in the migration, run on the world BEFORE the apply (the live state) must read 1
const probeText = (() => { const t = world(); t.exec(sql); return probeSql(t); })();
ok(one(db, probeText).observed === "1" && one(db, probeText).expected === "0", "before the apply the detector reads 1 (the cf-agent metric)", one(db, probeText));
db.exec(sql);
ok(one(db, probeText).observed === "0", "after the apply the detector reads 0", one(db, probeText));
db.prepare("INSERT INTO metric_registry (metric, layer, kind, source_of_truth, state) VALUES ('new_guard_over_120m', 'operational', 'guard', 'v_new_guard_health', 'UNMEASURED')").run();
ok(one(db, probeText).observed === "1", "a new view-sourced metric nobody refreshes is found (1)", one(db, probeText));
db.prepare("INSERT INTO metric_registry (metric, layer, kind, source_of_truth, state) VALUES ('http_source', 'operational', 'guard', 'https://q08.org/api/metrics', 'UNMEASURED')").run();
db.prepare("INSERT INTO metric_registry (metric, layer, kind, source_of_truth, state) VALUES ('prose_source', 'operational', 'guard', 'v_x joined with v_y', 'UNMEASURED')").run();
ok(one(db, probeText).observed === "1", "a URL source and a free-text source are not counted");
db.prepare("UPDATE metric_registry SET last_refreshed = datetime('now'), state = 'MEASURED' WHERE metric = 'new_guard_over_120m'").run();
ok(one(db, probeText).observed === "0", "once the new metric is refreshed the detector reads 0 again");

// ---- rollback ----
db = world();
db.exec(sql);
db.exec(rollback);
ok(one(db, "SELECT enabled AS e FROM fleet_crons WHERE name = 'cf-agent-requests-monitor-10m'").e === 0 && one(db, "SELECT enabled AS e FROM fleet_tasks WHERE id = 'cf-agent-requests-monitor'").e === 0, "the Rollback disables the cron and the task");
ok(q(db, "SELECT * FROM failure_modes").length === 0 && q(db, "SELECT * FROM remediation_contracts").length === 0, "the Rollback removes the failure mode and the detector");
ok(q(db, "SELECT * FROM decision_log").length === 1, "the Rollback leaves the decision row");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
