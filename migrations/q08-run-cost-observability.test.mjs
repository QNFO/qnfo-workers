import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("./2026-10-25-q08-run-cost-observability.sql", import.meta.url), "utf8");
const lines = sql.split(/\r?\n/);
const header = (key) => lines.find((line) => line.startsWith("-- " + key + ":"));
const rollback = header("Rollback")?.replace(/^-- Rollback:\s*/, "");
const db = new DatabaseSync(":memory:");
db.exec(`
  CREATE TABLE capability_ledger (
    capability TEXT PRIMARY KEY,
    provenance TEXT NOT NULL,
    prerequisites TEXT,
    reliability TEXT,
    acquired_at TEXT NOT NULL,
    last_exercised_at TEXT,
    evidence TEXT NOT NULL
  );
  CREATE TABLE decision_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    actor TEXT NOT NULL,
    assumption TEXT NOT NULL,
    action TEXT NOT NULL,
    evidence TEXT NOT NULL,
    outcome TEXT NOT NULL,
    blast_radius TEXT NOT NULL,
    rollback_path TEXT NOT NULL,
    capability_gain TEXT,
    predicted_outcome TEXT,
    reach_gain TEXT,
    surfaces_tested TEXT
  );
  CREATE TRIGGER decision_log_no_update BEFORE UPDATE ON decision_log BEGIN SELECT RAISE(ABORT, 'append-only'); END;
  CREATE TRIGGER decision_log_no_delete BEFORE DELETE ON decision_log BEGIN SELECT RAISE(ABORT, 'append-only'); END;
  CREATE TABLE failure_modes (fm_key TEXT PRIMARY KEY, failure_mode TEXT, root_cause TEXT, remediation TEXT, detector TEXT, probe_class TEXT, first_seen TEXT, trigger_condition TEXT, symptom TEXT, blast_radius TEXT);
  CREATE TABLE belief_registry (belief_key TEXT PRIMARY KEY, claim TEXT NOT NULL, confidence REAL, evidence TEXT NOT NULL, probe_class TEXT NOT NULL, built_on TEXT);
  CREATE TABLE remediation_contracts (class TEXT PRIMARY KEY, issue_id INTEGER, precondition TEXT NOT NULL, action TEXT NOT NULL, verify_probe TEXT NOT NULL, verify_transport TEXT NOT NULL, max_attempts INTEGER, escalate_to TEXT, expected_cadence_h INTEGER, status TEXT, module TEXT, next_due_at TEXT);
`);
let pass = 0, fail = 0;
const ok = (condition, message, detail) => {
  if (condition) pass++;
  else {
    fail++;
    console.log("FAIL " + message + (detail === undefined ? "" : " :: " + JSON.stringify(detail).slice(0, 400)));
  }
};

ok(header("APPLY-BY") === "-- APPLY-BY: ci" && header("DB") === "-- DB: qnfo-audit", "migration opts into CI and names qnfo-audit");
ok(["capability_ledger", "failure_modes", "belief_registry", "remediation_contracts"].every((table) => rollback.includes("DELETE FROM " + table)) && !rollback.includes("decision_log"), "rollback removes reversible audit rows and preserves append-only decisions", rollback);
ok(/returned 20 rows/.test(sql) && /not 60/.test(sql) && !/returned 60 rows/.test(sql), "evidence states the actual response sample size, not the requested limit");
let error = null;
try { db.exec(sql); db.exec(sql); } catch (e) { error = String(e?.message || e); }
ok(error === null, "migration replays idempotently", error);
const capability = db.prepare("SELECT * FROM capability_ledger WHERE capability = ?").get("q08-run-stage-attribution");
const decision = db.prepare("SELECT * FROM decision_log WHERE action LIKE 'Q08-RUN-STAGE-ATTRIBUTION-1:%'").get();
ok(capability && /panel_calls/.test(capability.provenance) && /factcheck_calls/.test(capability.provenance), "stage attribution capability is recorded once", capability);
ok(decision && /20 rows/.test(decision.evidence) && /verify_calls/.test(decision.action) && decision.outcome === "pending post-deploy measurement", "decision preserves the evidence and leaves the live outcome pending", decision);
const correction = db.prepare("SELECT * FROM decision_log WHERE action LIKE 'Q08-WRITER-YIELD-EVIDENCE-CORRECTION-1:%'").get();
ok(correction && /non-attributable/.test(correction.evidence) && /16:53:13Z/.test(correction.evidence), "historical sample correction preserves a timestamped non-attributable baseline");
ok(db.prepare("SELECT COUNT(*) n FROM failure_modes").get().n === 1 && db.prepare("SELECT COUNT(*) n FROM belief_registry").get().n === 1, "failure mode and belief replay once");
const contracts = db.prepare("SELECT * FROM remediation_contracts").all();
ok(contracts.length === 2 && contracts.every((c) => c.verify_transport === "d1-query@q08-signal" && c.expected_cadence_h === 1), "failure mode and belief have hourly Q08 probes");
for (const c of contracts) {
  ok(/^SELECT /i.test(c.verify_probe) && !/;|\b(insert|update|delete|drop|alter|create|pragma)\b/i.test(c.verify_probe), c.class + " is a read-only probe");
  const runs = new DatabaseSync(":memory:");
  runs.exec("CREATE TABLE engine_runs (id INTEGER PRIMARY KEY, status TEXT, verify_calls INTEGER, panel_calls INTEGER, factcheck_calls INTEGER)");
  const probe = () => runs.prepare(c.verify_probe).get();
  runs.exec("INSERT INTO engine_runs VALUES (1, 'gate_failed', 10, NULL, NULL)");
  ok(probe().observed === "pending: no reviewer-call row yet", c.class + " does not pass on historical unmetered rows");
  runs.exec("INSERT INTO engine_runs VALUES (2, 'deferred', 0, 0, 0)");
  ok(probe().observed !== "ok", c.class + " does not mistake a zero-call deferral for exercised reviewer attribution");
  runs.exec("INSERT INTO engine_runs VALUES (3, 'gate_failed', 5, 2, 3), (4, 'running', NULL, NULL, NULL), (5, 'error', NULL, NULL, NULL)");
  ok(probe().observed === "ok", c.class + " accepts real split totals and ignores unmetered async placeholders");
  runs.exec("INSERT INTO engine_runs VALUES (6, 'ok', 5, 2, 2)");
  ok(probe().observed === "stage-call totals mismatch", c.class + " detects a broken sum");
  runs.exec("DELETE FROM engine_runs WHERE id = 6; INSERT INTO engine_runs VALUES (6, 'skipped', 0, NULL, NULL)");
  ok(probe().observed === "stage-call totals mismatch", c.class + " detects lost counters after bootstrap");
  runs.close();
}
db.exec(rollback);
ok(db.prepare("SELECT COUNT(*) n FROM capability_ledger").get().n === 0, "rollback removes the capability row");
ok(["failure_modes", "belief_registry", "remediation_contracts"].every((table) => db.prepare("SELECT COUNT(*) n FROM " + table).get().n === 0), "rollback removes all added detector and belief rows");
ok(db.prepare("SELECT COUNT(*) n FROM decision_log").get().n === 2, "both append-only decisions remain after rollback");

console.log("q08-run-cost-observability.test.mjs: " + pass + " passed, " + fail + " failed");
if (fail) process.exit(1);
