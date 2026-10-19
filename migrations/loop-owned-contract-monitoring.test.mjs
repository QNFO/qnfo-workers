// LOOP-OWNED-CONTRACT-MONITORING-1 offline suite: applies 2026-10-19-loop-owned-contract-monitoring.sql on SQLite to a fixture of the live
// qnfo-audit shapes (remediation_contracts and its eleven triggers in creation order, the two agent_issues triggers that birth and
// guard a contract, the red-drain row exported in docs/fleet-tasks-canonical.json). Measured live 2026-10-19 12:26Z: 27 active contracts of
// open issues whose probe reads the status of their own issue (24 last_verdict fail, 3 deferred), and close-while-contract-fails
// aborting the close of the issue that filed them. Proves, each against the pre-fix code first:
//   1. the deadlock: an issue filed by a loop cannot be closed with close_evidence while its birth contract reads fail;
//   2. a contract born after the file is monitoring, keeps its owner text, and the issue closes; v3_generic still claims an unmapped
//      label (the trigger order trap), and a METRIC-TRIGGER issue still gets its metric probe;
//   3. the 27 standing rows move, and only those (a doer-written probe under the same module, a closed issue, a needs-machine-probe or
//      superseded row stay), and every formerly blocked issue then closes;
//   4. parking alone is undone by PARKED-REARM-1 (red-drain step 6) within the hour; with the carve-out it is not, while a doer-parked
//      contract and a standing detector are still re-armed; the new last step re-parks a circular row a producer wrote active again;
//   5. fm-parked-contract-unprobed does not read the parked issues as unprobed (it would have read 27) and still reads a doer-parked one;
//   6. the parked issues stay in v_issue_age (the 120-minute SLA base) and now count in the without-doer column of v_stuck_summary;
//   7. fm-loop-owned-contract-circular reads 0 after the file and 1 for an active circular row; failure mode, control row and decision
//      row exist once; a second apply changes nothing; the Rollback header restores the triggers, rows and red-drain; the file passes
//      scripts/apply_migrations.py --check; the trigger graph is not deeper than before.
//   8. (added at landing, package LA) the dead-end detector fm-open-issue-no-doer (DEAD-END-DOER-1, merged to main the same day) skips the parked
//      loop-owned issues: without the carve-out the park would turn 27 owned issues into dead ends and name a probe author as their actor.
// Run: node migrations/loop-owned-contract-monitoring.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const MIG_URL = new URL("./2026-10-19-loop-owned-contract-monitoring.sql", import.meta.url);
const mig = readFileSync(MIG_URL, "utf8");
const collapse = readFileSync(new URL("./2026-10-18-collapse-probe-templates.sql", import.meta.url), "utf8");
const canon = JSON.parse(readFileSync(new URL("../docs/fleet-tasks-canonical.json", import.meta.url), "utf8")).tasks["red-drain"];

let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d))); } };
const all = (db, sql, ...p) => db.prepare(sql).all(...p);
const one = (db, sql, ...p) => db.prepare(sql).get(...p);
const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();
const throws = (fn) => { try { fn(); return null; } catch (e) { return String(e && e.message); } };

const LV = "monitoring:loop-owned-48h (the filing loop closes it; SLA-120M-2 escalation and the stale view report it)";
const CIRCULAR = "SELECT status FROM agent_issues WHERE id =";

// ---- live shapes (qnfo-audit sqlite_master, 2026-10-19 12:2xZ) -------------------------------------------------------------------
const DDL = `
CREATE TABLE agent_issues (id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT, description TEXT, source TEXT, category TEXT DEFAULT 'optimization', priority TEXT DEFAULT 'medium', status TEXT DEFAULT 'open', linked_session TEXT, created_at INTEGER, updated_at INTEGER, pipeline_stage TEXT DEFAULT NULL, predicate_id TEXT, recheck_count INTEGER DEFAULT 0, close_channel TEXT);
CREATE TABLE issue_triage (issue_id INTEGER PRIMARY KEY, rc TEXT NOT NULL, triage_state TEXT NOT NULL DEFAULT 'triaged', owner TEXT NOT NULL, sla_due_at TEXT NOT NULL, triaged_at TEXT DEFAULT (datetime('now')), remediation TEXT, close_evidence TEXT, reopened_count INTEGER NOT NULL DEFAULT 0);
CREATE TABLE issue_source_hosts (source TEXT PRIMARY KEY, host TEXT NOT NULL, note TEXT, ts TEXT DEFAULT (datetime('now')));
CREATE TABLE service_registry (service TEXT PRIMARY KEY, kind TEXT NOT NULL DEFAULT 'worker', version TEXT, base_url TEXT, purpose TEXT, capabilities TEXT, routes TEXT, tools TEXT, models TEXT, deps TEXT, updated_at TEXT, state TEXT NOT NULL DEFAULT 'live');
CREATE TABLE work_claims (id INTEGER PRIMARY KEY, issue_id INTEGER, released_at TEXT, expires_at TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0);
CREATE TABLE remediation_verifications (id INTEGER PRIMARY KEY AUTOINCREMENT, issue_id INTEGER, class TEXT, action_ref INTEGER, probe_url TEXT, transport TEXT NOT NULL, expected TEXT, observed TEXT, pass INTEGER NOT NULL, verified_at TEXT DEFAULT (datetime('now')), verifier TEXT);
CREATE TABLE fleet_tasks (id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL, definition TEXT NOT NULL, timeout_ms INTEGER NOT NULL DEFAULT 30000, retries INTEGER NOT NULL DEFAULT 1, version INTEGER NOT NULL DEFAULT 1, enabled INTEGER NOT NULL DEFAULT 1, updated_at TEXT);
CREATE TABLE fleet_tasks_canonical (id TEXT PRIMARY KEY, definition TEXT NOT NULL, repo_path TEXT, exported_at TEXT DEFAULT (datetime('now')));
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')), guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')), disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL, issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TABLE code_tasks (id TEXT PRIMARY KEY, goal TEXT, status TEXT, created_at TEXT);
CREATE TABLE issue_plans (issue_id INTEGER PRIMARY KEY, outcome TEXT);
CREATE VIEW v_issue_age AS SELECT a.id, a.priority, a.title, CAST(((CAST(strftime('%s', 'now') AS INTEGER) * 1000) - a.created_at) / 60000 AS INTEGER) AS age_min, CAST(((CAST(strftime('%s', 'now') AS INTEGER) * 1000) - a.created_at) / 3600000 AS INTEGER) AS age_h, NULL AS last_bump FROM agent_issues a WHERE a.status = 'open';
`;

// the DEAD-END-DOER-1 view and detector probe exactly as main has them (migrations/2026-10-19-contract-dead-end-doer.sql)
const DEAD_END_VIEW = /CREATE VIEW IF NOT EXISTS v_issue_dead_end AS[\s\S]*?;\n/.exec(readFileSync(new URL("./2026-10-19-contract-dead-end-doer.sql", import.meta.url), "utf8"))[0];
const OLD_DEAD_END_PROBE = "SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM v_issue_dead_end WHERE lane <> 'task-in-flight') AS TEXT) AS observed";

// remediation_contracts triggers other than the two this file re-creates, in live creation (rowid) order
const OTHER_TRIGGERS = [
  `CREATE TRIGGER remediation_probe_semicolon_ins AFTER INSERT ON remediation_contracts
WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0
BEGIN
  UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class;
END`,
  `CREATE TRIGGER remediation_probe_semicolon_upd AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_transport LIKE 'd1-query%' AND instr(COALESCE(NEW.verify_probe, ''), ';') > 0
BEGIN
  UPDATE remediation_contracts SET verify_probe = replace(rtrim(trim(verify_probe), ';'), ';', ',') WHERE class = NEW.class;
END`,
  `CREATE TRIGGER remediation_probe_edit_rerun AFTER UPDATE OF verify_probe, verify_transport ON remediation_contracts
WHEN NEW.verify_probe IS NOT OLD.verify_probe OR NEW.verify_transport IS NOT OLD.verify_transport
BEGIN
  UPDATE remediation_contracts SET next_due_at = datetime('now') WHERE class = NEW.class;
END`,
  `CREATE TRIGGER remediation_contracts_cadence_1h_ai AFTER INSERT ON remediation_contracts
WHEN NEW.expected_cadence_h IS NULL OR NEW.expected_cadence_h > 1
BEGIN
  UPDATE remediation_contracts SET expected_cadence_h = 1 WHERE class = NEW.class;
END`,
  `CREATE TRIGGER remediation_contracts_cadence_floor_ai AFTER INSERT ON remediation_contracts
WHEN NEW.issue_id IS NOT NULL AND NEW.status IN ('active', 'needs-machine-probe') AND (NEW.expected_cadence_h IS NULL OR NEW.expected_cadence_h > 1)
BEGIN
  UPDATE remediation_contracts SET expected_cadence_h = 1 WHERE class = NEW.class;
END`,
  `CREATE TRIGGER remediation_contracts_cadence_floor_au AFTER UPDATE OF expected_cadence_h, status ON remediation_contracts
WHEN NEW.issue_id IS NOT NULL AND NEW.status IN ('active', 'needs-machine-probe') AND (NEW.expected_cadence_h IS NULL OR NEW.expected_cadence_h > 1)
BEGIN
  UPDATE remediation_contracts SET expected_cadence_h = 1 WHERE class = NEW.class;
END`,
  `CREATE TRIGGER contract_probe_templates_v1
AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL
BEGIN
  UPDATE remediation_contracts
  SET status = 'active', verify_transport = 'd1-query', module = 'probe-template-v1h', attempts = 0, last_verdict = NULL,
      next_due_at = datetime('now'),
      verify_probe = 'SELECT ''1'' AS expected, CASE WHEN (SELECT hit FROM v_metric_trigger_state WHERE id = '
        || (SELECT CAST(substr(title, 16) AS INTEGER) FROM agent_issues WHERE id = NEW.issue_id)
        || ') = 0 AND (SELECT val FROM v_metric_trigger_state WHERE id = '
        || (SELECT CAST(substr(title, 16) AS INTEGER) FROM agent_issues WHERE id = NEW.issue_id)
        || ') IS NOT NULL THEN CASE WHEN (SELECT COUNT(*) FROM (SELECT observed, verified_at FROM remediation_verifications WHERE class = ''issue-'
        || CAST(NEW.issue_id AS INTEGER)
        || ''' ORDER BY id DESC LIMIT 1) p WHERE p.observed = ''1'' OR (p.observed = ''recovering'' AND datetime(p.verified_at) < COALESCE(datetime((SELECT last_refreshed FROM metric_registry WHERE metric = (SELECT metric_key FROM analytics_metric_triggers WHERE id = '
        || (SELECT CAST(substr(title, 16) AS INTEGER) FROM agent_issues WHERE id = NEW.issue_id)
        || '))), datetime(''now'', ''-50 minutes'')))) > 0 THEN ''1'' ELSE ''recovering'' END ELSE ''0'' END AS observed'
  WHERE class = NEW.class
    AND EXISTS (SELECT 1 FROM agent_issues WHERE id = NEW.issue_id AND title LIKE 'METRIC-TRIGGER-%' AND CAST(substr(title, 16) AS INTEGER) > 0);
END`,
  `CREATE TRIGGER sla_120_guard_contract_ins AFTER INSERT ON remediation_contracts WHEN NEW.status = 'active' AND NEW.expected_cadence_h > 2 BEGIN UPDATE remediation_contracts SET expected_cadence_h = 2 WHERE class = NEW.class; END`,
  `CREATE TRIGGER sla_120_guard_contract_upd AFTER UPDATE OF expected_cadence_h, status ON remediation_contracts WHEN NEW.status = 'active' AND NEW.expected_cadence_h > 2 BEGIN UPDATE remediation_contracts SET expected_cadence_h = 2 WHERE class = NEW.class; END`,
];
// the loop_merged text on main and live (migrations/2026-10-18-collapse-probe-templates.sql; same length 4483 as sqlite_master)
const OLD_MERGED = /CREATE TRIGGER contract_probe_templates_loop_merged AFTER INSERT[\s\S]*?\nEND;/.exec(collapse)[0].slice(0, -1);
// v3_generic as live (CLOSE-PROBE-CIRCULAR-GENERATOR-1, applied by hand 2026-10-18; length 1498 in sqlite_master)
const LIVE_V3 = `CREATE TRIGGER contract_probe_templates_v3_generic AFTER INSERT ON remediation_contracts
WHEN NEW.status = 'needs-machine-probe' AND NEW.issue_id IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM agent_issues a WHERE a.id = NEW.issue_id AND a.title LIKE 'METRIC-TRIGGER-%')
  AND NOT EXISTS (SELECT 1 FROM agent_issues a JOIN service_registry s ON s.service = a.source AND s.state = 'live'
                   WHERE a.id = NEW.issue_id)
BEGIN
  UPDATE remediation_contracts
  SET status = 'superseded', verify_transport = 'd1-query', module = 'probe-template-v3-generic', attempts = 0,
      last_verdict = 'superseded:closure-observing-probe-at-birth (CLOSE-PROBE-CIRCULAR-1: this template observes the guarded issue status, which issue_close_evidence_required only lets change after a close that the same probe blocks; a doer that knows the defect replaces it with a probe that measures it)',
      next_due_at = NULL,
      precondition = 'no earlier birth template matched this issue (ORPHAN-GUARD-BIRTH-1)',
      action = 'VACUOUS-PROBE-V3-1: this contract measures nothing while the issue is open, so it is born superseded and never blocks the close. A doer that knows the defect replaces this probe with one that measures it.',
      verify_probe = 'SELECT ''closed'' AS expected, (SELECT CASE WHEN status IN (''closed'', ''resolved'') THEN ''closed'' ELSE NULL END FROM agent_issues WHERE id = ' || NEW.issue_id || ') AS observed'
  WHERE class = NEW.class AND status = 'needs-machine-probe';
END`;
const AGENT_ISSUE_TRIGGERS = [
  `CREATE TRIGGER agent_issues_birth_contract_ins AFTER INSERT ON agent_issues WHEN NEW.status = 'open' AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id) BEGIN INSERT OR IGNORE INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, max_attempts, escalate_to, expected_cadence_h, status, module) VALUES ('issue-' || NEW.id, NEW.id, 'born with the issue (ORPHAN-GUARD-BIRTH-1)', 'needs-machine-probe', 'needs-machine-probe', 'd1-query', 3, 'qnfo-fleet-control', 1, 'needs-machine-probe', 'birth'); END`,
  `CREATE TRIGGER issue_close_evidence_required
BEFORE UPDATE OF status ON agent_issues
WHEN NEW.status IN ('closed','resolved','wontfix') AND OLD.status NOT IN ('closed','resolved','wontfix')
BEGIN
  SELECT RAISE(ABORT,'close-without-evidence')
    WHERE NOT EXISTS (SELECT 1 FROM issue_triage t WHERE t.issue_id = NEW.id AND t.close_evidence IS NOT NULL AND TRIM(t.close_evidence) <> '');
  -- CLOSE-BINDS-TO-PROBE-1 (2026-10-18): a claim that the defect is GONE must agree with the fleet's own probe.
  -- wontfix is deliberately exempt: declining to fix is a decision, not a claim of resolution.
  SELECT RAISE(ABORT,'close-while-contract-fails')
    WHERE NEW.status IN ('closed','resolved')
      AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = NEW.id
                    AND c.status IN ('active','holding')
                    AND COALESCE(c.last_verdict,'') IN ('fail','vacuous-probe-result','probe-error','probe-not-machine-executable','probe-same-account-host'));
END`,
];
// fm-parked-contract-unprobed as live (PARKED-REARM-1)
const PARKED_PROBE = "SELECT '0' AS expected, CAST((SELECT COUNT(*) FROM agent_issues a WHERE a.status = 'open' AND a.title NOT LIKE 'METRIC-TRIGGER-%' AND EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('escalated', 'monitoring')) AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding')) AND NOT EXISTS (SELECT 1 FROM remediation_verifications v WHERE v.issue_id = a.id AND replace(substr(v.verified_at, 1, 19), 'T', ' ') > datetime('now', '-130 minutes'))) + (SELECT COUNT(*) FROM remediation_contracts WHERE status IN ('escalated', 'monitoring') AND (substr(class, 1, 3) = 'fm-' OR substr(class, 1, 7) = 'belief-')) AS TEXT) AS observed";
// v_stuck_summary.issues_without_doer_3h as live (QUEUE-SLA-1)
const WITHOUT_DOER = `SELECT COUNT(*) AS n FROM agent_issues a WHERE a.status = 'open' AND a.created_at < (CAST(strftime('%s', 'now') AS INTEGER) - 7200) * 1000
     AND COALESCE(a.description, '') NOT LIKE '%code-task:%'
     AND NOT EXISTS (SELECT 1 FROM remediation_contracts c WHERE c.issue_id = a.id AND c.status IN ('active', 'holding') AND c.verify_probe NOT LIKE 'needs%')
     AND NOT EXISTS (SELECT 1 FROM work_claims w WHERE w.issue_id = a.id AND w.released_at IS NULL AND w.expires_at > strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`;

const SOURCES = [["qnfo-fleet-control", 11], ["qnfo-research-exec", 10], ["qnfo-code-orchestrator", 4], ["radar-hub", 2]];
const hoursAgo = (h) => Date.now() - Math.round(h * 3600e3);

function fresh() {
  const db = new DatabaseSync(":memory:");
  db.exec(DDL);
  db.exec(DEAD_END_VIEW);
  for (const t of OTHER_TRIGGERS) db.exec(t); // semicolon_ins .. sla_120_guard_contract_upd, in live rowid order
  db.exec(OLD_MERGED);   // live rowid 1698
  db.exec(LIVE_V3);      // live rowid 1724, newest, so it fires first
  for (const t of AGENT_ISSUE_TRIGGERS) db.exec(t);
  for (const [s] of SOURCES) db.prepare("INSERT INTO service_registry (service, state) VALUES (?, 'live')").run(s);
  db.prepare("INSERT INTO fleet_tasks (id, name, type, definition, version, enabled, updated_at) VALUES ('red-drain', 'RED-DRAIN-1', 'workflow', ?, 4, 1, 'x')").run(canon.definition);
  db.prepare("INSERT INTO fleet_tasks_canonical (id, definition, repo_path, exported_at) VALUES ('red-drain', ?, 'x', 'x')").run(canon.definition);
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, module, last_verdict) VALUES ('fm-parked-contract-unprobed', NULL, 'PARKED-REARM-1', 'failure-mode detector', ?, 'd1-query', 'qnfo-fleet-control', 1, 'active', 'failure-mode', 'pass')").run(PARKED_PROBE);
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, module) VALUES ('fm-open-issue-no-doer', NULL, 'DEAD-END-DOER-1', 'failure-mode detector', ?, 'd1-query', 'qnfo-fleet-control', 1, 'active', NULL)").run(OLD_DEAD_END_PROBE);
  return db;
}
const file = (db, title, source, ageH, desc) => {
  const r = db.prepare("INSERT INTO agent_issues (title, description, source, status, created_at, updated_at) VALUES (?, ?, ?, 'open', ?, ?)").run(title, desc || "", source, hoursAgo(ageH), hoursAgo(ageH));
  return Number(r.lastInsertRowid);
};
const contract = (db, id) => one(db, "SELECT * FROM remediation_contracts WHERE issue_id = ?", id);
const closeWithEvidence = (db, id) => {
  db.prepare("INSERT INTO issue_triage (issue_id, rc, owner, sla_due_at, close_evidence) VALUES (?, 'rc', 'fleet', 'x', 'the loop reports recovery') ON CONFLICT(issue_id) DO UPDATE SET close_evidence = excluded.close_evidence").run(id);
  return throws(() => db.prepare("UPDATE agent_issues SET status = 'closed' WHERE id = ?").run(id));
};

// the standing state of 2026-10-19 12:26Z: 27 circular active contracts (24 fail, 3 deferred) plus the neighbours that must not move
function seed(db) {
  const ids = { circular: [] };
  let n = 0;
  for (const [src, count] of SOURCES) for (let i = 0; i < count; i++, n++) {
    const id = file(db, "METRIC-REGRESSION-1: m" + n, src, n < 5 ? 80 : 3 + n);
    db.prepare("UPDATE remediation_contracts SET last_verdict = ?, attempts = ? WHERE issue_id = ?").run(n < 24 ? "fail" : "deferred", 10 + n, id);
    ids.circular.push(id);
  }
  // a doer-written probe that kept the template module (live 2158 and 2323 read the improvement loop)
  ids.doer = file(db, "IMPROVEMENT-LOOP-1: doer probe", "qnfo-fleet-control", 30);
  db.prepare("UPDATE remediation_contracts SET verify_probe = ?, last_verdict = 'fail' WHERE issue_id = ?").run("SELECT 'ok' AS expected, 'pending: no improvement loop run recorded' AS observed", ids.doer);
  // a circular row on a closed issue, and the two states that are not live probes
  ids.closed = file(db, "CODE-LOOP-EXHAUSTED-1: closed", "qnfo-code-orchestrator", 40);
  ids.mp = file(db, "owner-filed", "owner", 40);
  db.prepare("UPDATE remediation_contracts SET status = 'needs-machine-probe', module = 'circular-probe-deprecated', verify_probe = ? WHERE issue_id = ?").run("SELECT 'closed' AS expected, (SELECT status FROM agent_issues WHERE id = " + ids.mp + ") AS observed", ids.mp);
  ids.sup = file(db, "session-filed", "owner", 40);
  db.prepare("UPDATE remediation_contracts SET status = 'superseded', module = 'circular-probe-deprecated', verify_probe = ? WHERE issue_id = ?").run("SELECT 'closed' AS expected, (SELECT status FROM agent_issues WHERE id = " + ids.sup + ") AS observed", ids.sup);
  // metric-trigger issue: its metric contract is parked by red-drain step 1 and TRIGGER-RECOVERY-1 owns it
  ids.metric = file(db, "METRIC-TRIGGER-5: ask", "qnfo-fleet-control", 30);
  db.prepare("UPDATE remediation_contracts SET status = 'monitoring', last_verdict = 'monitoring:metric-condition (the probe reads a live metric; the card closes when the metric converges, not by retrying)' WHERE issue_id = ?").run(ids.metric);
  // a doer-parked contract of an open issue (not a METRIC-TRIGGER issue, not the loop template) and a standing detector parked
  ids.escalated = file(db, "DOER-1: escalated", "owner", 50);
  db.prepare("UPDATE remediation_contracts SET status = 'escalated', module = 'issue-contract-bridge', verify_probe = 'SELECT ''ok'' AS expected, ''x'' AS observed' WHERE issue_id = ?").run(ids.escalated);
  db.prepare("INSERT INTO remediation_contracts (class, issue_id, precondition, action, verify_probe, verify_transport, escalate_to, expected_cadence_h, status, module) VALUES ('fm-some-detector', NULL, 'x', 'failure-mode detector', 'SELECT ''0'' AS expected, ''0'' AS observed', 'd1-query', 'qnfo-fleet-control', 1, 'monitoring', 'failure-mode')").run();
  // the closed issue: closed before the contract could read fail
  db.prepare("UPDATE remediation_contracts SET last_verdict = NULL WHERE issue_id = ?").run(ids.closed);
  closeWithEvidence(db, ids.closed);
  db.prepare("UPDATE remediation_contracts SET last_verdict = 'pass' WHERE issue_id = ?").run(ids.closed);
  return ids;
}
const circularActive = (db) => one(db, `SELECT COUNT(*) AS n FROM remediation_contracts c JOIN agent_issues a ON a.id = c.issue_id WHERE a.status = 'open' AND c.status IN ('active', 'holding') AND instr(c.verify_probe, '${CIRCULAR}') > 0`).n;
const triggerSql = (db, name) => (one(db, "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?", name) || {}).sql;
const triggerOrder = (db) => all(db, "SELECT name FROM sqlite_master WHERE type = 'trigger' AND tbl_name = 'remediation_contracts' ORDER BY rowid").map((r) => r.name);
const steps = (db) => JSON.parse(one(db, "SELECT definition FROM fleet_tasks WHERE id = 'red-drain'").definition).steps;
const step6 = (db) => db.exec(steps(db).find((s) => s.sql.includes("rearmed: PARKED-REARM-1")).sql);
const lastStep = (db) => { const s = steps(db); db.exec(s[s.length - 1].sql); };
const detector = (db, cls) => one(db, "SELECT verify_probe FROM remediation_contracts WHERE class = ?", cls)?.verify_probe;
const observed = (db, cls) => { const p = detector(db, cls); return p ? one(db, p).observed : null; };
const snapshot = (db) => JSON.stringify({
  triggers: all(db, "SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name"),
  contracts: all(db, "SELECT * FROM remediation_contracts ORDER BY class"),
  tasks: all(db, "SELECT * FROM fleet_tasks ORDER BY id"), canonical: all(db, "SELECT definition, repo_path FROM fleet_tasks_canonical ORDER BY id"),
  fm: all(db, "SELECT * FROM failure_modes ORDER BY fm_key"), ctl: all(db, "SELECT * FROM control_registry ORDER BY control"),
  dec: all(db, "SELECT actor, action FROM decision_log ORDER BY id"),
  bak: ["bak_20261019_loop_owned_triggers", "bak_20261019_loop_owned_contracts", "bak_20261019_loop_owned_task"].map((t) => all(db, "SELECT * FROM " + t)),
});

// ---- 0. fixture: the live shapes are what the issue describes --------------------------------------------------------------------
ok(OLD_MERGED.length === 4483 && LIVE_V3.length === 1498, "fixture triggers have the live sqlite_master lengths", [OLD_MERGED.length, LIVE_V3.length]);
const pre = fresh();
const ids = seed(pre);
ok(circularActive(pre) === 27 && ids.circular.length === 27, "fixture: 27 circular active contracts on open issues", circularActive(pre));
ok(one(pre, "SELECT COUNT(*) AS n FROM remediation_contracts WHERE status = 'active' AND last_verdict = 'fail' AND instr(verify_probe, ?) > 0", CIRCULAR).n === 24, "fixture: 24 of them read fail");
ok(contract(pre, ids.circular[0]).module === "probe-template-v2d-loop" && contract(pre, ids.circular[0]).status === "active", "fixture: the old template births an active v2d-loop contract", contract(pre, ids.circular[0]));
ok(contract(pre, ids.doer).module === "probe-template-v2d-loop" && !contract(pre, ids.doer).verify_probe.includes(CIRCULAR), "fixture: the doer probe keeps the template module");
ok(triggerOrder(pre).slice(-2).join() === "contract_probe_templates_loop_merged,contract_probe_templates_v3_generic", "fixture: v3_generic is the newest trigger, loop_merged the one before", triggerOrder(pre));

// ---- 1. the defect, on the pre-fix code ------------------------------------------------------------------------------------------
{
  const e = closeWithEvidence(pre, ids.circular[0]);
  ok(e && e.includes("close-while-contract-fails"), "PRE-FIX: the filing loop cannot close its own issue while the birth contract reads fail", e);
  ok(one(pre, "SELECT status FROM agent_issues WHERE id = ?", ids.circular[0]).status === "open", "PRE-FIX: the issue is still open");
  // a contract the loop-owned template parked without the red-drain change is re-armed by PARKED-REARM-1 within the hour
  const naive = fresh(); const nids = seed(naive);
  naive.exec(`UPDATE remediation_contracts SET status = 'monitoring', last_verdict = '${LV}' WHERE status = 'active' AND instr(verify_probe, '${CIRCULAR}') > 0`);
  ok(circularActive(naive) === 0, "naive park: no circular contract is active right after the update");
  step6(naive);
  ok(circularActive(naive) === 27, "naive park: red-drain step 6 sets all 27 back to active (PARKED-REARM-1), so the park alone does nothing", circularActive(naive));
  ok(contract(naive, nids.circular[0]).last_verdict.startsWith("rearmed: PARKED-REARM-1"), "naive park: the re-arm stamps rearmed");
  // and the detector counts every parked issue as unprobed
  const naive2 = fresh(); seed(naive2);
  ok(observed(naive2, "fm-parked-contract-unprobed") === "2", "baseline: fm-parked-contract-unprobed reads the doer-parked issue and the parked standing detector", observed(naive2, "fm-parked-contract-unprobed"));
  naive2.exec(`UPDATE remediation_contracts SET status = 'monitoring', last_verdict = '${LV}' WHERE status = 'active' AND instr(verify_probe, '${CIRCULAR}') > 0`);
  ok(observed(naive2, "fm-parked-contract-unprobed") === "29", "naive park: fm-parked-contract-unprobed would read 29 (27 more) and file an issue", observed(naive2, "fm-parked-contract-unprobed"));
}

// ---- 2. header the runner needs -------------------------------------------------------------------------------------------------
ok(/^-- APPLY-BY: ci$/m.test(mig) && /^-- DB: qnfo-audit$/m.test(mig), "header opts in to CI on qnfo-audit");
ok(/^-- BACKUP: bak_20261019_loop_owned_triggers$/m.test(mig), "header names its BACKUP table");
const rbLine = (/^-- Rollback: (.*)$/m.exec(mig) || [])[1] || "";
ok(rbLine.length > 1000 && !/\n/.test(rbLine), "the Rollback header is one line of SQL", rbLine.length);
ok(/^-- spof-review: .{12,}/m.test(mig), "header carries its spof-review answer");
ok(!/claude\.ai/i.test(mig) && !/#\d{2,}/.test(mig) && !/skip[ -]?ci/i.test(mig), "no claude.ai link, no bare issue number, no skip-CI token");
{
  const py = spawnSync("python3", ["-I", fileURLToPath(new URL("../scripts/apply_migrations.py", import.meta.url)), "--check", fileURLToPath(MIG_URL)], { encoding: "utf8" });
  if (py.error) console.log("note: python3 not available, apply_migrations --check skipped");
  else ok(py.status === 0 && /"ok": true/.test(py.stdout), "scripts/apply_migrations.py --check accepts the file", (py.stdout + py.stderr).slice(0, 300));
}

// ---- 3. apply ---------------------------------------------------------------------------------------------------------------------
const db = pre;
const before = { rows: all(db, "SELECT * FROM remediation_contracts ORDER BY class"), merged: triggerSql(db, "contract_probe_templates_loop_merged"), v3: triggerSql(db, "contract_probe_templates_v3_generic") };
db.exec(mig);

ok(circularActive(db) === 0, "after the apply no circular contract of an open issue is active or holding (the cluster after-apply probe)", circularActive(db));
const parked = all(db, "SELECT * FROM remediation_contracts WHERE status = 'monitoring' AND last_verdict = ?", LV);
ok(parked.length === 27 && parked.every((r) => ids.circular.includes(r.issue_id)), "exactly the 27 standing circular rows are parked with the monitoring verdict", parked.length);
ok(parked.every((r) => r.next_due_at === null && r.module === "probe-template-v2d-loop" && r.verify_probe.includes(CIRCULAR) && r.action.startsWith("LOOP-OWNED-CONTRACT-MONITORING-1")), "a parked row keeps its module and owner text, has no due time and says why", parked[0]);
const same = (id) => JSON.stringify(contract(db, id)) === JSON.stringify(before.rows.find((r) => r.issue_id === id));
ok(same(ids.doer) && contract(db, ids.doer).status === "active" && contract(db, ids.doer).last_verdict === "fail", "a doer probe under the template module is untouched");
ok(same(ids.closed) && same(ids.mp) && same(ids.sup) && same(ids.metric) && same(ids.escalated), "closed-issue, needs-machine-probe, superseded, metric-condition and doer-escalated rows are untouched");
ok(one(db, "SELECT COUNT(*) AS n FROM remediation_contracts WHERE status = 'monitoring' AND last_verdict LIKE 'monitoring:metric-condition%'").n === 1, "the red-drain metric-condition park of a METRIC-TRIGGER issue stays");

// 3a. every formerly blocked issue now closes with evidence; a real failing contract still blocks
{
  const blocked = ids.circular.filter((id) => closeWithEvidence(db, id));
  ok(blocked.length === 0, "all 27 loop-filed issues close with close_evidence after the apply", blocked);
  ok(all(db, "SELECT id FROM agent_issues WHERE id IN (" + ids.circular.join() + ") AND status <> 'closed'").length === 0, "and they are closed");
  const still = closeWithEvidence(db, ids.doer);
  ok(still && still.includes("close-while-contract-fails"), "a doer probe that reads fail still blocks the close (CLOSE-BINDS-TO-PROBE-1 keeps its force)", still);
}

// 3b. a contract born after the file is monitoring; the trigger order is kept
{
  const id = file(db, "RESEARCH-TERMINAL zz: review", "qnfo-research-exec", 0.1);
  const c = contract(db, id);
  ok(c.status === "monitoring" && c.last_verdict === LV && c.module === "probe-template-v2d-loop" && c.attempts === 0, "a loop-filed issue is born with a monitoring contract", c);
  ok(c.precondition.includes("fleet loop") && c.verify_probe.includes(CIRCULAR + " " + id), "the born row keeps the owner precondition and its probe text", c.precondition);
  ok(closeWithEvidence(db, id) === null, "and the loop closes the new issue at once, with no abort");
  const unmapped = contract(db, file(db, "PORTFOLIO-1: x", "portfolio-lifecycle", 0.1));
  ok(unmapped.module === "probe-template-v3-generic" && unmapped.status === "superseded", "an unmapped label is still claimed by v3_generic (the trigger order trap is avoided)", unmapped);
  const metric = contract(db, file(db, "METRIC-TRIGGER-7: m", "qnfo-fleet-control", 0.1));
  ok(metric.module === "probe-template-v1h" && metric.status === "active", "a METRIC-TRIGGER issue still gets the metric template", metric);
  db.prepare("INSERT INTO issue_source_hosts (source, host) VALUES ('radar-hub', 'qnfo-fleet-control')").run();
  const mapped = contract(db, file(db, "MAPPED-1: x", "radar-hub", 0.1));
  ok(mapped.status === "monitoring" && mapped.module === "probe-template-v2c-loop", "a mapped live loop label is parked too, keeping its v2c module", mapped);
  const mappedOnly = contract(db, file(db, "MAPPED-2: x", "mapped-loop", 0.1));
  ok(mappedOnly.module === "probe-template-v3-generic" && mappedOnly.status === "superseded", "a mapped label that is not a live service stays with v3_generic", mappedOnly);
  const sess = contract(db, file(db, "SESSION-1: x", "session_abc", 0.1));
  ok(sess.status === "superseded" && sess.module === "probe-template-v3-generic", "a session-filed issue is unchanged (v3_generic)", sess);
}
ok(triggerOrder(db).slice(-2).join() === "contract_probe_templates_loop_merged,contract_probe_templates_v3_generic", "v3_generic is again the newest trigger", triggerOrder(db));
ok(norm(triggerSql(db, "contract_probe_templates_v3_generic")) === norm(LIVE_V3), "v3_generic keeps its live text");
{
  const nm = triggerSql(db, "contract_probe_templates_loop_merged");
  const whenOf = (s) => /\nWHEN[\s\S]*?\nBEGIN/.exec(s)[0];
  ok(whenOf(nm) === whenOf(before.merged), "the WHEN clause of loop_merged is unchanged");
  ok(/SET status = 'monitoring'/.test(nm) && !/SET status = 'active'/.test(nm), "the body births monitoring");
}

// ---- 4. PARKED-REARM-1 carve-out and the hourly park ------------------------------------------------------------------------
{
  const t = one(db, "SELECT version, definition FROM fleet_tasks WHERE id = 'red-drain'");
  const st = JSON.parse(t.definition).steps;
  ok(t.version === 5 && st.length === 8 && t.definition.includes("LOOP-OWNED-CONTRACT-MONITORING-1"), "red-drain is version 5 with one new last step", [t.version, st.length]);
  ok(one(db, "SELECT definition FROM fleet_tasks_canonical WHERE id = 'red-drain'").definition === t.definition, "the canonical row follows the live definition");
  ok(one(db, "SELECT repo_path FROM fleet_tasks_canonical WHERE id = 'red-drain'").repo_path === "migrations/2026-10-19-loop-owned-contract-monitoring.sql", "the canonical row names this file");
  ok(JSON.stringify(st.slice(0, 6)) === JSON.stringify(JSON.parse(canon.definition).steps.slice(0, 6)), "steps 0 to 5 are byte for byte what they were");
  ok(!!st[7] && st[7].type === "sql" && st[7].db === "AUDIT" && st[7].sql.includes("LOOP-OWNED-CONTRACT-MONITORING-1"), "the new last step is an AUDIT sql step", st[7] && st[7].type);
}
{
  // the parked rows are not re-armed; the contracts a loop-owned issue would need are not touched by anything but the park
  const d2 = fresh(); const i2 = seed(d2); d2.exec(mig);
  // make every parked issue a candidate for step 6: open, not METRIC-TRIGGER, no active or holding sibling, no verification in 50 minutes
  step6(d2);
  ok(circularActive(d2) === 0 && all(d2, "SELECT 1 FROM remediation_contracts WHERE status = 'monitoring' AND last_verdict = ?", LV).length === 27, "red-drain step 6 leaves the 27 parked rows alone", circularActive(d2));
  ok(contract(d2, i2.escalated).status === "active" && contract(d2, i2.escalated).last_verdict.startsWith("rearmed: PARKED-REARM-1"), "step 6 still re-arms a doer-parked contract of an open issue");
  ok(one(d2, "SELECT status FROM remediation_contracts WHERE class = 'fm-some-detector'").status === "active", "step 6 still re-arms a parked standing detector");
  ok(contract(d2, i2.metric).status === "monitoring", "step 6 still leaves a METRIC-TRIGGER park to TRIGGER-RECOVERY-1");
  // a doer who replaces the circular probe with one that measures the defect needs no status change: the carve-out reads the probe text,
  // so the next PARKED-REARM-1 pass arms the new probe (CLAUDE.md: a doer that knows the defect replaces the probe)
  const mine = i2.circular[0];
  d2.prepare("UPDATE remediation_contracts SET verify_probe = ? WHERE issue_id = ?").run("SELECT 'ok' AS expected, 'pending: the metric has not converged' AS observed", mine);
  ok(contract(d2, mine).status === "monitoring", "a replaced probe on a parked row is still parked until the sweep");
  step6(d2);
  ok(contract(d2, mine).status === "active" && contract(d2, mine).last_verdict.startsWith("rearmed: PARKED-REARM-1"), "the next step 6 arms a probe a doer wrote over the circular one", contract(d2, mine));
  lastStep(d2);
  ok(contract(d2, mine).status === "active", "and the hourly park does not take it back (it no longer reads the status of its own issue)");
  // a producer that re-creates the old trigger text writes circular active rows again: the last step parks them
  d2.exec("DROP TRIGGER contract_probe_templates_loop_merged"); d2.exec("DROP TRIGGER contract_probe_templates_v3_generic");
  d2.exec(OLD_MERGED); d2.exec(LIVE_V3);
  const again = file(d2, "METRIC-REGRESSION-1: reborn", "qnfo-fleet-control", 3);
  ok(contract(d2, again).status === "active" && circularActive(d2) === 1, "an old-text producer writes a circular active contract again", contract(d2, again));
  ok(observed(d2, "fm-loop-owned-contract-circular") === "1", "the detector reads 1 for it", observed(d2, "fm-loop-owned-contract-circular"));
  throws(() => lastStep(d2));
  const re = contract(d2, again);
  ok(re.status === "monitoring" && re.last_verdict === LV && circularActive(d2) === 0, "the hourly last step parks it", re);
  ok(observed(d2, "fm-loop-owned-contract-circular") === "0", "and the detector reads 0 again");
  ok(contract(d2, i2.doer).status === "active" && contract(d2, i2.escalated).status === "active", "the last step touches no other row");
  const parkedMig = all(db, "SELECT class, status, last_verdict, next_due_at, action FROM remediation_contracts WHERE status = 'monitoring' AND last_verdict = ? AND issue_id IN (" + i2.circular.join() + ") ORDER BY class", LV);
  const parkedSweep = all(d2, "SELECT class, status, last_verdict, next_due_at, action FROM remediation_contracts WHERE status = 'monitoring' AND last_verdict = ? AND class = 'issue-" + again + "'", LV);
  ok(parkedSweep.length === 1 && parkedMig.length > 0 && parkedSweep[0].action === parkedMig[0].action && parkedSweep[0].next_due_at === parkedMig[0].next_due_at, "the sweep writes the same state as the file", [parkedSweep[0], parkedMig[0]]);
}

// ---- 5. detectors -------------------------------------------------------------------------------------------------------------
{
  const dp = detector(db, "fm-parked-contract-unprobed");
  ok(dp.includes("probe-template-v2%-loop") && dp !== PARKED_PROBE, "fm-parked-contract-unprobed carries the carve-out");
  const d3 = fresh(); const i3 = seed(d3); d3.exec(mig);
  ok(observed(d3, "fm-parked-contract-unprobed") === "2", "after the apply the parked loop-owned issues are not read as unprobed; the doer-escalated issue and the parked detector still are", observed(d3, "fm-parked-contract-unprobed"));
  // DEAD-END-DOER-1 interplay: the old detector probe would list every parked loop-owned issue as a dead end
  ok(one(d3, OLD_DEAD_END_PROBE).observed === "30", "the unmodified dead-end probe would read 30 after the park (27 owned issues and 3 real dead ends)", one(d3, OLD_DEAD_END_PROBE));
  const dd = detector(d3, "fm-open-issue-no-doer");
  ok(dd !== OLD_DEAD_END_PROBE && dd.includes("monitoring:loop-owned-48h") && !dd.includes(";"), "fm-open-issue-no-doer carries the loop-owned carve-out and no semicolon", dd);
  ok(observed(d3, "fm-open-issue-no-doer") === "3", "and reads only the 3 real dead ends (needs-machine-probe, superseded, doer-escalated)", observed(d3, "fm-open-issue-no-doer"));
  const d7 = fresh(); seed(d7);
  ok(one(d7, OLD_DEAD_END_PROBE).observed === "3", "before the file the 27 owned issues hold an active contract, so they are not dead ends", one(d7, OLD_DEAD_END_PROBE));
  d7.exec("UPDATE remediation_contracts SET verify_probe = verify_probe || ' ' WHERE class = 'fm-open-issue-no-doer'");
  d7.exec(mig);
  ok(detector(d7, "fm-open-issue-no-doer") === OLD_DEAD_END_PROBE + " ", "a dead-end probe another session changed is left alone (the edit is guarded on the exact old text)");
  d3.prepare("INSERT INTO remediation_verifications (issue_id, class, transport, pass, verified_at) VALUES (?, ?, 'd1-query', 0, datetime('now'))").run(i3.escalated, "issue-" + i3.escalated);
  ok(observed(d3, "fm-parked-contract-unprobed") === "1", "a verification inside the window still clears the issue (the parked detector stays counted)", observed(d3, "fm-parked-contract-unprobed"));
  const dc = one(d3, "SELECT * FROM remediation_contracts WHERE class = 'fm-loop-owned-contract-circular'");
  ok(dc && dc.status === "active" && dc.issue_id === null && dc.verify_transport === "d1-query" && dc.escalate_to === "qnfo-fleet-control" && dc.expected_cadence_h === 1, "the detector contract is an active hourly d1-query row", dc);
  const r = dc ? one(d3, dc.verify_probe) : {};
  ok(r.expected === "0" && r.observed === "0", "the detector passes right after the apply", r);
  // an active circular contract of an open issue reads 1 whatever its verdict; a parked or closed one does not
  const open = file(d3, "x", "qnfo-fleet-control", 3);
  d3.exec(`UPDATE remediation_contracts SET status = 'active', last_verdict = 'deferred' WHERE issue_id = ${open}`);
  ok(observed(d3, "fm-loop-owned-contract-circular") === "1", "the detector reads 1 for an active circular row", observed(d3, "fm-loop-owned-contract-circular"));
  d3.exec(`UPDATE remediation_contracts SET status = 'holding' WHERE issue_id = ${open}`);
  ok(observed(d3, "fm-loop-owned-contract-circular") === "1", "and for a holding one");
  d3.exec(`UPDATE remediation_contracts SET status = 'monitoring' WHERE issue_id = ${open}`);
  ok(observed(d3, "fm-loop-owned-contract-circular") === "0", "and 0 once it is parked");
  const fm = one(d3, "SELECT * FROM failure_modes WHERE fm_key = 'loop-owned-contract-circular'");
  ok(fm && fm.probe_class === "fm-loop-owned-contract-circular" && fm.root_cause.length > 40 && fm.remediation.length > 40 && fm.first_seen === "2026-10-19", "the failure mode names its root cause, remediation and detector class", fm && fm.probe_class);
  const cr = one(d3, "SELECT * FROM control_registry WHERE control = 'loop-owned-contract-park'");
  ok(cr && cr.kind === "hold" && cr.critical_path === 0 && cr.disposition === "replace" && cr.disposition_state === "applied" && /expiry/i.test(cr.evidence) && cr.alternate_path.length > 20, "the park is registered with a reason, an expiry and an alternate", cr);
  const dl = all(d3, "SELECT * FROM decision_log");
  ok(dl.length === 1 && dl[0].action.startsWith("LOOP-OWNED-CONTRACT-MONITORING-1:") && dl[0].capability_gain && dl[0].predicted_outcome, "one decision_log row with capability_gain and a predicted outcome", dl.length);
}

// ---- 6. nothing is dropped silently ------------------------------------------------------------------------------------------
{
  const d4 = fresh(); const i4 = seed(d4);
  const wdA = one(d4, WITHOUT_DOER).n, ageA = one(d4, "SELECT COUNT(*) AS n FROM v_issue_age WHERE age_min > 120").n;
  const issuesA = JSON.stringify(all(d4, "SELECT * FROM agent_issues ORDER BY id"));
  d4.exec(mig);
  const wdB = one(d4, WITHOUT_DOER).n, ageB = one(d4, "SELECT COUNT(*) AS n FROM v_issue_age WHERE age_min > 120").n;
  ok(ageB === ageA && ageB >= 27, "every parked issue is still in v_issue_age, the base of the 120-minute SLA", [ageA, ageB]);
  ok(wdB - wdA === 27, "the without-doer column of v_stuck_summary now counts the 27 parked issues (the honest state)", [wdA, wdB]);
  ok(JSON.stringify(all(d4, "SELECT * FROM agent_issues ORDER BY id")) === issuesA, "no agent_issues row is added, removed or changed by the file (nothing is dropped)");
  ok(all(d4, "SELECT id FROM agent_issues WHERE status = 'open'").length === i4.circular.length + 5, "all the loop-filed issues are still open and counted");
}

// ---- 7. idempotent, reversible, not deeper ------------------------------------------------------------------------------------
{
  const d5 = fresh(); seed(d5); d5.exec(mig);
  const s1 = snapshot(d5);
  d5.exec(mig);
  ok(snapshot(d5) === s1, "a second apply changes nothing (triggers, rows, red-drain, registries, backups)");
  ok(one(d5, "SELECT COUNT(*) AS n FROM bak_20261019_loop_owned_triggers").n === 2, "the trigger backup holds both texts");
  ok(one(d5, "SELECT COUNT(*) AS n FROM bak_20261019_loop_owned_contracts").n === 28, "the contract backup holds the 27 moved rows and the detector row");
  ok(one(d5, "SELECT definition FROM bak_20261019_loop_owned_task WHERE id = 'red-drain'").definition === canon.definition, "the red-drain backup holds the pre-file definition");
  const setCols = (s) => [...new Set([...(/UPDATE remediation_contracts\s+SET([\s\S]*?)\bWHERE class = NEW\.class/.exec(s)[1].matchAll(/(?:^|[,\s])(\w+) = /g))].map((m) => m[1]))].sort().join();
  ok(setCols(triggerSql(d5, "contract_probe_templates_loop_merged")) === setCols(OLD_MERGED), "the re-created trigger sets the same columns as the old one, so the D1 depth canary compiles the same programs", [setCols(OLD_MERGED), setCols(triggerSql(d5, "contract_probe_templates_loop_merged"))]);
  ok(all(d5, "SELECT 1 FROM sqlite_master WHERE type = 'trigger'").length === all(fresh(), "SELECT 1 FROM sqlite_master WHERE type = 'trigger'").length, "the file adds and removes no trigger");

  const d6 = fresh(); seed(d6);
  const pre6 = { rows: all(d6, "SELECT * FROM remediation_contracts ORDER BY class"), merged: norm(triggerSql(d6, "contract_probe_templates_loop_merged")), v3: norm(triggerSql(d6, "contract_probe_templates_v3_generic")) };
  d6.exec(mig);
  d6.exec(rbLine);
  ok(norm(triggerSql(d6, "contract_probe_templates_loop_merged")) === pre6.merged, "the Rollback header restores the loop_merged text");
  ok(norm(triggerSql(d6, "contract_probe_templates_v3_generic")) === pre6.v3, "and the v3_generic text");
  ok(triggerOrder(d6).slice(-2).join() === "contract_probe_templates_loop_merged,contract_probe_templates_v3_generic", "and the trigger order");
  // editing a probe re-arms next_due_at (trigger remediation_probe_edit_rerun), so the detector row is compared without its due time
  const strip = (rows) => JSON.stringify(rows.map((r) => (r.class === "fm-parked-contract-unprobed" || r.class === "fm-open-issue-no-doer" ? { ...r, next_due_at: null } : r)));
  const back = all(d6, "SELECT * FROM remediation_contracts WHERE class <> 'fm-loop-owned-contract-circular' ORDER BY class");
  ok(strip(back) === strip(pre6.rows), "and every contract row, the detector probe included", back.filter((r, k) => strip([r]) !== strip([pre6.rows[k]])).slice(0, 1));
  ok(circularActive(d6) === 27, "the 27 circular rows are active again after the rollback");
  const t6 = one(d6, "SELECT version, definition FROM fleet_tasks WHERE id = 'red-drain'");
  ok(t6.definition === canon.definition && t6.version === 4 && one(d6, "SELECT definition FROM fleet_tasks_canonical").definition === canon.definition, "and red-drain, live and canonical");
  ok(!one(d6, "SELECT 1 AS x FROM failure_modes WHERE fm_key = 'loop-owned-contract-circular'") && !one(d6, "SELECT 1 AS x FROM control_registry WHERE control = 'loop-owned-contract-park'") && !one(d6, "SELECT 1 AS x FROM remediation_contracts WHERE class = 'fm-loop-owned-contract-circular'"), "and removes the failure mode, the control row and the detector");
  ok(one(d6, "SELECT COUNT(*) AS n FROM decision_log").n === 1, "the append-only decision row stays");
}

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
