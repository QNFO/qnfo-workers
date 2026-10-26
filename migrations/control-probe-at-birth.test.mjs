// CONTROL-PROBE-AT-BIRTH-1 offline suite: replays migrations/2026-10-26-control-probe-at-birth.sql on SQLite with the live table shapes.
// Proves: the gate is registered as a control (kind gate, disposition keep, an alternate, this issue as evidence) with its own probe row, so the live detector
// fm-control-alternate-undrilled (controls_untested_without_probe, expected 0) stays 0 and the control reads probe-never-run, not no-probe; the same file without its
// probe row reads 1 (so the assertion can fail); the probe passes while the detector contract is present, active, code-read and reads the marker, fails with the
// reason when any of those is broken and on an empty world; a second apply adds nothing; the Rollback line takes the rows out and keeps the append-only decision;
// the marker the detector reads occurs in scripts/apply_migrations.py.
// Run: node --no-warnings migrations/control-probe-at-birth.test.mjs
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const sql = readFileSync(new URL("./2026-10-26-control-probe-at-birth.sql", import.meta.url), "utf8");
const script = readFileSync(new URL("../scripts/apply_migrations.py", import.meta.url), "utf8");
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) pass++; else { fail++; console.log("FAIL " + m + (x === undefined ? "" : " :: " + JSON.stringify(x).slice(0, 300))); } };
const rollback = /^-- Rollback: (.+)$/m.exec(sql)[1];
ok(!/[^\x00-\x7F]/.test(sql), "the file is ASCII only (D1-WRITE-ASCII-1)");
ok(/^-- APPLY-BY: ci$/m.test(sql) && /^-- DB: qnfo-audit$/m.test(sql), "the opt-in and DB headers are present");
ok(!/\b(DELETE|DROP)\b/i.test(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n")), "the file deletes and drops nothing, so it needs no BACKUP header");
ok(/^-- spof-review: /m.test(sql), "the file carries its spof-review line");

const DDL = `
CREATE TABLE control_registry (control TEXT PRIMARY KEY, location TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('hold', 'filter', 'pause', 'kill-switch', 'gate', 'cap', 'guard', 'lease')),
  guards_against TEXT, critical_path INTEGER NOT NULL DEFAULT 0, disposition TEXT NOT NULL CHECK (disposition IN ('remove', 'demote', 'replace', 'keep')),
  disposition_state TEXT NOT NULL DEFAULT 'planned' CHECK (disposition_state IN ('planned', 'applied')), alternate_path TEXT, alternate_tested_at TEXT, evidence TEXT NOT NULL,
  issue_id INTEGER, reviewed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE TABLE control_alternate_probes (control TEXT PRIMARY KEY, probe_sql TEXT NOT NULL, window_note TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, last_run_at TEXT,
  last_pass INTEGER, last_pass_at TEXT, last_observed TEXT, created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')));
CREATE VIEW v_control_alternate_status AS
SELECT c.control AS control, c.alternate_path AS alternate_path, c.alternate_tested_at AS alternate_tested_at, p.enabled AS probe_enabled, p.last_run_at AS last_run_at,
  CASE
    WHEN c.alternate_path IS NULL OR trim(c.alternate_path) = '' THEN 'no-alternate'
    WHEN c.disposition = 'remove' AND c.disposition_state = 'applied' THEN 'removed'
    WHEN p.control IS NULL AND c.evidence LIKE '%ALTERNATE-NOT-EXERCISABLE%' THEN 'not-exercisable'
    WHEN p.control IS NULL THEN 'no-probe'
    WHEN p.enabled <> 1 THEN 'probe-disabled'
    WHEN p.last_run_at IS NULL THEN 'probe-never-run'
    ELSE 'drilled'
  END AS drill_state
FROM control_registry c LEFT JOIN control_alternate_probes p ON p.control = c.control;
CREATE VIEW v_control_alternate_untested AS
SELECT (SELECT COUNT(*) FROM v_control_alternate_status WHERE drill_state = 'no-probe' AND alternate_tested_at IS NULL) AS controls_untested_without_probe;
CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT NOT NULL, root_cause TEXT NOT NULL, remediation TEXT NOT NULL, detector TEXT NOT NULL, probe_class TEXT,
  first_seen TEXT NOT NULL, issue_id INTEGER, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL,
  max_attempts INTEGER NOT NULL DEFAULT 3, escalate_to TEXT NOT NULL, expected_cadence_h INTEGER, status TEXT DEFAULT 'active', ts TEXT DEFAULT (datetime('now')), last_attempt_at TEXT,
  last_verdict TEXT, module TEXT, budget_ms INTEGER DEFAULT 45000, next_due_at TEXT, max_items INTEGER DEFAULT 5, requires_container INTEGER DEFAULT 0, attempts INTEGER DEFAULT 0, deferred_since TEXT);
CREATE TABLE decision_log (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')), actor TEXT NOT NULL, assumption TEXT NOT NULL, action TEXT NOT NULL,
  evidence TEXT NOT NULL, outcome TEXT NOT NULL, blast_radius TEXT NOT NULL, rollback_path TEXT NOT NULL, capability_gain TEXT, predicted_outcome TEXT, reach_gain TEXT, surfaces_tested TEXT, outcome_matched INTEGER);
CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;
CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'decision_log is append-only'); END;
`;
const fresh = (skip) => {
  const d = new DatabaseSync(":memory:");
  d.exec(DDL);
  // the runner applies statement by statement; split on a semicolon at the end of a line outside a string, as sqlite3.complete_statement does
  let buf = "";
  for (const line of sql.split("\n")) {
    if (line.startsWith("--")) continue;
    buf += line + "\n";
    if (/;\s*$/.test(line) && (buf.match(/'/g) || []).length % 2 === 0) {
      const s = buf.trim();
      buf = "";
      if (s && !(skip && skip(s))) d.exec(s);
    }
  }
  return d;
};
const count = (d, t) => d.prepare("SELECT COUNT(*) AS n FROM " + t).get().n;
const untested = (d) => d.prepare("SELECT controls_untested_without_probe AS n FROM v_control_alternate_untested").get().n;

const d = fresh();
const before = [count(d, "control_registry"), count(d, "control_alternate_probes"), count(d, "failure_modes"), count(d, "remediation_contracts"), count(d, "decision_log")];
ok(JSON.stringify(before) === "[1,1,1,1,1]", "one control, one probe, one failure mode, one detector contract and one decision", before);
const c = d.prepare("SELECT * FROM control_registry WHERE control = 'control-probe-at-birth'").get();
ok(c && c.kind === "gate" && c.disposition === "keep" && c.disposition_state === "applied" && c.issue_id === 1000483 && c.critical_path === 0, "the gate is registered: kind gate, disposition keep, applied, issue 1000483", c);
ok(c && c.alternate_path && c.alternate_path.includes("CONTROL-PROBE: none") && c.alternate_path.includes("fm-control-alternate-undrilled"), "its alternate names the header opt-out and the hourly detector", c && c.alternate_path);
ok(c && c.alternate_tested_at === null, "the file never hand-stamps alternate_tested_at (only a passing chaos drill does)");
ok(c && c.evidence.includes("Revert:") && c.evidence.includes("Tested alternate:"), "the evidence names the revert path and the tested alternate", c && c.evidence.slice(0, 80));
ok(untested(d) === 0 && d.prepare("SELECT drill_state AS s FROM v_control_alternate_status").get().s === "probe-never-run", "the live detector count stays 0 and the control reads probe-never-run, not no-probe");
const bare = fresh((s) => /^INSERT OR IGNORE INTO control_alternate_probes/i.test(s));
ok(untested(bare) === 1 && bare.prepare("SELECT drill_state AS s FROM v_control_alternate_status").get().s === "no-probe", "without its probe row the same file reads no-probe and the detector counts 1 (so the assertion above can fail)");
d.exec(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n"));
const again = [count(d, "control_registry"), count(d, "control_alternate_probes"), count(d, "failure_modes"), count(d, "remediation_contracts"), count(d, "decision_log")];
ok(JSON.stringify(again) === "[1,1,1,1,1]", "a second apply adds nothing", again);

const probe = d.prepare("SELECT probe_sql, window_note, enabled FROM control_alternate_probes WHERE control = 'control-probe-at-birth'").get();
ok(probe.enabled === 1 && /minutes/.test(probe.window_note) && !/\b\d+ ?(hours?|days?|h)\b/.test(probe.window_note), "the probe is enabled and its window is stated in minutes");
ok(/^SELECT 'ok' AS expected, CASE .* END AS observed$/s.test(probe.probe_sql) && !/\b(INSERT|UPDATE|DELETE|DROP|REPLACE)\b/i.test(probe.probe_sql), "the probe is one read-only SELECT of the chaos-drill shape");
const run = (db) => db.prepare(probe.probe_sql).get();
const r0 = run(d);
ok(r0.expected === "ok" && r0.observed === "ok", "the probe passes while the detector contract is present, active, code-read and reads the marker", r0);
for (const [label, mut] of [
  ["is missing", "DELETE FROM remediation_contracts WHERE class = 'fm-control-probe-at-birth-missing'"],
  ["is not active", "UPDATE remediation_contracts SET status = 'paused' WHERE class = 'fm-control-probe-at-birth-missing'"],
  ["is not code-read", "UPDATE remediation_contracts SET verify_transport = 'd1-query' WHERE class = 'fm-control-probe-at-birth-missing'"],
  ["no longer reads the marker", "UPDATE remediation_contracts SET verify_probe = '{\"paths\": [\"scripts/apply_migrations.py\"], \"contains\": \"gone\"}' WHERE class = 'fm-control-probe-at-birth-missing'"],
]) {
  const b = fresh();
  b.exec(mut);
  const r = run(b);
  ok(r.expected === "ok" && r.observed !== "ok" && r.observed.includes("fm-control-probe-at-birth-missing"), "the probe fails with the reason when the detector " + label, r);
}
const empty = new DatabaseSync(":memory:");
empty.exec(DDL);
const re = run(empty);
ok(re.observed !== "ok", "the probe fails on an empty world (no probe passes by absence)", re);

const contract = d.prepare("SELECT verify_probe, verify_transport, status, expected_cadence_h FROM remediation_contracts WHERE class = 'fm-control-probe-at-birth-missing'").get();
const marker = JSON.parse(contract.verify_probe).contains;
ok(contract.verify_transport === "code-read" && contract.status === "active" && contract.expected_cadence_h === 1, "the detector is an active, hourly code-read contract", contract);
ok(marker === "CONTROL-PROBE-AT-BIRTH-1" && script.includes(marker), "the marker the detector reads occurs in scripts/apply_migrations.py", marker);
ok(JSON.parse(contract.verify_probe).paths[0] === "scripts/apply_migrations.py", "and the detector reads that file");
const fm = d.prepare("SELECT probe_class, issue_id FROM failure_modes WHERE fm_key = 'control-probe-at-birth-missing'").get();
ok(fm && fm.probe_class === "fm-control-probe-at-birth-missing" && fm.issue_id === 1000483, "the failure mode points at its fm-<key> contract and the issue", fm);

// Rollback: the registry rows go, the append-only decision stays, and the file applies again afterwards.
const parts = rollback.split("decision_log is append-only")[0];
const rb = fresh();
rb.exec(parts);
const rbc = [count(rb, "control_registry"), count(rb, "control_alternate_probes"), count(rb, "failure_modes"), count(rb, "remediation_contracts"), count(rb, "decision_log")];
ok(JSON.stringify(rbc) === "[0,0,0,0,1]" && untested(rb) === 0, "the Rollback line removes the control, its probe, the failure mode and the detector and keeps the decision", rbc);
rb.exec(sql.split("\n").filter((l) => !l.startsWith("--")).join("\n"));
ok(count(rb, "control_registry") === 1 && count(rb, "control_alternate_probes") === 1 && count(rb, "decision_log") === 1, "and the file applies again after its rollback");

console.log(pass + " passed, " + fail + " failed");
process.exit(fail ? 1 : 0);
