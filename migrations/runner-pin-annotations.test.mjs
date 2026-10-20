// RUNNER-PIN-ANNOTATIONS-1 migration suite (migrations/2026-10-20-runner-pin-annotations.sql, agent_issues 100295; companion to
// scripts/runner-pin-annotations.test.mjs, which tests the workflow changes themselves). Proves, on node:sqlite with the live table
// definitions: the header opts in (APPLY-BY ci, DB qnfo-audit, one single-line Rollback that never touches decision_log); the file adds four
// failure modes, four code-read detector contracts, two control_registry rows (DOCTRINE-1: the PR-blocking label guard and the annotation filter,
// both kept, off the critical path, each with its alternate) with one control_alternate_probes row each (CONTROL-ALT-PROBES-1) and one decision row;
// against the live definitions of v_control_alternate_status, v_control_alternate_untested, v_path_coverage_gaps and v_path_coverage_violations the
// apply leaves controls_untested_without_probe (read by the hourly contract fm-control-alternate-undrilled) where it was, the same file without the
// probe rows raises it by two, a passing drill stamps the two controls, and the Rollback removes the probes with the controls;
// a replay changes nothing; each detector, run through the
// consumer's own parse_code_probe and run_code_probe, reads ok on the workflow files on main and fails on a copy that lost its fix
// (present-marker for the absent marker, missing-marker for the others); the Rollback removes what the file added, leaves the decision row,
// leaves a contract a doer re-pointed, removes the two control rows and no other, and the file applies again afterwards.
// Run: node --no-warnings migrations/runner-pin-annotations.test.mjs   -> prints "N passed, 0 failed"
import { DatabaseSync } from "node:sqlite";
import { readFileSync, mkdtempSync, mkdirSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const sql = readFileSync(join(here, "2026-10-20-runner-pin-annotations.sql"), "utf8").replace(/\r\n/g, "\n");
let pass = 0, fail = 0;
const ok = (c, m, d) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (d === undefined ? "" : " :: " + JSON.stringify(d).slice(0, 400))); } };

const lines = sql.split("\n");
const hdr = (k) => (lines.find((l) => new RegExp("^-- " + k + ": ").test(l)) || "").replace(new RegExp("^-- " + k + ": "), "");
const body = lines.filter((l) => !l.startsWith("--")).join("\n");
const rollback = hdr("Rollback");
ok(hdr("APPLY-BY") === "ci" && hdr("DB") === "qnfo-audit", "the file opts in with APPLY-BY: ci and DB: qnfo-audit");
ok(lines.filter((l) => /^-- Rollback: /.test(l)).length === 1 && rollback.length > 100, "one single-line Rollback");
ok(!/decision_log/i.test(rollback), "the Rollback never touches decision_log (append-only)");
ok(/DELETE FROM control_registry WHERE control IN \('runner-label-pin-guard', 'selftest-annotation-quiet'\) AND issue_id = 100295/.test(rollback), "the Rollback removes the two control_registry rows by name and issue");
ok(/DELETE FROM control_alternate_probes WHERE control IN \('runner-label-pin-guard', 'selftest-annotation-quiet'\);/.test(rollback) && rollback.indexOf("DELETE FROM control_alternate_probes") < rollback.indexOf("DELETE FROM control_registry"), "the Rollback removes the two probe rows by name, before the control rows");
ok(/two controls registered in control_registry/.test(sql) && !/no new loop, cap, hold or gate/.test(sql), "the spof-review line says two controls are registered (it does not claim the file adds no gate)");
ok(!/stays out of Actions secrets|must NOT be copied|1677/.test(sql), "the file states no standing rule about PILOT_TOKEN that no document holds");
ok(!/\bDELETE\b|\bDROP\b/i.test(body) && hdr("BACKUP") === "", "the body has no DELETE or DROP, so no BACKUP header is needed");
ok(!/claude\.ai|anthropic\.com/i.test(sql) && !/skip[ -]ci/i.test(sql), "no claude.ai or anthropic.com link and no skip-CI token");
ok(!/\b\d+ ?(hours?|days?)\b/i.test(sql), "no duration is stated in hours or days");

const DDL = `
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT, last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TRIGGER remediation_contracts_cadence_1h_ai AFTER INSERT ON remediation_contracts
WHEN NEW.expected_cadence_h IS NULL OR NEW.expected_cadence_h > 1
BEGIN
  UPDATE remediation_contracts SET expected_cadence_h = 1 WHERE class = NEW.class;
END;
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT, first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE control_registry (
  control TEXT PRIMARY KEY,
  location TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')),
  guards_against TEXT,
  critical_path INTEGER NOT NULL DEFAULT 0,
  disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')),
  disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')),
  alternate_path TEXT,
  alternate_tested_at TEXT,
  evidence TEXT NOT NULL,
  issue_id INTEGER,
  reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE TABLE control_alternate_probes (
  control TEXT PRIMARY KEY,
  probe_sql TEXT NOT NULL,
  window_note TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run_at TEXT,
  last_pass INTEGER,
  last_pass_at TEXT,
  last_observed TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
CREATE TABLE process_contracts (process TEXT PRIMARY KEY, paths_json TEXT);
-- the live definitions of the four views the register is judged by (qnfo-audit sqlite_master, read 2026-10-20 with SELECT)
CREATE VIEW v_control_alternate_status AS
SELECT c.control AS control, c.critical_path AS critical_path, c.disposition AS disposition, c.disposition_state AS disposition_state,
  c.alternate_path AS alternate_path, c.alternate_tested_at AS alternate_tested_at,
  p.enabled AS probe_enabled, p.last_run_at AS last_run_at, p.last_pass AS last_pass, p.last_pass_at AS last_pass_at, p.last_observed AS last_observed,
  p.window_note AS window_note,
  CASE
    WHEN c.alternate_path IS NULL OR trim(c.alternate_path) = '' THEN 'no-alternate'
    WHEN c.disposition = 'remove' AND c.disposition_state = 'applied' THEN 'removed'
    WHEN p.control IS NULL AND c.evidence LIKE '%ALTERNATE-NOT-EXERCISABLE%' THEN 'not-exercisable'
    WHEN p.control IS NULL THEN 'no-probe'
    WHEN p.enabled <> 1 THEN 'probe-disabled'
    WHEN p.last_run_at IS NULL THEN 'probe-never-run'
    WHEN p.last_pass IS NOT 1 THEN 'probe-failing'
    WHEN p.last_pass_at IS NULL OR p.last_pass_at < strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-480 minutes') THEN 'probe-stale'
    ELSE 'drilled'
  END AS drill_state
FROM control_registry c LEFT JOIN control_alternate_probes p ON p.control = c.control;
CREATE VIEW v_control_alternate_untested AS
SELECT
  (SELECT COUNT(*) FROM control_registry WHERE critical_path = 1 AND NOT (disposition = 'remove' AND disposition_state = 'applied') AND alternate_tested_at IS NULL) AS critical_untested_by_register,
  (SELECT COUNT(*) FROM v_control_alternate_status WHERE critical_path = 1 AND drill_state NOT IN ('no-alternate', 'removed', 'not-exercisable', 'drilled')) AS critical_untested_by_probe,
  (SELECT COUNT(*) FROM v_control_alternate_status WHERE critical_path = 1 AND drill_state IN ('probe-disabled', 'probe-never-run', 'probe-failing', 'probe-stale')) AS critical_probe_not_drilled,
  (SELECT COUNT(*) FROM v_control_alternate_status WHERE critical_path = 1 AND drill_state = 'no-probe') AS critical_without_probe,
  (SELECT COUNT(*) FROM v_control_alternate_status WHERE drill_state = 'no-probe' AND alternate_tested_at IS NULL) AS controls_untested_without_probe,
  (SELECT COUNT(*) FROM v_control_alternate_status WHERE drill_state = 'no-probe' AND alternate_tested_at IS NOT NULL) AS controls_hand_stamped_without_probe,
  (SELECT COUNT(*) FROM v_control_alternate_status WHERE drill_state = 'probe-failing') AS probes_failing,
  (SELECT COUNT(*) FROM control_alternate_probes WHERE enabled = 1) AS probes_enabled,
  (SELECT COUNT(*) FROM control_alternate_probes) AS probes_total;
CREATE VIEW v_path_coverage_gaps AS
SELECT
  'control_registry' AS source,
  control AS process,
  kind AS path_kind,
  CASE
    WHEN alternate_path IS NULL OR trim(alternate_path) = '' THEN 'no-alternate'
    WHEN alternate_tested_at IS NULL AND evidence LIKE '%ALTERNATE-NOT-EXERCISABLE%' AND NOT EXISTS (SELECT 1 FROM control_alternate_probes p WHERE p.control = control_registry.control) THEN 'alternate-not-exercisable'
    WHEN alternate_tested_at IS NULL THEN 'alternate-untested'
    ELSE 'ok'
  END AS path_state,
  alternate_path AS alternate,
  alternate_tested_at
FROM control_registry
UNION ALL
SELECT
  'process_contracts' AS source,
  process,
  'contract-paths' AS path_kind,
  CASE
    WHEN json_valid(paths_json) = 0 THEN 'paths-not-json'
    WHEN json_array_length(paths_json) < 2 THEN 'single-path'
    WHEN json_array_length(paths_json) = 2 THEN 'two-paths-no-spare'
    ELSE 'ok'
  END AS path_state,
  NULL AS alternate,
  NULL AS alternate_tested_at
FROM process_contracts;
CREATE VIEW v_path_coverage_violations AS
SELECT source, process, path_kind, path_state, alternate, alternate_tested_at
FROM v_path_coverage_gaps
WHERE path_state NOT IN ('ok', 'alternate-not-exercisable');
CREATE TABLE decision_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL, evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL,
  capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'DOCTRINE-1: decision_log is append-only (doctrine section 12)'); END;
`;
const q = (db, s, ...a) => db.prepare(s).all(...a);
const one = (db, s, ...a) => db.prepare(s).get(...a);
const world = () => {
  const db = new DatabaseSync(":memory:");
  db.exec(DDL);
  db.prepare("INSERT INTO failure_modes (fm_key, failure_mode, root_cause, remediation, detector, probe_class, first_seen, issue_id) VALUES ('migration-run-cancelled-by-concurrency', 'fm', 'rc', 'rem', 'det', 'fm-migration-run-cancelled', '2026-10-12', NULL)").run();
  db.prepare("INSERT INTO decision_log (actor, assumption, action, evidence, outcome, blast_radius, rollback_path) VALUES ('other', 'a', 'AN-OLDER-DECISION-1: x', 'e', 'o', 'b', 'r')").run();
  // worker-size-check carries a hand stamp and no probe, as it does live (controls_hand_stamped_without_probe), so the fixture starts where the live register does: nothing untested without a probe
  db.prepare("INSERT INTO control_registry (control, location, kind, guards_against, critical_path, disposition, disposition_state, alternate_path, alternate_tested_at, evidence) VALUES ('worker-size-check', 'scripts/worker_size_check.py', 'guard', 'an oversized script', 0, 'keep', 'applied', 'the upload refuses', '2026-10-19T09:00:00Z', 'measured')").run();
  db.prepare("INSERT INTO process_contracts (process, paths_json) VALUES ('a-process', '[\"a\",\"b\",\"c\"]')").run();
  return db;
};
const snap = (db) => JSON.stringify(["remediation_contracts", "failure_modes", "control_registry", "control_alternate_probes", "decision_log"].map((t) => q(db, "SELECT * FROM " + t + " ORDER BY 1")));
// the registry state the hourly contract fm-control-alternate-undrilled (controls_untested_without_probe) and the path-coverage view judge
const untested = (d) => one(d, "SELECT controls_untested_without_probe AS n FROM v_control_alternate_untested").n;
const violations = (d) => q(d, "SELECT process, path_state FROM v_path_coverage_violations ORDER BY process").map((r) => r.process + ":" + r.path_state);
const drillState = (d, c) => (one(d, "SELECT drill_state FROM v_control_alternate_status WHERE control = ?", c) || {}).drill_state;
// the chaos drill's control step (qnfo-fleet-control CHAOS-DRILL-1, CONTROL-ALT-PROBES-RUNNER-1): run each enabled probe, pass when expected equals observed, record the run, stamp the control on a pass
const drill = (d) => {
  const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  for (const p of q(d, "SELECT control, probe_sql FROM control_alternate_probes WHERE enabled = 1 ORDER BY control")) {
    const r = q(d, p.probe_sql)[0] || {};
    const pass = r.expected != null && String(r.expected) !== "" && String(r.expected) === String(r.observed == null ? "" : r.observed);
    d.prepare("UPDATE control_alternate_probes SET last_run_at = ?1, last_pass = ?2, last_observed = ?3, last_pass_at = CASE WHEN ?2 = 1 THEN ?1 ELSE last_pass_at END WHERE control = ?4").run(now, pass ? 1 : 0, String(r.observed == null ? "" : r.observed).slice(0, 300), p.control);
    if (pass) d.prepare("UPDATE control_registry SET alternate_tested_at = ?1, reviewed_at = ?1 WHERE control = ?2").run(now, p.control);
  }
};

const KEYS = ["runner-label-drift", "selftest-fixture-annotations", "skipped-run-evicts-pending", "selfheal-cancels-in-flight"];
const db = world();
const before = snap(db);
const untestedBefore = untested(db), violationsBefore = violations(db);
ok(untestedBefore === 0 && violationsBefore.length === 0, "the fixture starts where the live register does: controls_untested_without_probe 0 and no path-coverage violation", { untestedBefore, violationsBefore });
db.exec(sql);

// ---- what the apply added ----
const fms = q(db, "SELECT * FROM failure_modes WHERE issue_id = 100295 ORDER BY fm_key");
ok(JSON.stringify(fms.map((r) => r.fm_key)) === JSON.stringify([...KEYS].sort()), "four failure modes for issue 100295", fms.map((r) => r.fm_key));
ok(fms.every((r) => r.first_seen === "2026-10-20" && r.probe_class === "fm-" + r.fm_key && ["failure_mode", "root_cause", "remediation", "detector", "trigger_condition", "symptom", "blast_radius"].every((k) => typeof r[k] === "string" && r[k].length > 20)), "each names its detector class and fills root cause, remediation, detector, trigger, symptom and blast radius", fms.map((r) => r.fm_key));
const cs = q(db, "SELECT * FROM remediation_contracts WHERE module = 'failure-mode' ORDER BY class");
ok(cs.length === 4 && cs.every((c) => KEYS.includes(c.class.slice(3)) && c.verify_transport === "code-read" && c.status === "active" && c.expected_cadence_h === 1 && c.escalate_to === "qnfo-fleet-control" && c.precondition === "RUNNER-PIN-ANNOTATIONS-1" && c.issue_id === null), "four active hourly code-read detector contracts, one per failure mode", cs.map((c) => [c.class, c.verify_transport, c.status]));
ok(one(db, "SELECT COUNT(*) AS n FROM failure_modes").n === 5 && one(db, "SELECT COUNT(*) AS n FROM decision_log").n === 2, "the existing rows are untouched (one older failure mode and one older decision remain)");

// ---- the two control_registry rows (DOCTRINE-1) ----
const crs = q(db, "SELECT * FROM control_registry WHERE issue_id = 100295 ORDER BY control");
ok(JSON.stringify(crs.map((r) => r.control)) === JSON.stringify(["runner-label-pin-guard", "selftest-annotation-quiet"]), "two control_registry rows for issue 100295", crs.map((r) => r.control));
const cg = crs.find((r) => r.control === "runner-label-pin-guard") || {}, cf = crs.find((r) => r.control === "selftest-annotation-quiet") || {};
ok(cg.kind === "guard" && cf.kind === "filter" && crs.every((r) => r.critical_path === 0 && r.disposition === "keep" && r.disposition_state === "applied"), "the label guard is a guard and the annotation wrapper a filter; both kept and applied, neither on the critical path", crs.map((r) => [r.control, r.kind, r.critical_path, r.disposition, r.disposition_state]));
ok(crs.every((r) => ["location", "guards_against", "alternate_path", "evidence"].every((k) => typeof r[k] === "string" && r[k].length > 40)), "each fills location, guards_against, alternate_path and evidence", crs.map((r) => r.control));
ok(/scripts\/runner-pin-annotations\.test\.mjs/.test(cg.location) && /fm-runner-label-drift/.test(cg.alternate_path) && /ubuntu-26\.04 trial run is green/.test(cg.alternate_path) && /139 of 189 jobs/.test(cg.evidence), "the label guard names its suite, its code-read alternate, the pin comment's release condition and the measured 139 of 189 jobs");
ok(/scripts\/stop-commands\.sh \(4 steps: workflow-lint, fleet-autodeploy, code-task-publish, windows-suite-parity\)/.test(cf.location) && /fm-selftest-fixture-annotations/.test(cf.alternate_path) && /5 \(workflow-lint\), 8 \(fleet-autodeploy\), 1 \(code-task-publish\) and 1 \(windows-suite-parity/.test(cf.evidence), "the annotation filter names its four steps, its code-read alternate and the 5, 8, 1 and 1 measured workflow commands");
ok(one(db, "SELECT COUNT(*) AS n FROM control_registry").n === 3 && one(db, "SELECT disposition_state FROM control_registry WHERE control = 'worker-size-check'").disposition_state === "applied", "the existing control_registry row is untouched");

// ---- the tested alternate (CONTROL-ALT-PROBES-1): the apply must not turn the hourly contract fm-control-alternate-undrilled red ----
// The live contract reads v_control_alternate_untested.controls_untested_without_probe and expects 0. That count is over every control (not only
// critical_path = 1): a control with an alternate_path, no alternate_tested_at, no ALTERNATE-NOT-EXERCISABLE marker and no control_alternate_probes row adds one.
const PROBES = { "runner-label-pin-guard": ["fm-runner-label-drift", "runs-on: ubuntu-latest"], "selftest-annotation-quiet": ["fm-selftest-fixture-annotations", "scripts/stop-commands.sh"] };
const prs = q(db, "SELECT * FROM control_alternate_probes ORDER BY control");
ok(JSON.stringify(prs.map((r) => r.control)) === JSON.stringify(Object.keys(PROBES).sort()) && prs.every((r) => r.enabled === 1 && r.last_run_at === null && r.last_pass === null && r.last_pass_at === null), "one enabled, never-run probe row per new control, none of them stamped by the file", prs.map((r) => [r.control, r.enabled, r.last_run_at]));
ok(untested(db) === untestedBefore && untested(db) === 0, "controls_untested_without_probe (read by fm-control-alternate-undrilled, expected 0) is what it was before the file", { before: untestedBefore, after: untested(db) });
ok(Object.keys(PROBES).every((c) => drillState(db, c) === "probe-never-run"), "both new controls read probe-never-run in v_control_alternate_status, not no-probe", Object.keys(PROBES).map((c) => drillState(db, c)));
ok(one(db, "SELECT COUNT(*) AS n FROM control_registry WHERE alternate_tested_at IS NOT NULL").n === 1 && crs.every((r) => r.alternate_tested_at === null), "the file stamps no alternate_tested_at (only the drill does): the one stamped control is the older worker-size-check");
ok(JSON.stringify(violations(db)) === JSON.stringify(["runner-label-pin-guard:alternate-untested", "selftest-annotation-quiet:alternate-untested"]), "until the first drill pass v_path_coverage_violations lists exactly the two new controls as alternate-untested (the state of every control born with a probe), and nothing else", violations(db));
ok(prs.every((r) => /^SELECT '/.test(r.probe_sql) && !/\b(insert|update|delete|drop|alter|create|replace|pragma|attach|vacuum)\b/i.test(r.probe_sql)), "each probe is a read-only SELECT with no write keyword in its text");
ok(prs.every((r) => /^\d+ minutes: /.test(r.window_note) && !/\b\d+ ?(hours?|days?)\b/i.test(r.window_note)), "each window_note states its window in minutes");
const bareSql = sql.replace(/INSERT OR IGNORE INTO control_alternate_probes[\s\S]*?FROM control_registry c WHERE c\.control = '[a-z-]+';\n/g, "");
const bare = world();
ok(bareSql.length < sql.length && !/INTO control_alternate_probes/.test(bareSql.split("\n").filter((l) => !l.startsWith("--")).join("\n")), "the bare variant is the same file with its two probe inserts cut out");
bare.exec(bareSql);
ok(untested(bare) === untestedBefore + 2 && Object.keys(PROBES).every((c) => drillState(bare, c) === "no-probe"), "without the probe rows the same file raises controls_untested_without_probe by two, which would fail fm-control-alternate-undrilled on its next run (the regression this suite pins)", { bare: untested(bare), before: untestedBefore });
// a passing drill stamps both controls and clears the path-coverage state; a second drill changes nothing
const dr = world();
dr.exec(sql);
drill(dr);
ok(Object.keys(PROBES).every((c) => { const p = one(dr, "SELECT last_pass, last_observed FROM control_alternate_probes WHERE control = ?", c) || {}; return p.last_pass === 1 && p.last_observed === "ok" && drillState(dr, c) === "drilled" && typeof one(dr, "SELECT alternate_tested_at AS t FROM control_registry WHERE control = ?", c).t === "string"; }), "a drill pass records last_pass 1 and observed ok, stamps both controls and reads them drilled");
ok(untested(dr) === 0 && violations(dr).length === 0, "after the drill pass there is no untested control and no path-coverage violation", { untested: untested(dr), violations: violations(dr) });
// each probe fails when the alternate (its detector contract) is gone, switched off, moved to another transport, or no longer reads its marker
for (const [ctl, [cls, marker]] of Object.entries(PROBES)) {
  const obs = (w) => { const row = one(w, "SELECT probe_sql FROM control_alternate_probes WHERE control = ?", ctl); return row ? (q(w, row.probe_sql)[0] || {}) : { expected: "ok", observed: "no probe row" }; };
  const w0 = world(); w0.exec(sql);
  const r0 = obs(w0);
  ok(r0.expected === "ok" && r0.observed === "ok", ctl + ": the probe reads ok on the applied fixture", r0);
  const cases = {
    "the contract is deleted": "DELETE FROM remediation_contracts WHERE class = '" + cls + "'",
    "the contract is escalated": "UPDATE remediation_contracts SET status = 'escalated' WHERE class = '" + cls + "'",
    "the contract moves to d1-query": "UPDATE remediation_contracts SET verify_transport = 'd1-query' WHERE class = '" + cls + "'",
    "the contract no longer reads its marker": "UPDATE remediation_contracts SET verify_probe = '{\"paths\":[\".github/workflows/deploy-gate.yml\"],\"contains\":\"x\"}' WHERE class = '" + cls + "'",
  };
  for (const [why, stmt] of Object.entries(cases)) {
    const w = world(); w.exec(sql); w.exec(stmt);
    const r = obs(w);
    ok(r.expected === "ok" && r.observed !== "ok" && r.observed.includes(cls), ctl + ": the probe fails when " + why, r);
    drill(w);
    ok(drillState(w, ctl) === "probe-failing" && one(w, "SELECT alternate_tested_at AS t FROM control_registry WHERE control = ?", ctl).t === null, ctl + ": a failed drill reads probe-failing and leaves the control unstamped (" + why + ")");
  }
  ok(typeof marker === "string" && JSON.parse(one(w0, "SELECT verify_probe FROM remediation_contracts WHERE class = ?", cls).verify_probe)[cls === "fm-runner-label-drift" ? "absent" : "contains"].includes(marker), ctl + ": the marker the probe asks for is the one the detector contract carries");
}

// ---- the decision row ----
const dl = q(db, "SELECT * FROM decision_log WHERE instr(action, 'RUNNER-PIN-ANNOTATIONS-1:') = 1");
const d = dl[0] || {};
ok(dl.length === 1 && d.actor === "session_01QpQv19uh1padRwZ3u1r766", "one decision_log row, by the session", dl.length);
ok(["assumption", "action", "evidence", "outcome", "blast_radius", "rollback_path", "capability_gain", "predicted_outcome", "reach_gain", "surfaces_tested"].every((k) => typeof d[k] === "string" && d[k].length > 3), "every doctrine column is filled", Object.keys(d).filter((k) => d[k] == null));
ok(!/ within /.test(d.predicted_outcome || "") && /append-only/.test(d.rollback_path || "") && d.outcome_matched === null, "the prediction is prose (no ' within ' for decision_predictions_parse), the rollback path notes the append-only log, outcome_matched is left for the result", d.predicted_outcome);

// ---- replay ----
const once = snap(db);
db.exec(sql);
ok(snap(db) === once && once !== before, "a replay changes nothing");

// ---- the detectors, through the consumer's own functions ----
const PY = (() => { for (const c of ["python3", "python"]) { const r = spawnSync(c, ["-I", "-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" }); if (r.status === 0 && String(r.stdout).trim() === "3") return c; } return null; })();
if (PY === null) console.log("NOTE no python 3 on PATH: the detectors are checked for shape only");
const judge = (probeText, rootDir) => {
  const r = spawnSync(PY, ["-I", "-c", "import sys, json; sys.path.insert(0, sys.argv[1]); import remediation_consumer as rc; p, e = rc.parse_code_probe(sys.argv[2]); print(json.dumps({'err': e, 'observed': rc.run_code_probe(p, sys.argv[3]) if p else None}))", join(root, "scripts"), probeText, rootDir], { encoding: "utf8" });
  try { return JSON.parse(String(r.stdout).trim().split("\n").pop()); } catch (e) { return { err: "no output", observed: null, stderr: String(r.stderr).slice(-300) }; }
};
const probes = Object.fromEntries(cs.map((c) => [c.class, JSON.parse(c.verify_probe)]));
const tmp = mkdtempSync(join(tmpdir(), "rpa-mig-"));
// a copy of the workflow files a detector names, optionally with one file edited
const copyRoot = (name, edit) => {
  const dir = join(tmp, name);
  for (const p of Object.values(probes).flatMap((x) => x.paths)) { mkdirSync(join(dir, p, ".."), { recursive: true }); copyFileSync(join(root, p), join(dir, p)); }
  if (edit) { const [rel, fn] = edit; writeFileSync(join(dir, rel), fn(readFileSync(join(dir, rel), "utf8"))); }
  return dir;
};
ok(probes["fm-runner-label-drift"].paths.length === 20 && probes["fm-runner-label-drift"].absent === "runs-on: ubuntu-latest" && probes["fm-runner-label-drift"].contains === undefined, "the runner-label detector names the 20 busiest workflows (the consumer's maximum) and the absent marker", probes["fm-runner-label-drift"].paths.length);
if (PY !== null) {
  const clean = copyRoot("clean");
  for (const [cls, p] of Object.entries(probes)) {
    const j = judge(JSON.stringify(p), clean);
    ok(j.err === null && j.observed === "ok", "the consumer parses " + cls + " and reads it ok on the workflow files of this tree", j);
  }
  const mut = (cls, rel, fn, expected) => {
    const j = judge(JSON.stringify(probes[cls]), copyRoot("m-" + cls, [rel, fn]));
    ok(j.err === null && j.observed === expected + ":" + rel, cls + " fails (" + expected + ") on a copy that lost its fix", j);
  };
  mut("fm-runner-label-drift", ".github/workflows/ci-watchdog.yml", (t) => t.replace("runs-on: ubuntu-24.04", "runs-on: ubuntu-latest"), "present-marker");
  mut("fm-selftest-fixture-annotations", ".github/workflows/fleet-autodeploy.yml", (t) => t.replace("bash scripts/stop-commands.sh python", "python"), "missing-marker");
  mut("fm-skipped-run-evicts-pending", ".github/workflows/ci-watchdog.yml", (t) => t.replace(/group: \$\{\{.*\}\}/, "group: ci-watchdog"), "missing-marker");
  mut("fm-selfheal-cancels-in-flight", ".github/workflows/container-config-selfheal-cron.yml", (t) => t.replace(/^  cancel-in-progress: false$/m, "  cancel-in-progress: true"), "missing-marker");
  // a comment is not the fix: the marker of the absent detector is not matched by the pin comment, which says "ubuntu-latest becomes" and never "runs-on: ubuntu-latest"
  ok(!/runs-on: ubuntu-latest/.test(readFileSync(join(root, ".github/workflows/deploy-gate.yml"), "utf8")), "the pin comments do not contain the absent marker (a comment cannot trip the detector)");
}

// ---- Rollback ----
const hand = world();
hand.exec(sql);
hand.prepare("UPDATE remediation_contracts SET module = 'a-doer', verify_probe = '{\"paths\":[\"x.yml\"],\"contains\":\"y\"}' WHERE class = 'fm-selfheal-cancels-in-flight'").run();
db.exec(rollback);
ok(one(db, "SELECT COUNT(*) AS n FROM remediation_contracts").n === 0 && one(db, "SELECT COUNT(*) AS n FROM failure_modes WHERE issue_id = 100295").n === 0, "the Rollback removes the four detector contracts and the four failure modes");
ok(one(db, "SELECT COUNT(*) AS n FROM failure_modes").n === 1 && one(db, "SELECT fm_key FROM failure_modes").fm_key === "migration-run-cancelled-by-concurrency", "and nothing of the sibling rows");
ok(one(db, "SELECT COUNT(*) AS n FROM control_registry").n === 1 && one(db, "SELECT control FROM control_registry").control === "worker-size-check", "the Rollback removes the two control_registry rows and leaves the sibling control");
ok(one(db, "SELECT COUNT(*) AS n FROM control_alternate_probes").n === 0 && untested(db) === untestedBefore && JSON.stringify(violations(db)) === JSON.stringify(violationsBefore), "the Rollback removes the two probe rows with the controls: the untested count and the path-coverage violations are what they were before the file");
const drolled = world();
drolled.exec(sql);
drill(drolled);
drolled.exec(rollback);
ok(one(drolled, "SELECT COUNT(*) AS n FROM control_alternate_probes").n === 0 && one(drolled, "SELECT COUNT(*) AS n FROM control_registry").n === 1 && untested(drolled) === untestedBefore, "the Rollback also removes the probes and controls of a drilled (stamped) apply");
ok(one(db, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'RUNNER-PIN-ANNOTATIONS-1:') = 1").n === 1, "the Rollback leaves the decision row");
let refused = false;
try { db.exec("DELETE FROM decision_log WHERE instr(action, 'RUNNER-PIN-ANNOTATIONS-1:') = 1"); } catch (e) { refused = /append-only/.test(String(e.message)); }
ok(refused, "the fixture's append-only trigger refuses a DELETE of the decision row, which is why the Rollback does not try");
hand.exec(rollback);
ok(one(hand, "SELECT module FROM remediation_contracts WHERE class = 'fm-selfheal-cancels-in-flight'").module === "a-doer" && one(hand, "SELECT COUNT(*) AS n FROM remediation_contracts").n === 1, "a detector a doer re-pointed (another module) is not clobbered by the Rollback");
db.exec(sql);
ok(one(db, "SELECT COUNT(*) AS n FROM remediation_contracts").n === 4 && one(db, "SELECT COUNT(*) AS n FROM failure_modes WHERE issue_id = 100295").n === 4 && one(db, "SELECT COUNT(*) AS n FROM control_registry WHERE issue_id = 100295").n === 2 && one(db, "SELECT COUNT(*) AS n FROM control_alternate_probes").n === 2 && untested(db) === untestedBefore && one(db, "SELECT COUNT(*) AS n FROM decision_log WHERE instr(action, 'RUNNER-PIN-ANNOTATIONS-1:') = 1").n === 1, "the file applies again after a Rollback: four detectors, four failure modes, two control rows with their two probes, still one decision row, the untested count still where it was");

rmSync(tmp, { recursive: true, force: true });
console.log(pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
