// CONTROL-ALT-PROBES-4 offline suite for migrations/2026-10-26-control-alternate-probes4.sql (agent_issues 1000214, CHAOS-DRILL-FAILED-1: control:control-alternate-probes).
// 18 controls registered in the last day have an alternate_path and no control_alternate_probes row, so v_control_alternate_untested.controls_untested_without_probe reads 18 and the probe of the
// control control-alternate-probes fails. The migration gives each one a read-only probe in the chaosJudge shape. This suite runs on node:sqlite over a fixture of the live schemas and proves:
//   1. the 18 rows exist, are enabled, are a single SELECT of the expected/observed shape with no write word, no semicolon, no e-mail address, and the view count goes 18 -> 0 with no date written;
//   2. every probe reads ok on the good fixture, judged by the real chaosJudge sliced from qnfo-fleet-control/worker.js, and changes nothing (read-only);
//   3. every clause of every probe FAILS, with its own reason text, when the thing it reads is broken, one broken fixture per clause (the probes cannot pass by being empty), and still passes on
//      the boundary and exemption cases that must stay ok (a value at the edge of its range, a read of a banned table that is not a write, an older filter of another family, a closed issue);
//   4. a drill simulated in miniature stamps the 18 controls on a pass, flips exactly one to probe-failing when one lever is broken, and never stamps a control whose probe fails;
//   5. the evidence note is appended once, the backup table holds the 18 original texts, one decision row, a second apply changes nothing, the Rollback line restores the 18 registry rows without the backup.
// Run: node --no-warnings migrations/control-alternate-probes4.test.mjs   -> prints "N passed, 0 failed"
// Mutation checks: CAP4_MIGRATION points the suite at a mutated copy of the migration.
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const here = (f) => new URL("./" + f, import.meta.url);
const sql = readFileSync(process.env.CAP4_MIGRATION ? resolve(process.env.CAP4_MIGRATION) : here("2026-10-26-control-alternate-probes4.sql"), "utf8");
const first = readFileSync(here("2026-10-19-control-alternate-probes.sql"), "utf8");
const fleetSrc = readFileSync(here("../qnfo-fleet-control/worker.js"), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 500))); } };
const rollback = /^-- Rollback: (.*)$/m.exec(sql)[1];
const code = sql.replace(/^--.*$/gm, "");

const A = fleetSrc.indexOf("// ---- CHAOS-DRILL-1:BEGIN"), B = fleetSrc.indexOf("// ---- CHAOS-DRILL-1:END ----");
ok(A > 0 && B > A, "chaos drill block markers present in qnfo-fleet-control/worker.js");
let block = fleetSrc.slice(A, B); block = block.slice(0, block.indexOf("async function chaosExercise("));
const { chaosJudge } = new Function("__name", block + "\nreturn { chaosJudge };")(function () {});

const NAMES = ["research-repo-archive-gate", "research-repo-sync-switches", "breach-doctor-caps", "breach-doctor-taint-guard", "breach-doctor-action-allowlist", "breach-doctor-gap-measure", "breach-doctor-gap-caps", "breach-doctor-own-issue-guard", "breach-doctor-strike-cap", "email-filter-journal-pitch-senders", "dash-owner-decision-session-gate", "breach-doctor-auto-demotion", "breach-doctor-age-gate", "breach-doctor-tool-exclusion-rule", "breach-doctor-secret-change-measure", "breach-doctor-rearm-capacity", "metric-playbook-recovery-hold", "pn-r2-filer-quiet-gate"];
const AT = String.fromCharCode(64); // no literal address in this file
const NOW = Date.now();
const iso = (minAgo) => new Date(NOW - minAgo * 6e4).toISOString().replace(/\.\d+Z$/, "Z");
const isoMs = (minAgo) => new Date(NOW - minAgo * 6e4).toISOString();
const msAgo = (minAgo) => NOW - minAgo * 6e4;

// the live views of the first migration, taken from its text (CREATE VIEW IF NOT EXISTS ... ;)
const viewSql = (name) => { const m = new RegExp("CREATE VIEW IF NOT EXISTS " + name + " AS[\\s\\S]*?;\\n").exec(first); if (!m) throw new Error("view " + name + " not found"); return m[0]; };

const SCHEMA = `
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL, guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL, disposition_state TEXT NOT NULL DEFAULT 'planned', alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE control_alternate_probes (control TEXT PRIMARY KEY, probe_sql TEXT NOT NULL, window_note TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT, last_pass INTEGER, last_pass_at TEXT, last_observed TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE ops_config (key TEXT PRIMARY KEY, value TEXT, note TEXT, updated_at TEXT);
CREATE TABLE portfolio_actions (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, repo TEXT, action TEXT, status TEXT, detail TEXT);
CREATE TABLE research_run_ledger (run_id TEXT PRIMARY KEY, repo TEXT, status TEXT);
CREATE TABLE cloud_ops_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, kind TEXT, text TEXT, meta TEXT, job TEXT, status TEXT);
CREATE TABLE breach_diagnosis_events (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), issue_id INTEGER, diagnosis_id INTEGER, event TEXT NOT NULL, detail TEXT);
CREATE TABLE breach_playbooks (rule_id TEXT PRIMARY KEY, version INTEGER NOT NULL DEFAULT 1, family TEXT NOT NULL DEFAULT 'f', cause_class TEXT NOT NULL DEFAULT 'c', action_kind TEXT NOT NULL DEFAULT 'sql' CHECK (action_kind IN ('sql', 'file-issue', 'owner-card')), trigger_sql TEXT NOT NULL DEFAULT 'SELECT 1', action_sql TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(action_sql)), revert_sql TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(revert_sql)), verify_sql TEXT NOT NULL DEFAULT 'SELECT 1', max_per_tick INTEGER NOT NULL DEFAULT 3, max_per_day INTEGER NOT NULL DEFAULT 12, enabled INTEGER NOT NULL DEFAULT 1, mode TEXT NOT NULL DEFAULT 'measure' CHECK (mode IN ('measure', 'on')), note TEXT);
CREATE TABLE breach_diagnoses (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER NOT NULL, case_key TEXT NOT NULL DEFAULT 'k', family TEXT NOT NULL DEFAULT 'f', rule_id TEXT NOT NULL, cause_class TEXT NOT NULL DEFAULT 'c', state TEXT NOT NULL DEFAULT 'diagnosed' CHECK (state IN ('diagnosed', 'queued', 'applied', 'verifying', 'verified', 'failed', 'reverted', 'handed-owner', 'superseded')), mode TEXT NOT NULL DEFAULT 'on' CHECK (mode IN ('measure', 'on')), opened_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), last_progress_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), lease_until TEXT);
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT, priority TEXT, status TEXT DEFAULT 'open', created_at INTEGER, updated_at INTEGER);
CREATE TABLE email_filters (id INTEGER PRIMARY KEY, rule_type TEXT DEFAULT 'filter', field TEXT NOT NULL, pattern TEXT NOT NULL, action TEXT NOT NULL DEFAULT 'accept', reply_template TEXT, priority INTEGER DEFAULT 0, enabled BOOLEAN DEFAULT 1);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, status TEXT, last_verdict TEXT);
CREATE TABLE metric_registry (metric TEXT PRIMARY KEY, last_value TEXT, last_refreshed TEXT);
CREATE TABLE analytics_metric_triggers (id INTEGER PRIMARY KEY AUTOINCREMENT, metric_key TEXT UNIQUE, enabled INTEGER DEFAULT 1);
CREATE TABLE analytics_action_log (id INTEGER PRIMARY KEY AUTOINCREMENT, trigger_id INTEGER, status TEXT, fired_at TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE VIEW v_breach_doctor_status AS SELECT 'on' AS mode, 0 AS unclassified_cases, 0 AS gap_families, '' AS gap_by_family;
CREATE VIEW tool_failures_excluded_24h AS SELECT 'x' AS tool;
CREATE VIEW v_human_action_gate AS SELECT 'x' AS source;
CREATE VIEW v_human_action_decision AS SELECT 'x' AS source;
` + viewSql("v_control_alternate_status") + viewSql("v_control_alternate_untested");

const TRIGGER_MD4 = "WITH oi AS (SELECT 1) , st AS (SELECT 1 AS tid, 1 AS streak_at WHERE (julianday('now') - julianday(0)) * 1440 >= 120) SELECT 1";
const PN_R2_TRIGGER = "SELECT p.id FROM agent_issues p WHERE p.title LIKE 'PROBE-NEEDED-1: issue-%' AND NOT EXISTS (SELECT 1 FROM agent_issues lv WHERE lv.title = 'BREACH-DOCTOR-1: PN-R2 qnfo-fleet-control')";
const PLAYBOOKS = [
  ["CM-R1", "sql", "on", "SELECT 1", '["UPDATE agent_issues SET status = \'closed\' WHERE id = ?1"]', '["UPDATE agent_issues SET status = \'open\' WHERE id = ?1"]', "SELECT 1", 12, 40],
  ["playbook-gap", "file-issue", "measure", "SELECT NULL", "[]", "[]", "SELECT 1", 3, 24],
  ["MD-4", "sql", "on", TRIGGER_MD4, '["WITH x AS (SELECT ?1 AS i) INSERT INTO issue_triage (issue_id) SELECT i FROM x"]', '["UPDATE agent_issues SET status = \'open\' WHERE id = ?1"]', "SELECT 1", 6, 24],
  ["PN-R2", "sql", "on", PN_R2_TRIGGER, '["UPDATE agent_issues SET status = \'closed\' WHERE id = ?1"]', '["UPDATE agent_issues SET status = \'open\' WHERE id = ?1"]', "SELECT CASE WHEN 1 THEN 'pn-reopened' ELSE 'ok' END", 1, 12],
  ["TL-R01-rearm", "sql", "on", "SELECT 1 FROM ops_config", '["UPDATE issue_plans SET planned_at = x WHERE issue_id = ?1"]', '["UPDATE issue_plans SET planned_at = y WHERE issue_id = ?1"]', "SELECT 1", 6, 40],
  ["TL-R03-exclude", "sql", "on", "SELECT 1 FROM tool_error_exclusions", '["WITH r AS (SELECT 1) INSERT INTO tool_error_exclusions (pattern) SELECT ?1 FROM r"]', '["UPDATE tool_error_exclusions SET pattern = z WHERE id = ?1"]', "SELECT 1", 4, 20],
  ["TL-R07-secret", "sql", "measure", "SELECT 1", '["INSERT INTO issue_triage (issue_id) SELECT ?1"]', '["UPDATE agent_issues SET status = \'open\' WHERE id = ?1"]', "SELECT 1", 4, 12]
];

function seedGood(db) {
  for (const n of NAMES) db.prepare("INSERT INTO control_registry (control, location, kind, disposition, disposition_state, alternate_path, evidence) VALUES (?, 'loc', 'gate', 'keep', 'planned', ?, ?)").run(n, "a written alternate path of " + n, "registered 2026-10-26 evidence of " + n);
  db.prepare("INSERT INTO control_registry (control, location, kind, disposition, disposition_state, alternate_path, alternate_tested_at, evidence) VALUES ('canary-functional', 'l', 'gate', 'keep', 'applied', 'a second canary', '2026-10-12T08:30:00Z', 'stamped by hand')").run();
  db.prepare("INSERT INTO control_registry (control, location, kind, disposition, disposition_state, alternate_path, evidence) VALUES ('outreach-consent-gate', 'l', 'gate', 'keep', 'applied', 'none needed: protects people outside the fleet', 'ALTERNATE-NOT-EXERCISABLE: x')").run();
  const cfg = db.prepare("INSERT INTO ops_config (key, value) VALUES (?, ?)");
  for (const [k, v] of [["research_repo_archive", "on"], ["research_repo_sync", "on"], ["research_repo_restore", "on"], ["research_repo_target", "auto"], ["breach_doctor_max_cases", "40"], ["breach_doctor_max_actions", "6"], ["breach_doctor_budget_ms", "20000"], ["breach_doctor_min_age_min", "60"], ["breach_doctor", "on"], ["code_merge_trusted_sources", "claude-session*,qnfo-fleet-control|BREACH-DOCTOR-1:,session"], ["code_plan_daily_cap", "48"], ["default_approve_gate", "on"]]) cfg.run(k, v);
  db.prepare("INSERT INTO cloud_ops_events (ts, kind, status, job, text) VALUES (?, 'repo-sync', 'ok', 'qnfo-research-exec', '{}')").run(isoMs(10));
  db.prepare("INSERT INTO breach_diagnosis_events (ts, event) VALUES (?, 'tick')").run(iso(2));
  const pb = db.prepare("INSERT INTO breach_playbooks (rule_id, action_kind, mode, trigger_sql, action_sql, revert_sql, verify_sql, max_per_tick, max_per_day, enabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)");
  for (const p of PLAYBOOKS) pb.run(...p);
  db.prepare("INSERT INTO metric_registry (metric, last_value, last_refreshed) VALUES ('doctor_taint_violations_24h', '0', ?), ('breaches_undiagnosed_over_60m', '209', ?)").run(iso(5), iso(5));
  db.prepare("INSERT INTO analytics_metric_triggers (metric_key, enabled) VALUES ('breaches_undiagnosed_over_60m', 1)").run();
  db.prepare("INSERT INTO analytics_action_log (trigger_id, status, fired_at) VALUES (1, 'recovered', ?)").run(iso(60 * 24));
  const ef = db.prepare("INSERT INTO email_filters (id, field, pattern, action, priority, enabled) VALUES (?, ?, ?, ?, ?, 1)");
  for (const id of [26, 27, 28, 29, 30]) ef.run(id, "from", "domain" + id + ".example", "spam", 100);
  ef.run(32, "body", "phrase one", "spam", 100); ef.run(33, "body", "phrase two", "spam", 100);
  ef.run(14, "sender", "older-domain.example", "spam", 0); ef.run(15, "sender", "older-domain.example", "spam", 0);
  ef.run(38, "sender", "a38" + AT + "example.org", "spam", 50); ef.run(40, "sender", "a40" + AT + "example.org", "spam", 50); ef.run(41, "sender", "a41" + AT + "example.org", "spam", 50);
  const rc = db.prepare("INSERT INTO remediation_contracts (class, status, last_verdict) VALUES (?, 'active', 'pass')");
  for (const c of ["fm-owner-approval-without-handoff", "fm-breach-doctor-rule-latched", "fm-tool-exclusion-hides-outage"]) rc.run(c);
}
function fresh(applyMigration = true) {
  const db = new DatabaseSync(":memory:");
  db.exec(SCHEMA); seedGood(db);
  if (applyMigration) db.exec(sql);
  return db;
}
const one = (db, s, ...a) => db.prepare(s).get(...a);
function run(db, control) {
  const row = one(db, "SELECT probe_sql FROM control_alternate_probes WHERE control = ?", control);
  if (!row) return { missing: true };
  const before = one(db, "SELECT total_changes() AS n").n;
  const rows = db.prepare(row.probe_sql).all();
  const v = chaosJudge(rows);
  v.readOnly = one(db, "SELECT total_changes() AS n").n === before; v.cols = rows[0] ? Object.keys(rows[0]).join(",") : ""; v.rows = rows.length;
  return v;
}

// ---- 1. the table rows and the view count ----
{
  const pre = fresh(false);
  const c0 = one(pre, "SELECT * FROM v_control_alternate_untested");
  ok(c0.controls_untested_without_probe === 18 && c0.controls_hand_stamped_without_probe === 1, "before: the 18 controls are untested without a probe (the live count) and one hand-stamped control has none", c0);
  const db = fresh();
  const rows = db.prepare("SELECT control, probe_sql, window_note, enabled, last_run_at, last_pass, last_pass_at FROM control_alternate_probes ORDER BY control").all();
  ok(JSON.stringify(rows.map((r) => r.control)) === JSON.stringify([...NAMES].sort()), "exactly the 18 controls get a probe row", rows.map((r) => r.control));
  ok(rows.every((r) => r.enabled === 1 && r.window_note.length > 60 && r.last_run_at === null && r.last_pass === null && r.last_pass_at === null), "every row is enabled, carries a window note and has never run (nothing is stamped from a declaration)");
  const WRITE = /\b(insert|update|delete|drop|alter|create|replace|attach|pragma|vacuum|reindex)\b/i;
  for (const r of rows) {
    ok(/^SELECT 'ok' AS expected, CASE WHEN /.test(r.probe_sql) && / ELSE 'ok' END AS observed$/.test(r.probe_sql), r.control + ": the probe is the expected/observed shape");
    ok(!WRITE.test(r.probe_sql) && !r.probe_sql.includes(";"), r.control + ": a single read-only SELECT (no write word, no semicolon)", r.probe_sql.match(WRITE));
    ok(!/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(r.probe_sql + r.window_note), r.control + ": no e-mail address in the probe or its note");
    ok(Buffer.byteLength(r.probe_sql) > 500 && Buffer.byteLength(r.probe_sql) < 2000, r.control + ": probe length is in the range of its siblings", Buffer.byteLength(r.probe_sql));
  }
  const c1 = one(db, "SELECT * FROM v_control_alternate_untested");
  ok(c1.controls_untested_without_probe === 0 && c1.controls_hand_stamped_without_probe === 1 && c1.probes_total === 18 && c1.probes_enabled === 18, "after: controls_untested_without_probe reads 0 (the probe of control-alternate-probes passes), the hand-stamped control stays as it was", c1);
  ok(one(db, "SELECT COUNT(*) AS n FROM control_registry WHERE alternate_tested_at IS NOT NULL").n === 1, "no alternate_tested_at is written by the migration (only the fixture's hand-stamped control has one)");
  ok(NAMES.every((n) => one(db, "SELECT drill_state FROM v_control_alternate_status WHERE control = ?", n).drill_state === "probe-never-run"), "each of the 18 reads probe-never-run until the drill runs it");
}

// ---- 2. every probe reads ok on the good fixture, read-only ----
{
  const db = fresh();
  for (const n of NAMES) {
    const v = run(db, n);
    ok(v.pass === true && v.observed === "ok" && v.readOnly === true && v.rows === 1 && v.cols === "expected,observed", n + ": reads ok on the good fixture, one row, changes nothing", v);
  }
}

// ---- 3. every clause fails with its own reason; boundary and exemption cases stay ok ----
const bad = (c, why, brk, re) => ({ c, why, brk, re });
const good = (c, why, chg) => ({ c, why, chg });
const cfgSet = (k, v) => "UPDATE ops_config SET value = '" + v + "' WHERE key = '" + k + "';";
const cfgDel = (k) => "DELETE FROM ops_config WHERE key = '" + k + "';";
const issue = (title, status, ageMin) => "INSERT INTO agent_issues (title, status, created_at, updated_at) VALUES ('" + title + "', '" + status + "', " + msAgo(ageMin) + ", " + msAgo(ageMin) + ");";
const diag = (issueId, rule, state, extra = {}) => "INSERT INTO breach_diagnoses (issue_id, rule_id, state, mode, last_progress_at, lease_until) VALUES (" + issueId + ", '" + rule + "', '" + state + "', '" + (extra.mode || "on") + "', '" + (extra.progress || iso(1)) + "', " + (extra.lease ? "'" + extra.lease + "'" : "NULL") + ");";
const ev = (kind, status, minAgo) => "INSERT INTO cloud_ops_events (ts, kind, status, job, text) VALUES ('" + isoMs(minAgo) + "', '" + kind + "', '" + status + "', 'qnfo-research-exec', '{}');";
const newPb = (rule, kind, action, revert, enabled = 1) => "INSERT INTO breach_playbooks (rule_id, action_kind, mode, action_sql, revert_sql, enabled) VALUES ('" + rule + "', '" + kind + "', 'on', '" + action.replace(/'/g, "''") + "', '" + revert.replace(/'/g, "''") + "', " + enabled + ");";
const CASES = {
  "research-repo-archive-gate": [
    bad(1, "the row is missing", cfgDel("research_repo_archive"), /row research_repo_archive is missing/),
    bad(2, "the value is Off (only the exact off stops the code)", cfgSet("research_repo_archive", "Off"), /other than on or off/),
    bad(2, "the value is empty", cfgSet("research_repo_archive", ""), /other than on or off/),
    bad(3, "an archive request exists with no consolidated deposit", "INSERT INTO portfolio_actions (repo, action, status) VALUES ('QNFO/qnfo-ensemble-research', 'archive-request', 'requested');", /fewer than 3 consolidated deposits/),
    bad(3, "an archive request exists with 2 consolidated deposits", "INSERT INTO portfolio_actions (repo, action, status) VALUES ('qnfo-ensemble-research', 'archive-request', 'requested'); INSERT INTO research_run_ledger VALUES ('a', 'QNFO/qnfo-research', 'ok'), ('b', 'QNFO/qnfo-research', 'ok');", /fewer than 3 consolidated deposits/),
    bad(3, "3 failed deposits do not count", "INSERT INTO portfolio_actions (repo, action, status) VALUES ('QNFO/qnfo-ensemble-research', 'archive-request', 'requested'); INSERT INTO research_run_ledger VALUES ('a', 'QNFO/qnfo-research', 'error'), ('b', 'QNFO/qnfo-research', 'error'), ('c', 'QNFO/qnfo-research', 'error');", /fewer than 3 consolidated deposits/),
    bad(3, "3 deposits to the legacy repository do not count", "INSERT INTO portfolio_actions (repo, action, status) VALUES ('QNFO/qnfo-ensemble-research', 'archive-request', 'requested'); INSERT INTO research_run_ledger VALUES ('a', 'QNFO/qnfo-ensemble-research', 'ok'), ('b', 'QNFO/qnfo-ensemble-research', 'ok'), ('c', 'QNFO/qnfo-ensemble-research', 'ok');", /fewer than 3 consolidated deposits/),
    good(0, "the off value", cfgSet("research_repo_archive", "off")),
    good(0, "a request with 3 consolidated deposits", "INSERT INTO portfolio_actions (repo, action, status) VALUES ('QNFO/qnfo-ensemble-research', 'archive-request', 'requested'); INSERT INTO research_run_ledger VALUES ('a', 'QNFO/qnfo-research', 'ok'), ('b', 'QNFO/qnfo-research', 'ok'), ('c', 'QNFO/qnfo-research', 'ok');"),
    good(0, "an archive request for another repository", "INSERT INTO portfolio_actions (repo, action, status) VALUES ('QNFO/personal-life-workers', 'archive-request', 'committed');")
  ],
  "research-repo-sync-switches": [
    bad(1, "the restore row is missing", cfgDel("research_repo_restore"), /three repo levers/),
    bad(1, "the target row is missing", cfgDel("research_repo_target"), /three repo levers/),
    bad(2, "sync holds yes", cfgSet("research_repo_sync", "yes"), /other than on or off/),
    bad(2, "restore holds ON", cfgSet("research_repo_restore", "ON"), /other than on or off/),
    bad(3, "target holds Legacy", cfgSet("research_repo_target", "Legacy"), /research_repo_target holds a value/),
    bad(3, "target is empty", cfgSet("research_repo_target", ""), /research_repo_target holds a value/),
    bad(4, "no repo-sync event", "DELETE FROM cloud_ops_events;", /no repo-sync event in 7 days/),
    bad(4, "only an error event", "DELETE FROM cloud_ops_events; " + ev("repo-sync", "error", 10), /no repo-sync event in 7 days/),
    bad(4, "the last event is 8 days old", "DELETE FROM cloud_ops_events; " + ev("repo-sync", "ok", 8 * 1440), /no repo-sync event in 7 days/),
    good(0, "sync and restore switched off", cfgSet("research_repo_sync", "off") + cfgSet("research_repo_restore", "off")),
    good(0, "target legacy", cfgSet("research_repo_target", "legacy")),
    good(0, "target consolidated", cfgSet("research_repo_target", "consolidated")),
    good(0, "a warn event 6 days ago", "DELETE FROM cloud_ops_events; " + ev("repo-sync", "warn", 6 * 1440))
  ],
  "breach-doctor-caps": [
    bad(1, "a cap row is missing", cfgDel("breach_doctor_budget_ms"), /three doctor caps/),
    bad(2, "max cases 0", cfgSet("breach_doctor_max_cases", "0"), /outside the range/),
    bad(2, "max cases 61", cfgSet("breach_doctor_max_cases", "61"), /outside the range/),
    bad(2, "max cases not a number", cfgSet("breach_doctor_max_cases", "lots"), /outside the range/),
    bad(2, "max actions -1", cfgSet("breach_doctor_max_actions", "-1"), /outside the range/),
    bad(2, "max actions 21", cfgSet("breach_doctor_max_actions", "21"), /outside the range/),
    bad(2, "budget 4999", cfgSet("breach_doctor_budget_ms", "4999"), /outside the range/),
    bad(2, "budget 40001", cfgSet("breach_doctor_budget_ms", "40001"), /outside the range/),
    bad(3, "no tick event", "DELETE FROM breach_diagnosis_events;", /no tick event in 30 minutes/),
    bad(3, "the last tick is 31 minutes old", "DELETE FROM breach_diagnosis_events; INSERT INTO breach_diagnosis_events (ts, event) VALUES ('" + iso(31) + "', 'tick');", /no tick event in 30 minutes/),
    good(0, "the edges of every range", cfgSet("breach_doctor_max_cases", "60") + cfgSet("breach_doctor_max_actions", "0") + cfgSet("breach_doctor_budget_ms", "5000")),
    good(0, "the other edges", cfgSet("breach_doctor_max_cases", "1") + cfgSet("breach_doctor_max_actions", "20") + cfgSet("breach_doctor_budget_ms", "40000")),
    good(0, "a tick 29 minutes old", "DELETE FROM breach_diagnosis_events; INSERT INTO breach_diagnosis_events (ts, event) VALUES ('" + iso(29) + "', 'tick');"),
    good(0, "no tick while the doctor is switched off", "DELETE FROM breach_diagnosis_events;" + cfgSet("breach_doctor", "off"))
  ],
  "breach-doctor-taint-guard": [
    bad(1, "the metric was refreshed 4 hours ago", "UPDATE metric_registry SET last_refreshed = '" + iso(240) + "' WHERE metric = 'doctor_taint_violations_24h';", /metric is missing or was not refreshed in 3 hours/),
    bad(1, "the metric is missing", "DELETE FROM metric_registry WHERE metric = 'doctor_taint_violations_24h';", /metric is missing or was not refreshed in 3 hours/),
    bad(2, "the trusted-source row is missing", cfgDel("code_merge_trusted_sources"), /code_merge_trusted_sources is missing/),
    bad(3, "the list is a bare star", cfgSet("code_merge_trusted_sources", "*"), /global wildcard/),
    bad(3, "a bare star in the middle of the list", cfgSet("code_merge_trusted_sources", "a,*,b"), /global wildcard/),
    bad(3, "a star with a title prefix and no source", cfgSet("code_merge_trusted_sources", "a,*|PREFIX-,b"), /global wildcard/),
    good(0, "a source prefix with a trailing star is not global", cfgSet("code_merge_trusted_sources", "claude-session*,x|y*,z")),
    good(0, "a metric refreshed 2 hours ago", "UPDATE metric_registry SET last_refreshed = '" + iso(120) + "' WHERE metric = 'doctor_taint_violations_24h';")
  ],
  "breach-doctor-action-allowlist": [
    bad(1, "an action writes ops_config", newPb("X1", "sql", '["INSERT INTO ops_config (key, value) SELECT \'k\', \'v\' WHERE ?1 > 0"]', "[]"), /writes a table the write allowlist refuses/),
    bad(1, "an action replaces into human_actions", newPb("X2", "sql", '["INSERT OR REPLACE INTO human_actions (id) SELECT ?1"]', "[]"), /writes a table the write allowlist refuses/),
    bad(1, "an action sets decision_log", newPb("X3", "sql", '["UPDATE decision_log SET action = 1 WHERE id = ?1"]', "[]"), /writes a table the write allowlist refuses/),
    bad(1, "an action writes fleet_tasks", newPb("X4", "sql", '["INSERT INTO fleet_tasks (id) SELECT ?1"]', "[]"), /writes a table the write allowlist refuses/),
    bad(1, "an action sets fleet_crons", newPb("X5", "sql", '["UPDATE fleet_crons SET enabled = 0 WHERE id = ?1"]', "[]"), /writes a table the write allowlist refuses/),
    bad(1, "an action sets control_registry", newPb("X6", "sql", '["UPDATE control_registry SET disposition = 1 WHERE issue_id = ?1"]', "[]"), /writes a table the write allowlist refuses/),
    bad(1, "an action sets metric_registry", newPb("X7", "sql", '["UPDATE metric_registry SET last_value = 1 WHERE rowid = ?1"]', "[]"), /writes a table the write allowlist refuses/),
    bad(1, "a revert sets breach_playbooks", newPb("X8", "sql", '["UPDATE agent_issues SET status = 1 WHERE id = ?1"]', '["UPDATE breach_playbooks SET mode = \'on\' WHERE ?1 > 0"]'), /writes a table the write allowlist refuses/),
    bad(2, "an action statement has no id predicate", newPb("X9", "sql", '["UPDATE agent_issues SET status = 1"]', "[]"), /no \?1 id predicate/),
    good(0, "a read of ops_config and metric_registry inside an allowed write", newPb("X10", "sql", '["INSERT INTO issue_triage (issue_id) SELECT ?1 WHERE (SELECT value FROM ops_config WHERE key = \'k\') = \'on\' AND EXISTS (SELECT 1 FROM metric_registry)"]', "[]")),
    good(0, "a disabled playbook that writes ops_config", newPb("X11", "sql", '["INSERT INTO ops_config (key) SELECT ?1"]', "[]", 0)),
    good(0, "a file-issue playbook with an empty action", newPb("X12", "file-issue", "[]", "[]")),
    good(0, "a statement that starts with WITH", newPb("X13", "sql", '["WITH x AS (SELECT ?1 AS i) UPDATE agent_issues SET status = 1 WHERE id IN (SELECT i FROM x)"]', "[]"))
  ],
  "breach-doctor-gap-measure": [
    bad(1, "the playbook-gap row is missing", "DELETE FROM breach_playbooks WHERE rule_id = 'playbook-gap';", /playbook-gap row is missing or disabled/),
    bad(1, "the playbook-gap row is disabled", "UPDATE breach_playbooks SET enabled = 0 WHERE rule_id = 'playbook-gap';", /playbook-gap row is missing or disabled/),
    bad(2, "the view no longer reports gap_by_family", "DROP VIEW v_breach_doctor_status; CREATE VIEW v_breach_doctor_status AS SELECT 'on' AS mode, 0 AS unclassified_cases, 0 AS gap_families;", /no longer reports unclassified_cases, gap_families and gap_by_family/),
    bad(2, "the view is gone", "DROP VIEW v_breach_doctor_status;", /no longer reports/),
    bad(3, "the metric is missing", "DELETE FROM metric_registry WHERE metric = 'breaches_undiagnosed_over_60m';", /metric or its enabled trigger is missing/),
    bad(3, "the trigger is disabled", "UPDATE analytics_metric_triggers SET enabled = 0;", /metric or its enabled trigger is missing/),
    bad(3, "the trigger is missing", "DELETE FROM analytics_metric_triggers;", /metric or its enabled trigger is missing/),
    good(0, "the sanctioned exit: the gap rule switched on", "UPDATE breach_playbooks SET mode = 'on' WHERE rule_id = 'playbook-gap';")
  ],
  "breach-doctor-gap-caps": [
    bad(1, "max_per_tick 0", "UPDATE breach_playbooks SET max_per_tick = 0 WHERE rule_id = 'playbook-gap';", /not bounded/),
    bad(1, "max_per_tick 13", "UPDATE breach_playbooks SET max_per_tick = 13 WHERE rule_id = 'playbook-gap';", /not bounded/),
    bad(1, "max_per_day 0", "UPDATE breach_playbooks SET max_per_day = 0 WHERE rule_id = 'playbook-gap';", /not bounded/),
    bad(1, "max_per_day 101", "UPDATE breach_playbooks SET max_per_day = 101 WHERE rule_id = 'playbook-gap';", /not bounded/),
    bad(1, "the row is missing", "DELETE FROM breach_playbooks WHERE rule_id = 'playbook-gap';", /not bounded/),
    bad(2, "four gap issues are open", ["A", "B", "C", "D"].map((f) => issue("BREACH-DOCTOR-1: playbook gap FAM-" + f, "open", 60)).join(""), /more than 3 playbook gap issues/),
    bad(3, "a gap issue for OWNER-CHAT is open", issue("BREACH-DOCTOR-1: playbook gap OWNER-CHAT", "open", 60), /family no playbook can close/),
    bad(3, "a gap issue for OWNER-REQUEST is open", issue("BREACH-DOCTOR-1: playbook gap OWNER-REQUEST", "open", 60), /family no playbook can close/),
    bad(3, "a gap issue for other is open", issue("BREACH-DOCTOR-1: playbook gap other", "open", 60), /family no playbook can close/),
    bad(3, "a gap issue for the doctor family is open", issue("BREACH-DOCTOR-1: playbook gap BREACH-DOCTOR-1", "open", 60), /family no playbook can close/),
    good(0, "three gap issues are open (the cap)", ["A", "B", "C"].map((f) => issue("BREACH-DOCTOR-1: playbook gap FAM-" + f, "open", 60)).join("")),
    good(0, "four closed gap issues and three open", ["A", "B", "C", "D"].map((f) => issue("BREACH-DOCTOR-1: playbook gap CLOSED-" + f, "closed", 600)).join("") + ["A", "B", "C"].map((f) => issue("BREACH-DOCTOR-1: playbook gap FAM-" + f, "open", 60)).join("")),
    good(0, "a closed gap issue for OWNER-CHAT", issue("BREACH-DOCTOR-1: playbook gap OWNER-CHAT", "closed", 600)),
    good(0, "an open gap issue for a family a playbook can close", issue("BREACH-DOCTOR-1: playbook gap METRIC-TRIGGER", "open", 60))
  ],
  "breach-doctor-own-issue-guard": [
    ...["queued", "applied", "verifying", "verified", "failed", "reverted"].map((st) => bad(1, "a doctor own issue has a case in state " + st, issue("BREACH-DOCTOR-1: self R E", "open", 30) + diag(1, "CM-R1", st), /acted on an issue the doctor filed itself/)),
    bad(2, "a gap issue about the doctor own family was filed (and closed)", issue("BREACH-DOCTOR-1: playbook gap BREACH-DOCTOR-1", "closed", 600), /gap issue was filed about/),
    bad(3, "an open doctor issue 25 hours old has no case", issue("BREACH-DOCTOR-1: self R E", "open", 25 * 60), /older than 24 hours has no breach_diagnoses row/),
    good(0, "a doctor own issue with a case that only diagnosed", issue("BREACH-DOCTOR-1: self R E", "open", 30) + diag(1, "CM-R1", "diagnosed")),
    good(0, "an open doctor issue 23 hours old with no case yet", issue("BREACH-DOCTOR-1: self R E", "open", 23 * 60)),
    good(0, "a closed doctor issue 3 days old with no case", issue("BREACH-DOCTOR-1: self R E", "closed", 72 * 60)),
    good(0, "an open doctor issue 25 hours old with a case", issue("BREACH-DOCTOR-1: self R E", "open", 25 * 60) + diag(1, "CM-R1", "diagnosed")),
    good(0, "another issue with an applied case", issue("OTHER-1: something", "open", 30) + diag(1, "CM-R1", "applied"))
  ],
  "breach-doctor-strike-cap": [
    bad(1, "a self issue is open twice", issue("BREACH-DOCTOR-1: self R E", "open", 30) + issue("BREACH-DOCTOR-1: self R E", "open", 20), /open twice/),
    bad(2, "one issue has 5 failed cases in 120 minutes", [1, 2, 3, 4, 5].map((i) => diag(7, "CM-R1", "failed", { progress: iso(10 * i) })).join(""), /more than 4 failed or reverted/),
    bad(2, "failed and reverted cases are counted together", [1, 2, 3].map((i) => diag(7, "CM-R1", "failed", { progress: iso(10 * i) })).join("") + [4, 5].map((i) => diag(7, "CM-R1", "reverted", { progress: iso(10 * i) })).join(""), /more than 4 failed or reverted/),
    good(0, "two self issues with different titles", issue("BREACH-DOCTOR-1: self R E", "open", 30) + issue("BREACH-DOCTOR-1: self R2 E", "open", 20)),
    good(0, "two copies of a self issue, one closed", issue("BREACH-DOCTOR-1: self R E", "closed", 300) + issue("BREACH-DOCTOR-1: self R E", "open", 20)),
    good(0, "4 failed cases of one issue (3 strikes and one retry)", [1, 2, 3, 4].map((i) => diag(7, "CM-R1", "failed", { progress: iso(10 * i) })).join("")),
    good(0, "5 failed cases spread over 5 issues", [1, 2, 3, 4, 5].map((i) => diag(i, "CM-R1", "failed", { progress: iso(10 * i) })).join("")),
    good(0, "5 failed cases of one issue that are older than 120 minutes", [1, 2, 3, 4, 5].map((i) => diag(7, "CM-R1", "failed", { progress: iso(130 + 10 * i) })).join(""))
  ],
  "email-filter-journal-pitch-senders": [
    bad(1, "filter 40 is disabled", "UPDATE email_filters SET enabled = 0 WHERE id = 40;", /email_filters 40 or 41/),
    bad(1, "filter 41 is deleted", "DELETE FROM email_filters WHERE id = 41;", /email_filters 40 or 41/),
    bad(1, "filter 41 became a bare domain", "UPDATE email_filters SET pattern = 'example.org' WHERE id = 41;", /email_filters 40 or 41/),
    bad(1, "filter 40 became a wildcard", "UPDATE email_filters SET pattern = '%" + AT + "example.org' WHERE id = 40;", /email_filters 40 or 41/),
    bad(1, "filter 40 changed action", "UPDATE email_filters SET action = 'accept' WHERE id = 40;", /email_filters 40 or 41/),
    bad(2, "domain filter 33 is disabled", "UPDATE email_filters SET enabled = 0 WHERE id = 33;", /26 to 30, 32 and 33/),
    bad(2, "domain filter 26 is deleted", "DELETE FROM email_filters WHERE id = 26;", /26 to 30, 32 and 33/),
    bad(3, "a new priority-50 sender filter is a bare domain", "INSERT INTO email_filters (id, field, pattern, action, priority, enabled) VALUES (50, 'sender', 'bare.example', 'spam', 50, 1);", /priority-50 sender filter is not a full address/),
    bad(3, "a new priority-50 sender filter holds a wildcard", "INSERT INTO email_filters (id, field, pattern, action, priority, enabled) VALUES (50, 'sender', 'x" + AT + "%.example', 'spam', 50, 1);", /priority-50 sender filter is not a full address/),
    good(0, "an extra full-address priority-50 filter", "INSERT INTO email_filters (id, field, pattern, action, priority, enabled) VALUES (50, 'sender', 'z" + AT + "example.org', 'spam', 50, 1);"),
    good(0, "an older bare-domain sender filter of priority 0 (another family)", "INSERT INTO email_filters (id, field, pattern, action, priority, enabled) VALUES (51, 'sender', 'bare.example', 'spam', 0, 1);"),
    good(0, "a disabled bare-domain priority-50 filter", "INSERT INTO email_filters (id, field, pattern, action, priority, enabled) VALUES (52, 'sender', 'bare.example', 'spam', 50, 0);")
  ],
  "dash-owner-decision-session-gate": [
    bad(1, "the detector contract is retired", "UPDATE remediation_contracts SET status = 'retired' WHERE class = 'fm-owner-approval-without-handoff';", /fm-owner-approval-without-handoff detector/),
    bad(1, "the detector contract is missing", "DELETE FROM remediation_contracts WHERE class = 'fm-owner-approval-without-handoff';", /fm-owner-approval-without-handoff detector/),
    bad(2, "default_approve_gate holds maybe", cfgSet("default_approve_gate", "maybe"), /default_approve_gate holds a value/),
    bad(3, "v_human_action_gate is gone", "DROP VIEW v_human_action_gate;", /v_human_action_gate or v_human_action_decision is missing/),
    bad(3, "v_human_action_decision is gone", "DROP VIEW v_human_action_decision;", /v_human_action_gate or v_human_action_decision is missing/),
    good(0, "the lever row is absent (reads on)", cfgDel("default_approve_gate")),
    good(0, "the lever is off", cfgSet("default_approve_gate", "off"))
  ],
  "breach-doctor-auto-demotion": [
    bad(1, "the detector contract is retired", "UPDATE remediation_contracts SET status = 'retired' WHERE class = 'fm-breach-doctor-rule-latched';", /rule-latched detector/),
    bad(1, "the detector contract is missing", "DELETE FROM remediation_contracts WHERE class = 'fm-breach-doctor-rule-latched';", /rule-latched detector/),
    bad(2, "a rule was demoted 121 minutes ago and is still in measure", "UPDATE breach_playbooks SET mode = 'measure', note = 'demoted " + iso(121) + " two failed cases' WHERE rule_id = 'CM-R1';", /stayed demoted to measure for over 120 minutes/),
    bad(2, "a rule was demoted 5 hours ago", "UPDATE breach_playbooks SET mode = 'measure', note = 'demoted " + iso(300) + " x' WHERE rule_id = 'MD-4';", /stayed demoted to measure for over 120 minutes/),
    bad(3, "every rule is held in measure", "UPDATE breach_playbooks SET mode = 'measure';", /no enabled playbook is in mode on/),
    good(0, "a rule demoted 119 minutes ago", "UPDATE breach_playbooks SET mode = 'measure', note = 'demoted " + iso(119) + " x' WHERE rule_id = 'CM-R1';"),
    good(0, "a disabled rule with an old demotion note", "UPDATE breach_playbooks SET mode = 'measure', enabled = 0, note = 'demoted " + iso(900) + " x' WHERE rule_id = 'CM-R1';"),
    good(0, "a released rule (mode on) that still carries the old note", "UPDATE breach_playbooks SET note = 'demoted " + iso(900) + " x' WHERE rule_id = 'CM-R1';")
  ],
  "breach-doctor-age-gate": [
    bad(1, "the age gate is 9 minutes", cfgSet("breach_doctor_min_age_min", "9"), /outside 10 to 120 minutes/),
    bad(1, "the age gate is 121 minutes", cfgSet("breach_doctor_min_age_min", "121"), /outside 10 to 120 minutes/),
    bad(1, "the age gate is a day", cfgSet("breach_doctor_min_age_min", "1440"), /outside 10 to 120 minutes/),
    bad(1, "the age gate is not a number", cfgSet("breach_doctor_min_age_min", "soon"), /outside 10 to 120 minutes/),
    bad(1, "the age gate row is missing", cfgDel("breach_doctor_min_age_min"), /outside 10 to 120 minutes/),
    bad(2, "the metric is not registered", "DELETE FROM metric_registry WHERE metric = 'breaches_undiagnosed_over_60m';", /metric is not registered/),
    bad(3, "the trigger is disabled", "UPDATE analytics_metric_triggers SET enabled = 0;", /no enabled trigger/),
    bad(3, "the trigger is missing", "DELETE FROM analytics_metric_triggers;", /no enabled trigger/),
    good(0, "the age gate at 10", cfgSet("breach_doctor_min_age_min", "10")),
    good(0, "the age gate at 120", cfgSet("breach_doctor_min_age_min", "120"))
  ],
  "breach-doctor-tool-exclusion-rule": [
    bad(1, "the excluded-errors view is gone", "DROP VIEW tool_failures_excluded_24h;", /tool_failures_excluded_24h view is missing/),
    bad(2, "the detector contract is retired", "UPDATE remediation_contracts SET status = 'retired' WHERE class = 'fm-tool-exclusion-hides-outage';", /fm-tool-exclusion-hides-outage detector/),
    bad(3, "the rule is missing", "DELETE FROM breach_playbooks WHERE rule_id = 'TL-R03-exclude';", /TL-R03-exclude rule is missing, disabled/),
    bad(3, "the rule is disabled", "UPDATE breach_playbooks SET enabled = 0 WHERE rule_id = 'TL-R03-exclude';", /TL-R03-exclude rule is missing, disabled/),
    bad(3, "the rule has no revert", "UPDATE breach_playbooks SET revert_sql = '[]' WHERE rule_id = 'TL-R03-exclude';", /has no revert/),
    bad(3, "the rule no longer reads tool_error_exclusions", "UPDATE breach_playbooks SET trigger_sql = 'SELECT 1' WHERE rule_id = 'TL-R03-exclude';", /no longer reads tool_error_exclusions/)
  ],
  "breach-doctor-secret-change-measure": [
    bad(1, "the rule was switched on", "UPDATE breach_playbooks SET mode = 'on' WHERE rule_id = 'TL-R07-secret';", /no longer in measure/),
    bad(1, "the rule is disabled", "UPDATE breach_playbooks SET enabled = 0 WHERE rule_id = 'TL-R07-secret';", /no longer in measure/),
    bad(1, "the rule is missing", "DELETE FROM breach_playbooks WHERE rule_id = 'TL-R07-secret';", /no longer in measure/),
    bad(2, "a case verified while the rule is held", diag(5, "TL-R07-secret", "verified", { mode: "measure" }), /acted/),
    bad(2, "a case in mode on", diag(5, "TL-R07-secret", "diagnosed", { mode: "on" }), /acted/),
    bad(3, "an open SECRET-CHANGE-OBSERVED issue has no contract", issue("SECRET-CHANGE-OBSERVED: some-worker 2026-10-26", "open", 90), /no live contract/),
    bad(3, "its only contract is retired", issue("SECRET-CHANGE-OBSERVED: some-worker 2026-10-26", "open", 90) + "INSERT INTO remediation_contracts (class, issue_id, status) VALUES ('issue-1', 1, 'retired');", /no live contract/),
    good(0, "an open issue with a monitoring contract", issue("SECRET-CHANGE-OBSERVED: some-worker 2026-10-26", "open", 90) + "INSERT INTO remediation_contracts (class, issue_id, status) VALUES ('issue-1', 1, 'monitoring');"),
    good(0, "an open issue with an active contract", issue("SECRET-CHANGE-OBSERVED: some-worker 2026-10-26", "open", 90) + "INSERT INTO remediation_contracts (class, issue_id, status) VALUES ('issue-1', 1, 'active');"),
    good(0, "a closed issue with no contract", issue("SECRET-CHANGE-OBSERVED: some-worker 2026-10-26", "closed", 90)),
    good(0, "a would-do case recorded in measure", diag(5, "TL-R07-secret", "diagnosed", { mode: "measure" }))
  ],
  "breach-doctor-rearm-capacity": [
    bad(1, "the rule is missing", "DELETE FROM breach_playbooks WHERE rule_id = 'TL-R01-rearm';", /TL-R01-rearm rule is missing or disabled/),
    bad(1, "the rule is disabled", "UPDATE breach_playbooks SET enabled = 0 WHERE rule_id = 'TL-R01-rearm';", /TL-R01-rearm rule is missing or disabled/),
    bad(2, "7 cases are in flight", [1, 2, 3, 4, 5, 6, 7].map((i) => diag(i, "TL-R01-rearm", ["queued", "applied", "verifying"][i % 3], { lease: iso(-20) })).join(""), /more than 6 TL-R01-rearm cases are in flight/),
    bad(3, "the planner cap is not a number", cfgSet("code_plan_daily_cap", "abc"), /code_plan_daily_cap is not a number/),
    bad(3, "the planner cap is empty", cfgSet("code_plan_daily_cap", ""), /code_plan_daily_cap is not a number/),
    bad(4, "an in-flight case is 61 minutes past its lease", diag(1, "TL-R01-rearm", "applied", { lease: iso(61) }), /past its 30-minute lease/),
    good(0, "6 cases in flight", [1, 2, 3, 4, 5, 6].map((i) => diag(i, "TL-R01-rearm", "queued", { lease: iso(-20) })).join("")),
    good(0, "the planner cap at 1 and at 48", cfgSet("code_plan_daily_cap", "1")),
    good(0, "an in-flight case 59 minutes past its lease", diag(1, "TL-R01-rearm", "applied", { lease: iso(59) })),
    good(0, "a verified case with an old lease", diag(1, "TL-R01-rearm", "verified", { lease: iso(900) }))
  ],
  "metric-playbook-recovery-hold": [
    bad(1, "the MD-4 gate is 1440 minutes", "UPDATE breach_playbooks SET trigger_sql = replace(trigger_sql, '>= 120', '>= 1440') WHERE rule_id = 'MD-4';", /gate is no longer 120 minutes/),
    bad(1, "the MD-4 rule is disabled", "UPDATE breach_playbooks SET enabled = 0 WHERE rule_id = 'MD-4';", /gate is no longer 120 minutes/),
    bad(1, "the MD-4 rule is missing", "DELETE FROM breach_playbooks WHERE rule_id = 'MD-4';", /gate is no longer 120 minutes/),
    bad(2, "breach_doctor holds maybe", cfgSet("breach_doctor", "maybe"), /breach_doctor holds a value other than on, measure or off/),
    bad(3, "the evaluator recorded no recovery", "DELETE FROM analytics_action_log;", /closed no recovered METRIC-TRIGGER issue in 7 days/),
    bad(3, "the last recovery is 8 days old", "DELETE FROM analytics_action_log; INSERT INTO analytics_action_log (trigger_id, status, fired_at) VALUES (1, 'recovered', '" + iso(8 * 1440) + "');", /closed no recovered METRIC-TRIGGER issue in 7 days/),
    bad(3, "only recovering rows exist", "DELETE FROM analytics_action_log; INSERT INTO analytics_action_log (trigger_id, status, fired_at) VALUES (1, 'recovering', '" + iso(60) + "');", /closed no recovered METRIC-TRIGGER issue in 7 days/),
    good(0, "the doctor switch absent (reads measure)", cfgDel("breach_doctor")),
    good(0, "the doctor switched off", cfgSet("breach_doctor", "off")),
    good(0, "the last recovery is 6 days old", "DELETE FROM analytics_action_log; INSERT INTO analytics_action_log (trigger_id, status, fired_at) VALUES (1, 'recovered', '" + iso(6 * 1440) + "');")
  ],
  "pn-r2-filer-quiet-gate": [
    bad(1, "the rule is missing", "DELETE FROM breach_playbooks WHERE rule_id = 'PN-R2';", /PN-R2 rule is missing or disabled/),
    bad(1, "the rule is disabled", "UPDATE breach_playbooks SET enabled = 0 WHERE rule_id = 'PN-R2';", /PN-R2 rule is missing or disabled/),
    bad(2, "the trigger carries a 1440-minute window again", "UPDATE breach_playbooks SET trigger_sql = trigger_sql || ' AND gl.ts > datetime(''now'', ''-1440 minutes'')' WHERE rule_id = 'PN-R2';", /1440-minute window/),
    bad(3, "the trigger no longer reads the lever issue", "UPDATE breach_playbooks SET trigger_sql = replace(trigger_sql, 'BREACH-DOCTOR-1: PN-R2 qnfo-fleet-control', 'x') WHERE rule_id = 'PN-R2';", /no longer reads the lever issue/),
    bad(4, "the verify no longer reads pn-reopened", "UPDATE breach_playbooks SET verify_sql = 'SELECT 1' WHERE rule_id = 'PN-R2';", /no longer reads pn-reopened/)
  ]
};
ok(JSON.stringify(Object.keys(CASES).sort()) === JSON.stringify([...NAMES].sort()), "a broken fixture is defined for every one of the 18 controls", { missing: NAMES.filter((n) => !CASES[n]) });
{
  const clauses = {}; // clause numbers broken, per control
  for (const [control, cases] of Object.entries(CASES)) {
    for (const k of cases) {
      const db = fresh();
      let threw = null;
      try { db.exec(k.brk || k.chg); } catch (e) { threw = String(e && e.message || e); }
      if (threw) { ok(false, control + ": the fixture statement runs (" + (k.why) + ")", threw); continue; }
      const v = run(db, control);
      if (k.brk) {
        ok(v.pass === false && v.expected === "ok" && v.observed !== "ok" && k.re.test(v.observed), control + ": fails when " + k.why, v);
        ok(v.readOnly === true, control + ": the failing run still changed nothing (" + k.why + ")");
        (clauses[control] = clauses[control] || new Set()).add(k.c);
      } else {
        ok(v.pass === true && v.observed === "ok", control + ": stays ok when " + k.why, v);
      }
    }
  }
  // every clause of every probe was broken by at least one case: the CASE has as many WHEN branches as the clauses broken
  for (const n of NAMES) {
    const probe = one(fresh(), "SELECT probe_sql FROM control_alternate_probes WHERE control = ?", n).probe_sql;
    const whens = (probe.match(/ WHEN /g) || []).length;
    const want = Array.from({ length: whens }, (_, i) => i + 1).join(",");
    ok(whens > 0 && clauses[n] && [...clauses[n]].sort((a, b) => a - b).join(",") === want, n + ": every WHEN clause of the probe (" + whens + ") has a broken fixture", { whens, broken: clauses[n] && [...clauses[n]] });
  }
}

// ---- 4. the drill in miniature: a pass stamps the control, a failure never does ----
{
  const drill = (db) => {
    const now = new Date().toISOString();
    for (const p of db.prepare("SELECT control, probe_sql FROM control_alternate_probes WHERE enabled = 1").all()) {
      let r; try { r = chaosJudge(db.prepare(p.probe_sql).all()); } catch (e) { r = { pass: false, observed: "probe error: " + e.message }; }
      db.prepare("UPDATE control_alternate_probes SET last_run_at = ?1, last_pass = ?2, last_observed = ?3, last_pass_at = CASE WHEN ?2 = 1 THEN ?1 ELSE last_pass_at END WHERE control = ?4").run(now, r.pass ? 1 : 0, r.observed, p.control);
      if (r.pass) db.prepare("UPDATE control_registry SET alternate_tested_at = ?1, reviewed_at = ?1 WHERE control = ?2").run(now, p.control);
    }
  };
  const db = fresh();
  drill(db);
  ok(NAMES.every((n) => one(db, "SELECT drill_state FROM v_control_alternate_status WHERE control = ?", n).drill_state === "drilled" && one(db, "SELECT alternate_tested_at AS t FROM control_registry WHERE control = ?", n).t), "a drill on the good world stamps all 18 controls and every one reads drilled");
  const c = one(db, "SELECT * FROM v_control_alternate_untested");
  ok(c.probes_failing === 0 && c.controls_untested_without_probe === 0, "no probe is failing and no control is untested without a probe after the drill", c);
  const db2 = fresh();
  db2.exec(cfgDel("research_repo_archive") + cfgSet("breach_doctor_max_cases", "99"));
  drill(db2);
  const failing = db2.prepare("SELECT control FROM v_control_alternate_status WHERE drill_state = 'probe-failing' ORDER BY control").all().map((r) => r.control);
  ok(JSON.stringify(failing) === JSON.stringify(["breach-doctor-caps", "research-repo-archive-gate"]), "breaking two levers flips exactly those two controls to probe-failing", failing);
  ok(failing.every((n) => one(db2, "SELECT alternate_tested_at AS t FROM control_registry WHERE control = ?", n).t === null) && NAMES.filter((n) => !failing.includes(n)).every((n) => one(db2, "SELECT alternate_tested_at AS t FROM control_registry WHERE control = ?", n).t), "a failing probe is never stamped and the other 16 are");
}

// ---- 5. evidence, backup, decision, replay, rollback, hygiene ----
{
  const db = fresh();
  const evs = db.prepare("SELECT control, evidence FROM control_registry WHERE control IN (" + NAMES.map(() => "?").join(",") + ")").all(...NAMES);
  ok(evs.every((e) => e.evidence.startsWith("registered 2026-10-26 evidence of " + e.control + " | CONTROL-ALT-PROBES-4 2026-10-26: probed by its control_alternate_probes row") && (e.evidence.match(/CONTROL-ALT-PROBES-4/g) || []).length === 1), "the 18 controls keep their evidence and gain the note once");
  ok(one(db, "SELECT evidence FROM control_registry WHERE control = 'canary-functional'").evidence === "stamped by hand" && one(db, "SELECT evidence FROM control_registry WHERE control = 'outreach-consent-gate'").evidence === "ALTERNATE-NOT-EXERCISABLE: x", "no other control's evidence changes");
  const bak = db.prepare("SELECT control, evidence, alternate_tested_at FROM bak_20261026_control_probes4_evidence ORDER BY control").all();
  ok(bak.length === 18 && bak.every((b) => b.evidence === "registered 2026-10-26 evidence of " + b.control && b.alternate_tested_at === null), "the backup table holds the 18 original evidence texts and their NULL tested dates", bak.length);
  const dl = db.prepare("SELECT * FROM decision_log").all();
  const cols = ["actor", "assumption", "action", "evidence", "outcome", "blast_radius", "rollback_path", "capability_gain", "predicted_outcome", "reach_gain", "surfaces_tested"];
  ok(dl.length === 1 && dl[0].actor === "rem-a3-drills" && dl[0].action.indexOf("CONTROL-ALT-PROBES-4:") === 0 && cols.every((c) => typeof dl[0][c] === "string" && dl[0][c].trim().length > 3) && !cols.some((c) => / within /i.test(dl[0][c])), "one decision row by rem-a3-drills fills all eleven columns and holds no ' within '", dl.length);
  ok(NAMES.every((n) => dl[0].action.includes(n.replace(/^breach-doctor-/, "")) || dl[0].action.includes(n)), "the decision names all 18 controls");
  ok(/1000214/.test(dl[0].predicted_outcome) && /Rollback header/.test(dl[0].rollback_path), "the decision states its prediction and its revert path");
  const snap = (d) => JSON.stringify(["control_alternate_probes", "control_registry", "decision_log", "bak_20261026_control_probes4_evidence"].map((t) => d.prepare("SELECT * FROM " + t + " ORDER BY 1").all()));
  const s1 = snap(db); let threw = null;
  try { db.exec(sql); } catch (e) { threw = String(e && e.message || e); }
  ok(threw === null && snap(db) === s1, "applying the migration a second time changes nothing", threw);
  // a probe someone has since edited is not overwritten
  const d3 = fresh(false); d3.prepare("INSERT INTO control_alternate_probes (control, probe_sql, window_note) VALUES ('breach-doctor-caps', 'SELECT ''ok'' AS expected, ''ok'' AS observed', 'hand written')").run(); d3.exec(sql);
  ok(one(d3, "SELECT window_note FROM control_alternate_probes WHERE control = 'breach-doctor-caps'").window_note === "hand written" && one(d3, "SELECT COUNT(*) AS n FROM control_alternate_probes").n === 18, "an existing probe row of one of the 18 is left alone (INSERT OR IGNORE) and the other 17 are added");
  // rollback without the backup table
  const d4 = fresh(false);
  const orig = JSON.stringify([d4.prepare("SELECT * FROM control_registry ORDER BY 1").all(), d4.prepare("SELECT * FROM control_alternate_probes ORDER BY 1").all()]);
  d4.exec(sql); d4.exec("DROP TABLE bak_20261026_control_probes4_evidence"); d4.exec(rollback);
  const back = JSON.stringify([d4.prepare("SELECT * FROM control_registry ORDER BY 1").all(), d4.prepare("SELECT * FROM control_alternate_probes ORDER BY 1").all()]);
  ok(orig === back, "the Rollback line restores the registry and removes the 18 probe rows exactly, with the backup table gone");
  ok(one(d4, "SELECT COUNT(*) AS n FROM decision_log").n === 1, "and leaves the decision row (append-only)");
  // a probe that already ran is kept by the rollback and a stamp it wrote is cleared
  const d5 = fresh(); d5.exec("UPDATE control_alternate_probes SET last_run_at = '2026-10-26T19:01:00Z', last_pass = 1 WHERE control = 'breach-doctor-caps'; UPDATE control_registry SET alternate_tested_at = '2026-10-26T19:01:00Z' WHERE control IN ('breach-doctor-caps', 'breach-doctor-age-gate');");
  d5.exec(rollback);
  ok(one(d5, "SELECT COUNT(*) AS n FROM control_alternate_probes").n === 1 && one(d5, "SELECT COUNT(*) AS n FROM control_registry WHERE alternate_tested_at IS NOT NULL").n === 1, "a probe row that has run is kept by the Rollback and the tested dates of the 18 are cleared (the hand-stamped control keeps its date)");
}
{
  const test = readFileSync(here("control-alternate-probes4.test.mjs"), "utf8");
  const lits = [...code.matchAll(/\b(?:LIKE|GLOB)\s+'((?:[^']|'')*)'/gi)].map((m) => Buffer.byteLength(m[1].replace(/''/g, "'")));
  ok(lits.every((n) => n <= 50), "no LIKE or GLOB pattern over 50 bytes (D1 limit)", lits);
  ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql) && /^-- BACKUP: bak_20261026_control_probes4_evidence$/m.test(sql) && /\n-- Rollback: [^\n]+\n/.test(sql) && rollback.length > 600, "the opt-in headers, the backup header and a one-line Rollback are present");
  ok(!/^\s*(DROP|DELETE)\b/im.test(code) && !/\bCREATE\s+TRIGGER\b/i.test(code) && /^CREATE TABLE IF NOT EXISTS bak_20261026_control_probes4_evidence AS\s+SELECT/.test(code.trim()), "no DELETE or DROP in the body, no trigger, and the backup is the first statement, created AS SELECT");
  ok((code.match(/;\s*\n/g) || []).length === 4, "four statements end a line with a semicolon (the runner counts four), none is hidden in a literal", (code.match(/;\s*\n/g) || []).length);
  ok(!/claude\.ai|anthropic\.com/i.test(sql + test) && !/(sk-|ghp_|xox[bp]-)[A-Za-z0-9]{10,}/.test(sql + test) && !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(sql + test), "no vendor link, no secret value, no e-mail address in the migration or the suite");
  ok(!/(^|[^\w&])#\d+/m.test(sql), "no bare hash-number issue reference in the migration");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
